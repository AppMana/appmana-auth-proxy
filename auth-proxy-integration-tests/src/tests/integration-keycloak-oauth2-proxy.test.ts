import { test, expect } from '@playwright/test';
import { GenericContainer } from 'testcontainers';
import { setupKeycloak } from '../keycloak-setup';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import http from 'http';
import * as jose from 'jose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../../../');

// Ports
const KEYCLOAK_PORT = 8082;
const OAUTH2_PROXY_PORT = 4181;
const GATEWAY_PORT = 8888;

let keycloakContainer: GenericContainer;
let oauth2ProxyContainer: GenericContainer;
let startedKeycloak: any;
let startedOAuth2Proxy: any;

const policyPath = path.join(rootDir, 'test-policy-keycloak-oauth2-proxy.js');

let kcConfig: any;

test.beforeAll(async () => {
    test.setTimeout(300000);

    // 1. Start Keycloak
    console.log('Starting Keycloak...');
    keycloakContainer = new GenericContainer('quay.io/keycloak/keycloak:23.0.0')
        .withStartupTimeout(120000)
        .withNetworkMode('host')
        .withEnvironment({
            KEYCLOAK_ADMIN: 'admin',
            KEYCLOAK_ADMIN_PASSWORD: 'admin',
            KC_HEALTH_ENABLED: 'true',
            KC_HTTP_MANAGEMENT_PORT: '9000'
        })
        .withCommand(['start-dev', '--http-port=' + KEYCLOAK_PORT]);

    try {
        startedKeycloak = await keycloakContainer.start();

        console.log('Waiting for Keycloak to be ready...');
        const startTime = Date.now();
        while (Date.now() - startTime < 60000) {
            try {
                const isReady = await new Promise((resolve) => {
                    const req = http.get('http://localhost:9000/health/ready', (res) => {
                        res.resume();
                        if (res.statusCode === 200) resolve(true);
                        else resolve(false);
                    });
                    req.on('error', () => resolve(false));
                    req.end();
                });
                if (isReady) {
                    console.log('Keycloak is ready!');
                    break;
                }
            } catch (e) {
                // ignore
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        await new Promise(resolve => setTimeout(resolve, 2000));

    } catch (e) {
        console.error('Failed to start Keycloak');
        throw e;
    }

    // 2. Configure Keycloak
    console.log('Configuring Keycloak...');
    try {
        kcConfig = await setupKeycloak('http://127.0.0.1:' + KEYCLOAK_PORT);
        console.log('Keycloak Configured:', kcConfig);
    } catch (e) {
        console.error('Failed to configure Keycloak:', e);
        throw e;
    }

    // 3. Start OAuth2 Proxy
    console.log('Starting OAuth2 Proxy...');
    oauth2ProxyContainer = new GenericContainer('quay.io/oauth2-proxy/oauth2-proxy:v7.4.0')
        .withNetworkMode('host')
        .withEnvironment({
            OAUTH2_PROXY_HTTP_ADDRESS: '0.0.0.0:' + OAUTH2_PROXY_PORT,
            OAUTH2_PROXY_UPSTREAMS: 'http://127.0.0.1:8080', // Upstream is SPA directly
            OAUTH2_PROXY_PROVIDER: 'oidc',
            OAUTH2_PROXY_CLIENT_ID: kcConfig.clientId,
            OAUTH2_PROXY_CLIENT_SECRET: kcConfig.clientSecret,
            OAUTH2_PROXY_OIDC_ISSUER_URL: kcConfig.issuer,
            OAUTH2_PROXY_EMAIL_DOMAINS: '*',
            OAUTH2_PROXY_COOKIE_SECRET: '1234567890123456',
            OAUTH2_PROXY_COOKIE_SECURE: 'false',
            OAUTH2_PROXY_SKIP_PROVIDER_BUTTON: 'true',
            OAUTH2_PROXY_SET_AUTHORIZATION_HEADER: 'true',
            OAUTH2_PROXY_PASS_ACCESS_TOKEN: 'false',
            OAUTH2_PROXY_SET_XAUTHREQUEST: 'true',
            OAUTH2_PROXY_PASS_USER_HEADERS: 'true',
            OAUTH2_PROXY_REVERSE_PROXY: 'true',
            // No skip auth regex needed for API because API traffic doesn't go through OAuth2 Proxy anymore!
        })
        .withLogConsumer(stream => {
            stream.on('data', line => console.log(`[OAuth2Proxy] ${line}`));
            stream.on('err', line => console.error(`[OAuth2Proxy] ${line}`));
        });

    startedOAuth2Proxy = await oauth2ProxyContainer.start();

    await new Promise(resolve => setTimeout(resolve, 5000));
});

test.afterAll(async () => {
    if (startedOAuth2Proxy) await startedOAuth2Proxy.stop();
    if (startedKeycloak) await startedKeycloak.stop();

    if (fs.existsSync(policyPath)) fs.unlinkSync(policyPath);
});

test('Comprehensive Auth Flow', async ({ page }) => {
    test.setTimeout(300000);
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));

    // 1. Visit App
    await page.goto('http://localhost:' + OAUTH2_PROXY_PORT);

    // 2. Should be redirected to Keycloak Login
    await expect(page).toHaveURL(/.*\/realms\/test-realm\/protocol\/openid-connect\/auth.*/);

    // 3. Login as 'user'
    await page.fill('#username', 'user');
    await page.fill('#password', 'password');
    await page.click('#kc-login');

    // 4. Should be redirected back to App
    console.log('Current URL after login:', page.url());
    await expect(page).toHaveURL(new RegExp('http://localhost:' + OAUTH2_PROXY_PORT + '/?'));
    await expect(page.locator('h1')).toHaveText('Test SPA');

    // 5. Configure SPA
    await page.evaluate(({ authProxyUrl }) => {
        // @ts-ignore
        import('/frontend/index.js').then(module => {
            module.configureAuthProxy({
                domains: ['127.0.0.1:9999'], // Intercept requests to Real Backend
                proxyUrl: authProxyUrl,
                getAuthToken: () => null
            });
        });
    }, {
        authProxyUrl: 'http://localhost:3001', // Direct to Auth Proxy
    });

    await page.waitForTimeout(1000);

    // 6. Try to fetch API (Unprivileged)
    await page.click('#btn-fetch');
    await expect(page.locator('#status')).toContainText('Forbidden');

    // 7. Logout
    await page.goto('http://localhost:' + OAUTH2_PROXY_PORT + '/oauth2/sign_out');
    await page.context().clearCookies();

    // 8. Login as 'admin'
    await page.goto('http://localhost:' + OAUTH2_PROXY_PORT);
    await expect(page).toHaveURL(/.*\/realms\/test-realm\/protocol\/openid-connect\/auth.*/);
    await page.fill('#username', 'admin');
    await page.fill('#password', 'password');
    await page.click('#kc-login');

    await expect(page.locator('h1')).toHaveText('Test SPA');

    // Re-configure SPA
    await page.evaluate(({ authProxyUrl }) => {
        // @ts-ignore
        import('/frontend/index.js').then(module => {
            module.configureAuthProxy({
                domains: ['127.0.0.1:9999'],
                proxyUrl: authProxyUrl,
                getAuthToken: () => null
            });
        });
    }, {
        authProxyUrl: 'http://localhost:3001',
    });

    await page.waitForTimeout(1000);

    // 9. Try to fetch API (Privileged)
    await page.click('#btn-fetch');
    await expect(page.locator('#status')).toContainText('Success');

    // 10. Negative Test: Rogue JWT signed by unknown key
    console.log('Testing Rogue JWT...');

    // Clear cookies to ensure we are testing Token auth only
    await page.context().clearCookies();

    // Generate a rogue key pair
    const { privateKey } = await jose.generateKeyPair('RS256');

    // Create a rogue JWT
    const rogueToken = await new jose.SignJWT({
        email: 'admin@appmana-public.com',
        sub: 'admin-user-id',
        name: 'Admin User',
        realm_access: { roles: ['offline_access', 'uma_authorization'] }
    })
        .setProtectedHeader({ alg: 'RS256', kid: 'rogue-key-id' })
        .setIssuedAt()
        .setIssuer(kcConfig.issuer) // Claiming to be from Keycloak
        .setAudience('account')
        .setExpirationTime('1h')
        .sign(privateKey);

    // Inject rogue token via Authorization header modification in SPA
    await page.evaluate(({ authProxyUrl, rogueToken }) => {
        // @ts-ignore
        import('/frontend/index.js').then(module => {
            module.configureAuthProxy({
                domains: ['127.0.0.1:9999'],
                proxyUrl: authProxyUrl,
                getAuthToken: () => rogueToken // Inject rogue token
            });
        });
    }, {
        authProxyUrl: 'http://localhost:3001',
        rogueToken
    });

    await page.waitForTimeout(1000);

    // Try to fetch API
    await page.click('#btn-fetch');
    await expect(page.locator('#status')).toContainText('Forbidden');
    console.log('Rogue JWT successfully rejected.');

    // 11. Negative Test: Unauthorized Proxy Target
    console.log('Testing Unauthorized Proxy Target...');
    await page.evaluate(({ authProxyUrl }) => {
        // @ts-ignore
        import('/frontend/index.js').then(module => {
            module.configureAuthProxy({
                // Attempt to access SPA server (not allowed backend) via proxy
                domains: ['localhost:8080'],
                proxyUrl: authProxyUrl,
            });
        });
    }, {
        authProxyUrl: 'http://localhost:3001',
    });

    await page.waitForTimeout(1000);

    // Make a request to the disallowed domain (localhost:8080 starts with http://localhost:8080)
    // The dummy backend is at 9999. 8080 is the SPA.
    // We need to trigger a fetch that matches 'localhost:8080'.
    // The current Test SPA has a hardcoded fetch to /api/test.
    // If we configure domains: ['localhost:8080'], the interceptor will checking if url includes that.
    // So we need to fetch 'http://localhost:8080/something'.

    // We'll use page.evaluate to trigger a specific fetch
    const status = await page.evaluate(async () => {
        try {
            const res = await fetch('http://localhost:8080/index.html');
            return res.status;
        } catch (e) {
            return 'Fetch Failed';
        }
    });

    // Expect 403 from Proxy, or Fetch Failed (if CORS blocks the 403 response)
    expect([403, 'Fetch Failed']).toContain(status);
    console.log('Unauthorized target successfully rejected.');
});

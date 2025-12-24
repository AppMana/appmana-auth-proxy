
import { test, expect } from "@playwright/test";
import { GenericContainer, Wait } from "testcontainers";
import { setupKeycloak } from "../keycloak-setup";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import http from "http";
import * as dotenv from 'dotenv';
import { spawn } from "child_process";

// imports
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../../../");

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// PORTS
const KEYCLOAK_PORT = 8084;
const OAUTH2_PROXY_PORT = 4183;
const NGINX_PORT = 8085; // Mapped to container 80
const AUTH_PROXY_PORT = 3003;

let keycloakContainer: GenericContainer;
let oauth2ProxyContainer: GenericContainer;
let nginxContainer: GenericContainer;
let startedKeycloak: any;
let startedOAuth2Proxy: any;
let startedNginx: any;
let backendProcess: any;

let kcConfig: any;

test.beforeAll(async () => {
    test.setTimeout(300000);

    // 1. KEYCLOAK
    console.log("Starting Keycloak...");
    keycloakContainer = new GenericContainer("quay.io/keycloak/keycloak:23.0.0")
        .withStartupTimeout(120000)
        .withNetworkMode("host")
        .withEnvironment({
            KEYCLOAK_ADMIN: "admin",
            KEYCLOAK_ADMIN_PASSWORD: "admin",
            KC_HEALTH_ENABLED: "true",
            KC_HTTP_MANAGEMENT_PORT: "9002",
        })
        .withCommand(["start-dev", "--http-port=" + KEYCLOAK_PORT]);

    startedKeycloak = await keycloakContainer.start();

    // Wait for Keycloak
    console.log("Waiting for Keycloak to be ready...");
    const startTime = Date.now();
    while (Date.now() - startTime < 60000) {
        try {
            const isReady = await new Promise((resolve) => {
                const req = http.get("http://localhost:9002/health/ready", (res) => {
                    res.resume();
                    if (res.statusCode === 200) resolve(true);
                    else resolve(false);
                });
                req.on("error", () => resolve(false));
                req.end();
            });
            if (isReady) {
                console.log("Keycloak is ready!");
                break;
            }
        } catch (e) { }
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));

    kcConfig = await setupKeycloak("http://127.0.0.1:" + KEYCLOAK_PORT);

    // 2. AUTH PROXY BACKEND (Running locally)
    console.log("Starting Auth Proxy Backend...");
    const backendEntry = path.join(rootDir, "auth-proxy-backend/build/index.js");
    const backendArgs = [
        backendEntry,
        "--port", String(AUTH_PROXY_PORT),
        "--well-known-all-backends",
        "--authorize", JSON.stringify({
            issuer: kcConfig.issuer,
            audience: kcConfig.clientId,
            domains: ["generativelanguage.googleapis.com"]
        }),
        "--allowed-domains", "generativelanguage.googleapis.com"
    ];

    backendProcess = spawn("node", backendArgs, {
        env: {
            ...process.env,
            GEMINI_API_KEY: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "dummy",
            // We rely on Header Auth, but Cipher init might still log if secret missing using existing code?
            // Actually updated code allows missing secret? 
            // index.ts: "OAUTH2_PROXY_COOKIE_SECRET not provided, decryption will be unavailable." -> Warning only.
        },
        stdio: "inherit"
    });

    await new Promise(r => setTimeout(r, 2000));

    // 3. NGINX
    // We need to provide a config that proxies /auth-proxy/ to localhost:3003
    // Since Nginx is in a container with "host" network mode, it can reach localhost:3003.
    console.log("Starting Nginx...");

    const nginxConf = `
    server {
        listen 80;
        server_name localhost;
        
        location / {
            root /usr/share/nginx/html;
            index index.html;
            try_files $uri $uri/ /index.html;
        }

        location /auth-proxy/ {
            proxy_pass http://127.0.0.1:${AUTH_PROXY_PORT}/;
            proxy_set_header Host $host;
            # Authorization header is passed by default
        }
    }
  `;
    const nginxConfPath = path.join(__dirname, "temp_nginx.conf");
    fs.writeFileSync(nginxConfPath, nginxConf);

    const spaHtml = `
    <html><body><h1>Header Auth SPA</h1></body></html>
  `;
    const indexHtmlPath = path.join(__dirname, "temp_index.html");
    fs.writeFileSync(indexHtmlPath, spaHtml);

    nginxContainer = new GenericContainer("nginx:alpine")
        .withNetworkMode("host")
        // Map port 80 to NGINX_PORT? 
        // Wait, network mode host means it binds to port 80 inside the container which IS port 80 on host usually?
        // No, host mode means container shares host network stack.
        // So if Nginx listens on 80, it listens on Host 80.
        // We want it to listen on NGINX_PORT.
        // We must modify the config to listen on NGINX_PORT.
        ;

    // Rewrite config to use NGINX_PORT
    const nginxConfWithPort = nginxConf.replace("listen 80;", `listen ${NGINX_PORT};`);
    fs.writeFileSync(nginxConfPath, nginxConfWithPort);

    nginxContainer
        .withCopyFilesToContainer([
            { source: nginxConfPath, target: "/etc/nginx/conf.d/default.conf" },
            { source: indexHtmlPath, target: "/usr/share/nginx/html/index.html" }
        ]);

    startedNginx = await nginxContainer.start();
    // With host mode, it should be listening on localhost:NGINX_PORT

    // 4. OAUTH2 PROXY
    console.log("Starting OAuth2 Proxy...");
    oauth2ProxyContainer = new GenericContainer("quay.io/oauth2-proxy/oauth2-proxy:v7.6.0")
        .withNetworkMode("host")
        .withEnvironment({
            OAUTH2_PROXY_HTTP_ADDRESS: "0.0.0.0:" + OAUTH2_PROXY_PORT,
            OAUTH2_PROXY_UPSTREAMS: `http://127.0.0.1:${NGINX_PORT}`, // Points to Nginx
            OAUTH2_PROXY_PROVIDER: "oidc",
            OAUTH2_PROXY_CLIENT_ID: kcConfig.clientId,
            OAUTH2_PROXY_CLIENT_SECRET: kcConfig.clientSecret,
            OAUTH2_PROXY_OIDC_ISSUER_URL: kcConfig.issuer,
            OAUTH2_PROXY_EMAIL_DOMAINS: "*",
            OAUTH2_PROXY_COOKIE_SECRET: "1234567890123456",
            OAUTH2_PROXY_COOKIE_SECURE: "false",
            OAUTH2_PROXY_SKIP_PROVIDER_BUTTON: "true",
            OAUTH2_PROXY_SET_AUTHORIZATION_HEADER: "true", // CRITICAL setting
            OAUTH2_PROXY_PASS_ACCESS_TOKEN: "false", // We want ID Token (default for OIDC?) or Access Token?
            // "set-authorization-header" sets "Authorization: Bearer <session.IDToken>" by default if OIDC?
            // Or does it pass the Access Token?
            // Docs: "When true, pass the Authorization header X-Forwarded-Access-Token ... wait."
            // Actually: --set-authorization-header=true -> "set Authorization: Bearer <token>"
            // Which token? Usually ID Token for OIDC provider unless --pass-access-token is set?
            // Let's assume ID Token. Our Backend validates ID Tokens (JWTs from Keycloak).
            OAUTH2_PROXY_OID_ISSUER_URL: kcConfig.issuer // Typo fix just in case? No, OIDC_ISSUER_URL is correct.
        });

    startedOAuth2Proxy = await oauth2ProxyContainer.start();

    await new Promise(r => setTimeout(r, 5000));
});

test.afterAll(async () => {
    if (backendProcess) backendProcess.kill();
    if (startedNginx) await startedNginx.stop();
    if (startedOAuth2Proxy) await startedOAuth2Proxy.stop();
    if (startedKeycloak) await startedKeycloak.stop();

    // Cleanup temps
    try {
        fs.unlinkSync(path.join(__dirname, "temp_nginx.conf"));
        fs.unlinkSync(path.join(__dirname, "temp_index.html"));
    } catch (e) { }
});

test("Header-Based Auth Integration", async ({ page }) => {
    test.setTimeout(120000);

    // Check keys
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
        test.skip();
        return;
    }

    // 1. Visit App via OAuth2 Proxy
    await page.goto(`http://localhost:${OAUTH2_PROXY_PORT}`);

    // 2. Login
    await expect(page).toHaveURL(/.*\/realms\/test-realm\/protocol\/openid-connect\/auth.*/);
    await page.fill("#username", "user");
    await page.fill("#password", "password");
    await page.click("#kc-login");

    // 3. Should land at Nginx SPA
    await expect(page.locator("h1")).toHaveText("Header Auth SPA");

    // 4. Inject Client Logic
    // We inject the client script and configuration.
    const frontendDist = path.join(rootDir, "auth-proxy-frontend/dist/auth-proxy.global.js");
    const frontendScript = fs.readFileSync(frontendDist, 'utf-8');

    await page.evaluate(({ scriptContent }) => {
        // Inject script
        const script = document.createElement('script');
        script.text = scriptContent;
        document.head.appendChild(script);

        // Setup modules
        // We can't import modules easily in evaluate without a script tag type=module.
        // But we can trigger logic via a new script tag we inject.
    }, { scriptContent: frontendScript });

    // We basically rewrite the page content to include our test logic
    // But we are ALREADY on the page served by Nginx (via OAuth2 Proxy).
    // The previous test intercepted the route. HERE WE ARE SERVING REAL CONTENT from Nginx.
    // The "temp_index.html" was just <h1>.
    // We want to verify the API call.

    // Let's use page.evaluate to run the fetch.
    const result = await page.evaluate(async (proxyUrl) => {
        const { configureAuthProxy } = (window as any).AppManaAuthProxy;

        configureAuthProxy({
            domains: ['generativelanguage.googleapis.com'],
            proxyUrl: proxyUrl,
            getAuthToken: () => null // Header provided by OAuth2 Proxy
        });

        // Manually fetch to verify interception and success
        // Simulating the SDK call
        try {
            // We use the proxyUrl + encoded target?
            // Wait, the SDK makes requests to https://generativelanguage...
            // The Interceptor catches it and rewrites to proxyUrl.

            // We don't include the key path param because we rely on the proxy injecting the header.
            // Google supports x-goog-api-key header.
            const targetUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent";

            const response = await fetch(targetUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: "Reply with just 'OK' for testing" }] }] })
            });

            const text = await response.text();
            return { status: response.status, text };
        } catch (e: any) {
            return { error: e.toString() };
        }
    }, `http://localhost:${OAUTH2_PROXY_PORT}/auth-proxy/`);

    // Wait, `window.location.origin + '/auth-proxy/'` is correct if we are on the page.
    // The page URL is `http://localhost:${OAUTH2_PROXY_PORT}/`
    // So `proxyUrl` = `http://localhost:${OAUTH2_PROXY_PORT}/auth-proxy/`.
    // Valid.

    console.log("Result:", result);

    expect(result.status).toBe(200);
    expect(result.text).toContain("OK");
});

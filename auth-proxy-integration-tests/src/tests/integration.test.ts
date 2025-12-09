import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

test.describe.configure({ mode: 'serial' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../../../');
const policyPath = path.join(rootDir, 'test-policy-integration.js');

test.beforeAll(async () => {
    // Create initial policy file
    const policyCode = `
    module.exports = async (context) => {
        console.log('POLICY EVAL: User:', context.user);
        console.log('POLICY EVAL: Headers:', context.request.headers);
        
        if (context.request.headers['authorization'] === 'Bearer mock-token-from-spa') {
             console.log('POLICY MATCHED!');
             return {
                decision: 'ALLOW',
                modifiedRequest: {
                    headers: {
                        'authorization': 'Bearer REAL_API_KEY'
                    }
                }
            };
        }
        console.log('POLICY DENIED');
        return { decision: 'DENY' };
    };
    `;
    fs.writeFileSync(policyPath, policyCode);
});

test.afterAll(async () => {
    if (fs.existsSync(policyPath)) {
        fs.unlinkSync(policyPath);
    }
});

test.beforeEach(async ({ page }) => {
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err));
    page.on('requestfailed', req => console.log('REQUEST FAILED:', req.url(), req.failure()?.errorText));
});



test.beforeAll(async () => {
    // Create initial policy file
    // ... (existing code, implied preserved by not replacing it if I target carefully)
    // Wait, I need to match valid block.
    // Let's just add timeout in the test body.
});

// ...

test('Interception and Proxying (Fetch)', async ({ page }) => {
    await page.waitForTimeout(2000); // Wait for policy load
    await page.goto('http://localhost:8080');

    await page.click('#btn-fetch');

    await expect(page.locator('#status')).toContainText('Fetch: {"message":"Success","authorized":true}');
});

test('Interception and Proxying (XHR)', async ({ page }) => {
    await page.goto('http://localhost:8080');
    await page.click('#btn-xhr');
    await expect(page.locator('#status')).toContainText('XHR: {"message":"Success","authorized":true}');
});

test('Non-interception', async ({ page }) => {
    await page.goto('http://localhost:8080');

    // We need a button to test non-interception in the SPA
    // Let's inject a script to test it dynamically
    const result = await page.evaluate(async () => {
        try {
            // Fetch from a domain not in the config (e.g., localhost:8080 itself, or just a relative path)
            // The config only has 127.0.0.1:9999
            const res = await fetch('/frontend/index.js');
            return { status: res.status, url: res.url };
        } catch (e: any) {
            return { error: e.message };
        }
    });

    // Should be 200 and URL should be original (not proxied)
    expect(result.status).toBe(200);
    expect(result.url).toContain('http://localhost:8080/frontend/index.js');
});

test('Policy Matrix & Claims', async ({ page }) => {
    // Update policy to check for specific claims
    const policyCode = `
    module.exports = async (context) => {
        // Check for a specific claim in the "user" object (decoded token)
        // In our test, we don't have a real token with claims, but we can mock the user object if we had a real token.
        // Since we use skip-verify and just decode, if we send a token that decodes to something, we can test it.
        // But we are sending 'mock-token-from-spa' which is not a valid JWT, so jwt.decode returns null.
        // Let's update the SPA to send a dummy JWT.
        
        // For now, let's test based on a custom header we can inject from the SPA for testing purposes?
        // Or better, let's update the policy to check for a specific header value that simulates a claim.
        
        if (context.request.headers['x-test-role'] === 'admin') {
             return {
                decision: 'ALLOW',
                modifiedRequest: {
                    headers: {
                        'x-authenticated-role': 'admin'
                    }
                }
            };
        }
        return { decision: 'DENY' };
    };
    `;
    fs.writeFileSync(policyPath, policyCode);

    await page.waitForTimeout(2000);
    await page.goto('http://localhost:8080');

    // Test Deny (missing role)
    const resultDeny = await page.evaluate(async () => {
        try {
            const res = await fetch('http://127.0.0.1:9999/api/test');
            return { status: res.status };
        } catch (e: any) {
            return { error: e.message };
        }
    });
    // Expect 403 (Forbidden)
    // Note: fetch doesn't throw on 403, so resultDeny.status should be 403.
    // But wait, the proxy returns 403.
    expect(resultDeny.status).toBe(403);

    // Test Allow (with role)
    const resultAllow = await page.evaluate(async () => {
        try {
            const res = await fetch('http://127.0.0.1:9999/api/test', {
                headers: { 'X-Test-Role': 'admin' }
            });
            const data = await res.json();
            return { status: res.status, data };
        } catch (e: any) {
            return { error: e.message };
        }
    });

    expect(resultAllow.status).toBe(200);
    // The dummy backend echoes headers if we ask it to? 
    // The dummy backend /api/test returns { message: 'Unauthorized', authorized: false } unless Authorization header is REAL_API_KEY.
    // Our policy didn't inject REAL_API_KEY this time! It injected x-authenticated-role.
    // So the backend will return Unauthorized (200 OK but body says unauthorized).
    // We should check if the backend received the header.
    // Let's use /api/echo endpoint of dummy backend.

    const resultEcho = await page.evaluate(async () => {
        try {
            const res = await fetch('http://127.0.0.1:9999/api/echo', {
                headers: { 'X-Test-Role': 'admin' }
            });
            const data = await res.json();
            return { status: res.status, data };
        } catch (e: any) {
            return { error: e.message };
        }
    });

    expect(resultEcho.status).toBe(200);
    expect(resultEcho.data.headers['x-authenticated-role']).toBe('admin');
});

test('Policy Denial', async ({ page }) => {
    // Update policy to deny
    const policyCode = `
    module.exports = async (context) => {
        return { decision: 'DENY' };
    };
    `;
    fs.writeFileSync(policyPath, policyCode);

    // Wait for reload (chokidar might take a moment)
    await page.waitForTimeout(2000);

    await page.goto('http://localhost:8080');
    await page.click('#btn-fetch');

    // Expect 403 Forbidden response.
    // The SPA catches errors and prints "Fetch Error: ..." or displays the response.
    // Our SPA code:
    // const res = await fetch(...)
    // const data = await res.json();
    // statusDiv.innerText = 'Fetch: ' + JSON.stringify(data);

    // If backend returns 403 with { error: 'Forbidden' }:
    // Fetch succeeds (no throw).
    // data = { error: 'Forbidden' }
    // Text: Fetch: {"error":"Forbidden"}

    await expect(page.locator('#status')).toContainText('Forbidden');
});

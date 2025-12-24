
import { test, expect } from "@playwright/test";
import { GenericContainer } from "testcontainers";
import { setupKeycloak } from "../keycloak-setup";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import http from "http";
import * as dotenv from 'dotenv';
import { spawn } from "child_process";



const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../../../");

// Load env after defining __dirname
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const KEYCLOAK_PORT = 8083; // Different port to avoid collision
const OAUTH2_PROXY_PORT = 4182;
const AUTH_PROXY_PORT = 3002;

let keycloakContainer: GenericContainer;
let oauth2ProxyContainer: GenericContainer;
let startedKeycloak: any;
let startedOAuth2Proxy: any;
let backendProcess: any;

let kcConfig: any;

test.beforeAll(async () => {
    test.setTimeout(300000);

    // 1. Start Keycloak
    console.log("Starting Keycloak configured for Gemini Repro...");
    keycloakContainer = new GenericContainer("quay.io/keycloak/keycloak:23.0.0")
        .withStartupTimeout(120000)
        .withNetworkMode("host")
        .withEnvironment({
            KEYCLOAK_ADMIN: "admin",
            KEYCLOAK_ADMIN_PASSWORD: "admin",
            KC_HEALTH_ENABLED: "true",
            KC_HTTP_MANAGEMENT_PORT: "9001", // Different status port
        })
        .withCommand(["start-dev", "--http-port=" + KEYCLOAK_PORT]);

    startedKeycloak = await keycloakContainer.start();

    // Wait for Keycloak
    console.log("Waiting for Keycloak to be ready...");
    const startTime = Date.now();
    while (Date.now() - startTime < 60000) {
        try {
            const isReady = await new Promise((resolve) => {
                const req = http.get("http://localhost:9001/health/ready", (res) => {
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
        } catch (e) {
            // ignore
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));

    // 2. Configure Keycloak
    console.log("Configuring Keycloak...");
    kcConfig = await setupKeycloak("http://127.0.0.1:" + KEYCLOAK_PORT);

    // 3. Start OAuth2 Proxy
    console.log("Starting OAuth2 Proxy...");
    oauth2ProxyContainer = new GenericContainer("quay.io/oauth2-proxy/oauth2-proxy:v7.6.0")
        .withNetworkMode("host")
        .withEnvironment({
            OAUTH2_PROXY_HTTP_ADDRESS: "0.0.0.0:" + OAUTH2_PROXY_PORT,
            OAUTH2_PROXY_UPSTREAMS: "http://127.0.0.1:8081", // Dummy upstream
            OAUTH2_PROXY_PROVIDER: "oidc",
            OAUTH2_PROXY_CLIENT_ID: kcConfig.clientId,
            OAUTH2_PROXY_CLIENT_SECRET: kcConfig.clientSecret,
            OAUTH2_PROXY_OIDC_ISSUER_URL: kcConfig.issuer,
            OAUTH2_PROXY_EMAIL_DOMAINS: "*",
            OAUTH2_PROXY_COOKIE_SECRET: "1234567890123456",
            OAUTH2_PROXY_COOKIE_SECURE: "false",
            OAUTH2_PROXY_SKIP_PROVIDER_BUTTON: "true",
            OAUTH2_PROXY_SET_AUTHORIZATION_HEADER: "false",
            OAUTH2_PROXY_PASS_ACCESS_TOKEN: "false",
            OAUTH2_PROXY_SET_XAUTHREQUEST: "true",
            OAUTH2_PROXY_PASS_USER_HEADERS: "true",
            OAUTH2_PROXY_REVERSE_PROXY: "true",
            OAUTH2_PROXY_SESSION_COOKIE_MINIMAL: "true",
        });

    startedOAuth2Proxy = await oauth2ProxyContainer.start();

    // 4. Start Auth Proxy Backend locally
    console.log("Starting Auth Proxy Backend...");
    const backendEntry = path.join(rootDir, "auth-proxy-backend/build/index.js");

    // Construct arguments
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

    console.log("Backend Args:", backendArgs);

    backendProcess = spawn("node", backendArgs, {
        env: {
            ...process.env,
            // Inject the key from .env (loaded by dotenv above)
            GEMINI_API_KEY: process.env.GEMINI_API_KEY,
            OAUTH2_PROXY_COOKIE_SECRET: "1234567890123456",
            // Debug logs
            utils_log_level: "debug",
        },
        stdio: "inherit"
    });

    await new Promise(r => setTimeout(r, 5000));
});

test.afterAll(async () => {
    if (backendProcess) backendProcess.kill();
    if (startedOAuth2Proxy) await startedOAuth2Proxy.stop();
    if (startedKeycloak) await startedKeycloak.stop();
});

test("Gemini API Proxy Reproduction", async ({ page }) => {
    test.setTimeout(120000);

    // Check for API Key
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
        console.log("Skipping Gemini Test: No GEMINI_API_KEY or GOOGLE_API_KEY provided.");
        test.skip();
        return;
    }

    // 1. Visit OAuth2 Proxy to Login
    await page.goto(`http://localhost:${OAUTH2_PROXY_PORT}`);

    // Login flow
    await expect(page).toHaveURL(/.*\/realms\/test-realm\/protocol\/openid-connect\/auth.*/);
    await page.fill("#username", "user");
    await page.fill("#password", "password");
    await page.click("#kc-login");

    // Should be redirected back (upstream is irrelevant as we inject HTML manually)
    // We expect some error page from OAuth2 Proxy because upstream 8081 might not exist?
    // Actually we didn't start an upstream. 
    // But we have the cookie now.

    // 2. Inject the SPA HTML that reproduces the issue
    // We use data: URL or setContent, but we need origin to be localhost:4182 to match cookie domain usually?
    // OAuth2 Proxy cookies are on the domain.
    // We'll serve the SPA on localhost:OAUTH2_PROXY_PORT/spa via interception or just rely on the cookie being on localhost?
    // Cookies are domain based. localhost:OAUTH2_PROXY_PORT is the origin.
    // If we simply goto `http://localhost:${OAUTH2_PROXY_PORT}/` again, we get 502/503 if upstream down.

    // Read local frontend build
    const frontendDist = path.join(rootDir, "auth-proxy-frontend/dist/auth-proxy.global.js");
    const frontendScript = fs.readFileSync(frontendDist, 'utf-8');

    // We will serve the SPA content by mocking the upstream response
    await page.route(`http://localhost:${OAUTH2_PROXY_PORT}/gemini-spa`, route => {
        route.fulfill({
            status: 200,
            contentType: 'text/html',
            body: `
<!DOCTYPE html>
<html>
<head>
  <title>Gemini Debug</title>
  <script>
    ${frontendScript}
  </script>
</head>
<body>
<h1>Gemini Repro</h1>
<p id="status">Waiting...</p>
<div id="result"></div>
<script type="module">
  import { GoogleGenAI } from "https://esm.sh/@google/genai";
  
  const { configureAuthProxy } = window.AppManaAuthProxy;
  
  // CONFIGURATION UNDER TEST: WITH TRAILING SLASH
  // Pointing to the backend port directly
  const PROXY_URL = "http://localhost:${AUTH_PROXY_PORT}/"; 
  
  configureAuthProxy({
    domains: ['generativelanguage.googleapis.com'],
    proxyUrl: PROXY_URL, 
    getAuthToken: () => null 
  });

  // Use the API Key from Env (but we use the proxy)
  // The SDK requires an API Key. We pass a dummy one because we want the proxy to inject the real one
  // OR the proxy to handle it.
  // The backend "well-known-all-backends" injects the key?
  // Let's check "well-known-all-backends" logic.
  // It injects headers based on target.
  // For Gemini?
  
  const ai = new GoogleGenAI({ apiKey: "dummy-key" });
  
  async function run() {
      try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview', // User specified model
            contents: "Reply with just 'OK' for testing",
        });
        document.getElementById('result').innerText = JSON.stringify(response);
        document.getElementById('status').innerText = "Success";
      } catch (e) {
        document.getElementById('status').innerText = "Error: " + e.message;
        console.error(e);
      }
  }
  
  run();
</script>
</body>
</html>
            `
        });
    });

    // Navigate to the simulated SPA
    await page.goto(`http://localhost:${OAUTH2_PROXY_PORT}/gemini-spa`);

    // Wait for result
    await expect(page.locator("#status")).toHaveText("Success", { timeout: 30000 });

    // Verify content
    const resultText = await page.locator("#result").innerText();
    const resultJson = JSON.parse(resultText);
    // Check if candidates[0].content.parts[0].text contains "OK"
    // Note: Structure depends on Google GenAI response format.
    // Usually: { candidates: [ { content: { parts: [ { text: "OK" } ] } } ] }
    console.log("Gemini Response:", JSON.stringify(resultJson, null, 2));

    const generatedText = resultJson.candidates?.[0]?.content?.parts?.[0]?.text || "";
    expect(generatedText).toContain("OK");

    console.log("Gemini Test Passed!");
});

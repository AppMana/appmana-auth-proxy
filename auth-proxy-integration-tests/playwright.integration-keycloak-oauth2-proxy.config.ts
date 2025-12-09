import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './src/tests',
    testMatch: /integration-keycloak-oauth2-proxy\.test\.ts/,
    outputDir: './test-results',
    timeout: 120000,
    expect: {
        timeout: 10000
    },
    use: {
        baseURL: 'http://localhost:4181', // OAuth2 Proxy
        trace: 'on-first-retry',
    },
    webServer: [
        {
            command: 'PORT=9999 yarn start:dummy',
            port: 9999,
            reuseExistingServer: !process.env.CI,
            stdout: 'pipe',
            stderr: 'pipe',
        },
        {
            command: 'PORT=8080 yarn start:spa',
            port: 8080,
            reuseExistingServer: !process.env.CI,
            stdout: 'pipe',
            stderr: 'pipe',
        },
        {
            command: 'OAUTH2_PROXY_COOKIE_SECRET=1234567890123456 BACKEND_API_KEY=REAL_API_KEY yarn start:proxy:integration-keycloak-oauth2-proxy --allowed-domains 127.0.0.1:9999',
            port: 3001,
            reuseExistingServer: !process.env.CI,
            stdout: 'pipe',
            stderr: 'pipe',
        }
    ],
});

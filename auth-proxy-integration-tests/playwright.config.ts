import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./src/tests",
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  use: {
    baseURL: "http://localhost:8080",
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: "yarn start:dummy",
      port: 9999,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "PROXY_PORT=3000 yarn start:spa",
      port: 8080,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "PORT=8081 PROXY_PORT=3001 yarn start:spa",
      port: 8081,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "yarn start:proxy",
      port: 3000,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command:
        "OAUTH2_PROXY_COOKIE_SECRET=1234567890123456 BACKEND_API_KEY=REAL_API_KEY yarn start:proxy:integration-keycloak-oauth2-proxy --allowed-domains 127.0.0.1:9999",
      port: 3001,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});

# AppMana Auth Proxy

A secure authentication proxy system designed to hide API keys and manage authentication for Single Page Applications (SPAs).

## Features

- **Frontend Interception**: Automatically intercepts `fetch` and `XMLHttpRequest` to reroute requests through the proxy.
- **Backend Policy Engine**: Flexible JavaScript-based policies to authorize requests, verify tokens (JWT), and inject API keys.
- **OAuth2 Proxy Integration**: Seamlessly works with `oauth2-proxy` for OIDC authentication.
- **Cookie Decryption**: Helper utilities to decrypt `oauth2-proxy` cookies within policies.

## Architecture

The system uses a split-proxy architecture to segregate concerns:

1.  **OAuth2 Proxy**: Protects the Frontend (SPA). Handles user login/logout and sets a session cookie.
2.  **Auth Proxy Backend**: Protects the API. Verifies the session cookie (shared via domain) or JWT, validates policies, and injects API keys before forwarding to the real API.
3.  **Auth Proxy Frontend**: Runs in the SPA. Intercepts API requests and routes them to the Auth Proxy Backend.

## Installation

### Frontend

```bash
yarn add @appmana-public/auth-proxy-frontend
```

### Backend

```bash
yarn add @appmana-public/auth-proxy-backend
```

## Frontend Usage

### Script Tag (No Bundler)

You can use the bundled version directly in your HTML:

```html
<script src="https://unpkg.com/@appmana-public/auth-proxy-frontend/dist/auth-proxy.global.js"></script>
<script>
  AppManaAuthProxy.configureAuthProxy({
    domains: ["generativelanguage.googleapis.com"],
    proxyUrl: "https://auth-proxy.yourdomain.com",
    // Optional: Custom token retrieval
    // getAuthToken: () => 'my-token'
  });
</script>
```

### ES Module / Bundler

```javascript
import { configureAuthProxy } from "@appmana-public/auth-proxy-frontend";

configureAuthProxy({
  domains: ["generativelanguage.googleapis.com"],
  proxyUrl: "https://auth-proxy.yourdomain.com",
});
```

### Example: Google Generative AI

#### Before (Insecure - API Key in Frontend)

```javascript
import { GoogleGenerativeAI } from "@google/generative-ai";

// ⚠️ INSECURE: API Key exposed in frontend code
const genAI = new GoogleGenerativeAI("YOUR_API_KEY");
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

const result = await model.generateContent("Hello!");
```

#### After (Secure - Auth Proxy)

```javascript
import { GoogleGenerativeAI } from "@google/generative-ai";
import { configureAuthProxy } from "@appmana-public/auth-proxy-frontend";

// 1. Configure Proxy
configureAuthProxy({
  domains: ["generativelanguage.googleapis.com"], // Intercept requests to this domain
  proxyUrl: "https://auth-proxy.yourdomain.com",
});

// 2. Initialize Client without API Key (or with a dummy one if required by library validation)
// The proxy will inject the real key.
const genAI = new GoogleGenerativeAI("dummy-key");
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

// 3. Make requests as usual
const result = await model.generateContent("Hello!");
```

## Backend Usage

Start the backend server:

```bash
node node_modules/@appmana-public/auth-proxy-backend/build/index.js \
  --policy ./policy.js \
  --upstream https://api.yourdomain.com \
  --allowed-domains "*.yourdomain.com" "localhost:*"
```

**Note:** When running on `localhost` with `oauth2-proxy`, ensure both services run on the same domain (e.g. `localhost`) so cookies are shared. The frontend must be configured with `credentials: 'include'` (handled automatically by `@appmana-public/auth-proxy-frontend` when configured properly).

### Configuration Options

You can configure the backend via command line arguments, environment variables (prefixed with `AUTH_PROXY_`), or a JSON config file.

| Argument                  | Env Var                      | Description                                                                |
| ------------------------- | ---------------------------- | -------------------------------------------------------------------------- |
| `--policy`                | `AUTH_PROXY_POLICY`          | Path to policy file(s). Supports globs (e.g. `./policies/*.js`).           |
| `--port`                  | `AUTH_PROXY_PORT`            | Port to listen on (default: 3000).                                         |
| `--upstream`              | `AUTH_PROXY_UPSTREAM`        | Default upstream URL. Used if `X-Proxy-Target-Url` is missing.             |
| `--allowed-domains`       | `AUTH_PROXY_ALLOWED_DOMAINS` | Whitelist of allowed proxy targets (e.g. `*.example.com`). Supports globs. |
| `--authorize`             | N/A                          | JSON string config for simple authorization (repeatable).                  |
| `--print-frontend-config` | N/A                          | Print frontend `<script>` tag based on `--authorize` domains and exit.     |
| `--config`                | N/A                          | Path to JSON config file.                                                  |

### Simplified Authorization (`--authorize`)

For many use cases (checking Issuer, Audience, and Allowed Domains), you don't need to write a JavaScript policy file. You can use the `--authorize` argument.

**Example: Google Generative AI + Keycloak**

This example configures the proxy to:

1.  Verify tokens issued by your Keycloak.
2.  Allow access to Google Generative AI.
3.  Allow access to your internal API.

```bash
node node_modules/@appmana-public/auth-proxy-backend/build/index.js \
  --authorize '{"issuer": "https://auth.yourdomain.com/realms/myrealm", "audience": "my-app", "domains": ["generativelanguage.googleapis.com"]}' \
  --authorize '{"issuer": "https://auth.yourdomain.com/realms/myrealm", "audience": "my-app", "domains": ["api.internal.com"]}' \
  --port 3000
```

**Generate Frontend Config**

You can generate the required frontend initialization script based on your `--authorize` arguments:

```bash
node node_modules/@appmana-public/auth-proxy-backend/build/index.js \
  --authorize '{"domains": ["generativelanguage.googleapis.com"]}' \
  --print-frontend-config
```

**Output:**

```html
<script>
  // Generated by @appmana-public/auth-proxy-backend
  (async () => {
    const module = await import("https://unpkg.com/@appmana-public/auth-proxy-frontend/dist/auth-proxy.global.js");
    // Or use local import if available
    if (module && module.AppManaAuthProxy) {
      module.AppManaAuthProxy.configureAuthProxy({
        domains: ["generativelanguage.googleapis.com"],
        proxyUrl: window.location.origin, // Assuming auth proxy handles this domain
      });
    }
  })();
</script>
```

### Policy Examples

#### Authoring Policies with Autocomplete

To get IDE autocomplete and type checking in your policy files, you can use JSDoc to reference the types exported by `@appmana-public/auth-proxy-backend`.

**`policy.js`:**

```javascript
/**
 * @typedef {import('@appmana-public/auth-proxy-backend').PolicyContext} PolicyContext
 * @typedef {import('@appmana-public/auth-proxy-backend').PolicyResult} PolicyResult
 */

/**
 * @param {PolicyContext} context
 * @returns {Promise<PolicyResult>}
 */
module.exports = async (context) => {
  const { request, user, utils } = context;

  // IDE will now provide autocomplete for request, user, and utils
  console.log(request.method, request.url);

  return { allow: true };
};
```

#### 1. Cookie Decryption & Domain Check

Decrypts `oauth2-proxy` cookie and checks if email is `@appmana-public.com`.

```javascript
// policy.js
module.exports = async (context) => {
  const { request, utils } = context;
  const { cipher, parseCookies, joinCookieValues, jwt } = utils;

  const cookieHeader = request.headers["cookie"];
  if (!cookieHeader) return { allow: false };

  const cookies = parseCookies(cookieHeader);
  const encryptedCookie = joinCookieValues(cookies, "_oauth2_proxy");

  if (!encryptedCookie) return { allow: false };

  if (cipher) {
    try {
      const decrypted = cipher.decrypt(encryptedCookie);

      // Extract JWT or use email directly from decrypted content
      // The decrypted content structure depends on oauth2-proxy version/config
      const email = decrypted.email || decrypted.e; // simplistic check

      if (email && email.endsWith("@appmana-public.com")) {
        return {
          allow: true,
          modifiedRequest: {
            headers: {
              Authorization: `Bearer ${process.env.BACKEND_API_KEY}`,
            },
          },
        };
      }
    } catch (e) {
      console.error("Cookie decryption failed", e);
    }
  }
  return { allow: false };
};
```

#### 2. JWT Role Check

Verifies a JWT in the `Authorization` header and checks for 'admin' role.

```javascript
// policy.js
module.exports = async (context) => {
  const { request, utils } = context;
  const { jwt } = utils;

  const authHeader = request.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) return { allow: false };

  const token = authHeader.substring(7);
  const decoded = jwt.verify(token);

  if (decoded && decoded.roles && decoded.roles.includes("admin")) {
    return {
      allow: true,
      modifiedRequest: {
        headers: {
          "X-User-Role": "admin",
        },
      },
    };
  }
  return { allow: false };
};
```

## Infrastructure

### Docker

Build the backend image:

```bash
docker build -f appmana-auth-proxy/auth-proxy-backend/Dockerfile -t ghcr.io/appmana-public/auth-proxy-backend:latest .
```

### Kubernetes

A complete example with Nginx, OAuth2 Proxy, and Auth Proxy Backend is available in `k8s/deployment.yaml`.

## Development

### Monorepo Structure

- `appmana-auth-proxy/auth-proxy-frontend`: Frontend package
- `appmana-auth-proxy/auth-proxy-backend`: Backend package
- `appmana-auth-proxy/auth-proxy-integration-tests`: End-to-end tests

### Running Tests

#### Prerequisites

1.  **Node.js**: v18+
2.  **Yarn**: v4+ (Berry)
3.  **Docker**: Required for integration tests (runs Keycloak and OAuth2 Proxy containers).

#### Unit Tests

Run unit tests for individual packages:

```bash
# Backend
yarn workspace @appmana-public/auth-proxy-backend test

# Frontend
yarn workspace @appmana-public/auth-proxy-frontend test
```

#### Integration Tests

The integration tests verify the full flow including Keycloak, OAuth2 Proxy, and the Auth Proxy.

**Run all integration tests:**

```bash
yarn workspace @appmana-public/auth-proxy-integration-tests test
```

**Run specific suites:**

```bash
# Run only Keycloak Integration Test (Full OIDC flow)
yarn workspace @appmana-public/auth-proxy-integration-tests run test:keycloak

# Run only Basic tests
yarn workspace @appmana-public/auth-proxy-integration-tests run test:basic
```

### Publishing

This repository is configured to publish packages to NPM and Docker images to GitHub Container Registry (GHCR) automatically via GitHub Actions.

**NPM Publishing:**

1.  Ensure you have properly versioned your packages (Semantic Versioning).
2.  Push to `main`.
3.  The `publish.yml` workflow will run `yarn workspaces foreach ... npm publish`.
    - It skips private packages.
    - It tolerates existing versions (skips if version already exists on registry).
    - It requires `NPM_TOKEN` secret in GitHub.

**Docker Publishing:**

1.  The `publish.yml` workflow builds the backend Docker image.
2.  Pushes to `ghcr.io/appmana/auth-proxy-backend:latest` (and git sha tag).
3.  Requires `GITHUB_TOKEN` (automatic) for authentication.

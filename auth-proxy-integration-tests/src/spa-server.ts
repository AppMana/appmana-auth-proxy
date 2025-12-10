import Fastify from 'fastify';
import cors from '@fastify/cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fastify = Fastify({
    logger: true,
});

fastify.register(cors, {
    origin: true,
    credentials: true,
});

// We need to serve the frontend package as well, or bundle it.
// For simplicity, we'll assume the frontend package is built and we can serve it.
// But browsers can't import bare modules without import maps or bundling.
// Let's create a simple HTML that uses ES modules and import maps if needed, 
// or just serve the built frontend file if it's a bundle.
// The frontend package `main` points to `src/index.ts` (which is TS).
// We should use the built version `build/index.js`.
// And since it uses `xhook` (CJS), we might have issues in browser ESM.
// Ideally we should bundle the frontend for the browser.
// But for this test, let's try to serve it and see.
// If `xhook` is a problem, we might need a simple bundler or just use a CDN for xhook.

// Let's assume we can use a simple script tag for the test SPA.

const spaHtml = (proxyPort: number) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Test SPA</title>
</head>
<body>
    <h1>Test SPA</h1>
    <div id="status">Waiting...</div>
    <button id="btn-fetch">Test Fetch</button>
    <button id="btn-xhr">Test XHR</button>
    
    <script src="/frontend/index.js"></script>
    <script type="module">
        // Mock cookie
        document.cookie = "_oauth2_proxy=mock-token; path=/";

        const { configureAuthProxy } = window.AppManaAuthProxy;

        configureAuthProxy({
            domains: ['127.0.0.1:9999'], // Proxy requests to dummy backend
            proxyUrl: 'http://localhost:${proxyPort}', // The proxy server
            getAuthToken: () => 'mock-token-from-spa' 
        });

        const statusDiv = document.getElementById('status');

        document.getElementById('btn-fetch').addEventListener('click', async () => {
            try {
                const res = await fetch('http://127.0.0.1:9999/api/test');
                console.log('Fetch status:', res.status);
                const text = await res.text();
                console.log('Fetch response:', text);
                const data = JSON.parse(text);
                statusDiv.innerText = 'Fetch: ' + JSON.stringify(data);
            } catch (e) {
                console.error('Fetch error:', e);
                statusDiv.innerText = 'Fetch Error: ' + e.message;
            }
        });

        document.getElementById('btn-xhr').addEventListener('click', () => {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', 'http://127.0.0.1:9999/api/test');
            xhr.onload = () => {
                statusDiv.innerText = 'XHR: ' + xhr.responseText;
            };
            xhr.onerror = () => {
                statusDiv.innerText = 'XHR Error';
            };
            xhr.send();
        });
    </script>
</body>
</html>
`;

fastify.get('/', async (request, reply) => {
    const proxyPort = parseInt(process.env.PROXY_PORT || '3000', 10);
    reply.type('text/html').send(spaHtml(proxyPort));
});

// Serve frontend files
// We need to serve `appmana-auth-proxy/auth-proxy-frontend/build/index.js`
// And also `xhook`.
// This is getting complicated without a bundler.
// Let's use `esbuild` to bundle the frontend on the fly?
// Or just assume we can resolve imports.

// Let's try to serve the built frontend file.
// But `index.js` imports `xhook`.
// Browser won't find `xhook`.
// We need to bundle.

// Let's create a simple bundle using esbuild in the test setup?
// Or just use a pre-bundled version if we had one.
// The user said "there should be a frontend typescript package. when imported via esm or script, whatever is easiest".
// Let's create a bundle for the frontend package using `esbuild` as a prep step.

import { build } from 'esbuild';

const start = async () => {
    // Ensure public directory exists
    const publicDir = path.resolve(__dirname, '../public');
    if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true });
    }

    // Serve the auth-proxy-frontend directly from node_modules for testing
    const frontendPath = path.resolve(__dirname, '../../auth-proxy-frontend/dist'); // Local build
    // Or if checking installed node_modules:
    // const frontendPath = path.resolve(rootDir, 'node_modules/@appmana-public/auth-proxy-frontend/dist');

    fastify.get('/frontend/index.js', async (request, reply) => {
        const content = fs.readFileSync(path.resolve(frontendPath, 'auth-proxy.global.js'), 'utf8');
        reply.type('application/javascript').send(content);
    });

    const port = parseInt(process.env.PORT || '8080', 10);
    try {
        await fastify.listen({ port, host: '0.0.0.0' });
        console.log(`SPA Server listening on ${port}`);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();

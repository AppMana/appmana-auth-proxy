import Fastify from 'fastify';
import proxy from '@fastify/http-proxy';
import cors from '@fastify/cors';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { PolicyManager, PolicyContext, PolicyResult, PolicyFunction } from './policy.js';
import fg from 'fast-glob';
import micromatch from 'micromatch';
import { createAuthorizePolicy, AuthorizeConfig } from './policies/authorize.js';

export type { PolicyContext, PolicyResult, PolicyFunction };
import jwt from 'jsonwebtoken';
import { OAuth2ProxyCipher, parseCookies, joinCookieValues, getRoles, getGroups, hasRole, hasGroup } from '@appmana-public/auth-proxy-common';
import path from 'path';
import fs from 'fs';
import { verifyWithDiscovery } from './jwks.js';
import { wellKnownAllBackendsPolicy } from './policies/well-known-all-backends.js';


const argv = yargs(hideBin(process.argv))
    .env('AUTH_PROXY') // Load from AUTH_PROXY_* env vars
    .option('config', {
        alias: 'c',
        type: 'string',
        description: 'Path to JSON config file',
        config: true // Enable config file support
    })
    .option('policy', {
        type: 'array',
        description: 'Path to policy file(s) (supports globs)',
        default: [] as string[],
    })
    .option('policy-chain', {
        type: 'array',
        description: 'Ordered list of policy names to evaluate (e.g. --policy-chain blacklist admin user)',
        default: [] as string[],
        coerce: (arg) => arg.map(String)
    })
    .option('well-known-authorize', {
        type: 'array',
        alias: 'authorize', // Keep alias for backward compat if helpful, or remove if strict? User said rename. 
        // Let's keep alias but hide it? No, explicit rename requested.
        // But "rebrands" usually implies replacing.
        // User: "adding --well-known-..., so it would be --well-known-authorize"
        // I will use 'well-known-authorize' as primary.
        description: 'JSON string configuration for authorize policy (repeatable). E.g. \'{"issuer": "...", "domains": ["example.com"]}\'',
        default: [] as string[],
        coerce: (arg) => arg.map(String)
    })
    .option('well-known-all-backends', {
        type: 'boolean',
        description: 'Enable automatic credential injection for well-known backends (OpenAI, AWS, etc.)',
        default: false
    })
    .option('print-frontend-config', {
        type: 'boolean',
        description: 'Print the frontend configuration <script> tag based on --well-known-authorize args and exit',
        default: false
    })
    .option('port', {
        type: 'number',
        description: 'Port to listen on',
        default: 3000
    })
    .option('upstream', {
        type: 'string',
        description: 'Default upstream URL (e.g. http://localhost:3000)',
    })
    // ...
    .parseSync();

console.log('DEBUG PROCESS.ARGV:', process.argv);
console.log('DEBUG YARGS ARGV:', JSON.stringify(argv, null, 2));



const policyPatterns = argv.policy as string[];
const policyManager = new PolicyManager(policyPatterns);
const fastify = Fastify({ logger: true });

// Process --well-known-authorize args
const authorizeConfigs: AuthorizeConfig[] = [];
try {
    for (const jsonStr of argv['well-known-authorize'] as string[]) {
        const config = JSON.parse(jsonStr);
        if (config && Array.isArray(config.domains)) {
            authorizeConfigs.push(config);
        } else {
            console.warn('Invalid --well-known-authorize config (must have domains array):', jsonStr);
        }
    }
} catch (e) {
    console.error('Failed to parse --well-known-authorize arguments:', e);
    process.exit(1);
}

const allAllowedDomains = authorizeConfigs.flatMap(c => c.domains);

// ...

// Register well-known-all-backends if enabled
if (argv['well-known-all-backends']) {
    policyManager.registerPolicy(wellKnownAllBackendsPolicy, 'well-known-all-backends');
    console.log('Registered policy: well-known-all-backends');
}

// Register dynamic Authorize Policies
let authPolicyIndex = 0;
for (const config of authorizeConfigs) {
    const policyFn = createAuthorizePolicy(config);
    const name = `well-known-authorize-${authPolicyIndex++}`;
    policyManager.registerPolicy(policyFn, name);
    console.log(`Registered dynamic policy '${name}' for domains:`, config.domains);
}


// If --policy-chain is provided, configure the manager
// We need to ensure dynamic policies (authorize-*) are included if the user didn't explicitly list them but might expect them?
// Actually, if user specifies --policy-chain, they define the Exact Order.
// Excluding 'authorize-*' means they won't run.
// This is rigorous. If user mixes --policy-chain and --authorize, they should list 'authorize-0' etc in the chain?
// Or maybe we treat --authorize args as "Implicitly Appended" or "Prepended"?
// Frontier Simple: Explicit is better. But knowing 'authorize-0' name is hard.
// Compromise: If chain is set, we use it strictly. If dynamic keys are missing, warn?
// Or maybe --authorize just adds to the pool, and if you use chain you must know names.
// For now, let's just respect the passed chain.
if (argv['policy-chain'] && argv['policy-chain'].length > 0) {
    policyManager.setPolicyChain(argv['policy-chain'] as string[]);
}

// Initialize Cipher
const cookieSecret = process.env.OAUTH2_PROXY_COOKIE_SECRET; // Base64 encoded?
// oauth2-proxy secret is usually 16, 24, 32 bytes.
// If provided as env var to our process, it might be the raw string or base64.
// We'll let the cipher handle it (it tries to decode).
let cipher: OAuth2ProxyCipher | undefined;

if (cookieSecret) {
    try {
        cipher = new OAuth2ProxyCipher(cookieSecret);
        console.log('OAuth2ProxyCipher initialized with secret');
    } catch (e) {
        console.error('Failed to initialize OAuth2ProxyCipher:', e);
    }
} else {
    console.warn('OAUTH2_PROXY_COOKIE_SECRET not provided, decryption will be unavailable.');
}

async function verifyToken(token: string) {
    if (argv['skip-verify']) {
        return jwt.decode(token);
    }

    try {
        const { payload } = await verifyWithDiscovery(token);
        return payload;
    } catch (e) {
        console.error('Token verification failed:', e);
        // If verification fails, do we return null? Or throw?
        // The previous logic implies we want a user object if valid.
        return null;
    }
}

async function start() {
    await policyManager.start();

    await fastify.register(cors, {
        origin: true, // Reflect origin
        credentials: true,
    });

    const upstream = (argv.upstream as string) || ''; // Default to empty to allow getUpstream to work dynamicall

    // Use onRequest to ensure we run before the proxy handler takes over completely.
    fastify.addHook('onRequest', async (request, reply) => {
        const headerTargetUrl = request.headers['x-proxy-target-url'];
        const upstream = (argv.upstream as string) || '';

        let targetUrl: string;
        if (typeof headerTargetUrl === 'string') {
            targetUrl = headerTargetUrl;
        } else {
            const up = upstream.endsWith('/') ? upstream.slice(0, -1) : upstream;
            const path = request.raw.url || '';
            targetUrl = up + path;
        }

        // Validate Allowed Domains
        if (allAllowedDomains.length > 0) {
            try {
                const u = new URL(targetUrl);
                const hostToCheck = u.host;
                const originToCheck = u.origin;

                const isAllowed = micromatch.isMatch(hostToCheck, allAllowedDomains as string[]) ||
                    micromatch.isMatch(originToCheck, allAllowedDomains as string[]);

                if (!isAllowed) {
                    console.warn(`[AuthProxyBackend] Blocked request to unauthorized target: ${targetUrl}`);
                    reply.code(403).send({ error: 'Unauthorized Proxy Target' });
                    return;
                }
            } catch (e) {
                console.warn(`[AuthProxyBackend] Invalid target URL: ${targetUrl}`);
                reply.code(400).send({ error: 'Invalid Proxy Target URL' });
                return;
            }
        }


        // If no upstream and no header, error
        if (!argv.upstream && !headerTargetUrl) {
            reply.code(400).send({ error: 'Missing upstream configuration or X-Proxy-Target-Url header' });
            return;
        }

        const authHeader = request.headers['authorization'];
        const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
        const user = token ? await verifyToken(token) : null;

        const context: PolicyContext = {
            request,
            user,
            utils: {
                cipher,
                parseCookies,
                joinCookieValues,
                jwt,
                getRoles,
                getGroups,
                hasRole,
                hasGroup
            }
        };

        const result = await policyManager.evaluate(context);
        console.log('[AuthProxyBackend] Policy evaluation result:', JSON.stringify(result));

        if (result.decision !== 'ALLOW') {
            reply.code(403).send({ error: 'Forbidden' });
            return;
        }

        if (result.modifiedRequest) {
            if (result.modifiedRequest.headers) {
                Object.assign(request.headers, result.modifiedRequest.headers);
                Object.assign(request.raw.headers, result.modifiedRequest.headers);
            }
        }

        if (headerTargetUrl && typeof headerTargetUrl === 'string') {
            try {
                const u = new URL(targetUrl);
                request.raw.url = u.pathname + u.search;
            } catch (e) { }
        }
    });

    await fastify.register(proxy, {
        upstream,
        httpMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD'],
        replyOptions: {
            getUpstream: (originalReq, base) => {
                const targetUrl = originalReq.headers['x-proxy-target-url'];
                if (typeof targetUrl === 'string') {
                    try {
                        const u = new URL(targetUrl.trim());
                        return u.origin;
                    } catch (e) {
                        return base;
                    }
                }
                return base;
            },
            rewriteRequestHeaders: (originalReq, headers) => {
                return headers;
            },
        }
    });
}

start().then(() => {
    fastify.listen({ port: Number(argv.port || 3000), host: '0.0.0.0' }, (err, address) => {
        if (err) {
            fastify.log.error(err);
            process.exit(1);
        }
        console.log(`Server listening at ${address}`);
    });
});

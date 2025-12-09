var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __values = (this && this.__values) || function(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
};
var e_1, _a, e_2, _b;
import Fastify from 'fastify';
import proxy from '@fastify/http-proxy';
import cors from '@fastify/cors';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { PolicyManager } from './policy.js';
import micromatch from 'micromatch';
import { createAuthorizePolicy } from './policies/authorize.js';
import jwt from 'jsonwebtoken';
import { OAuth2ProxyCipher, parseCookies, joinCookieValues, getRoles, getGroups, hasRole, hasGroup } from '@appmana/auth-proxy-common';
import { verifyWithDiscovery } from './jwks.js';
import { wellKnownAllBackendsPolicy } from './policies/well-known-all-backends.js';
var argv = yargs(hideBin(process.argv))
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
    default: [],
})
    .option('policy-chain', {
    type: 'array',
    description: 'Ordered list of policy names to evaluate (e.g. --policy-chain blacklist admin user)',
    default: [],
    coerce: function (arg) { return arg.map(String); }
})
    .option('well-known-authorize', {
    type: 'array',
    alias: 'authorize', // Keep alias for backward compat if helpful, or remove if strict? User said rename. 
    // Let's keep alias but hide it? No, explicit rename requested.
    // But "rebrands" usually implies replacing.
    // User: "adding --well-known-..., so it would be --well-known-authorize"
    // I will use 'well-known-authorize' as primary.
    description: 'JSON string configuration for authorize policy (repeatable). E.g. \'{"issuer": "...", "domains": ["example.com"]}\'',
    default: [],
    coerce: function (arg) { return arg.map(String); }
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
var policyPatterns = argv.policy;
var policyManager = new PolicyManager(policyPatterns);
var fastify = Fastify({ logger: true });
// Process --well-known-authorize args
var authorizeConfigs = [];
try {
    try {
        for (var _c = __values(argv['well-known-authorize']), _d = _c.next(); !_d.done; _d = _c.next()) {
            var jsonStr = _d.value;
            var config = JSON.parse(jsonStr);
            if (config && Array.isArray(config.domains)) {
                authorizeConfigs.push(config);
            }
            else {
                console.warn('Invalid --well-known-authorize config (must have domains array):', jsonStr);
            }
        }
    }
    catch (e_1_1) { e_1 = { error: e_1_1 }; }
    finally {
        try {
            if (_d && !_d.done && (_a = _c.return)) _a.call(_c);
        }
        finally { if (e_1) throw e_1.error; }
    }
}
catch (e) {
    console.error('Failed to parse --well-known-authorize arguments:', e);
    process.exit(1);
}
var allAllowedDomains = authorizeConfigs.flatMap(function (c) { return c.domains; });
// ...
// Register well-known-all-backends if enabled
if (argv['well-known-all-backends']) {
    policyManager.registerPolicy(wellKnownAllBackendsPolicy, 'well-known-all-backends');
    console.log('Registered policy: well-known-all-backends');
}
// Register dynamic Authorize Policies
var authPolicyIndex = 0;
try {
    for (var authorizeConfigs_1 = __values(authorizeConfigs), authorizeConfigs_1_1 = authorizeConfigs_1.next(); !authorizeConfigs_1_1.done; authorizeConfigs_1_1 = authorizeConfigs_1.next()) {
        var config = authorizeConfigs_1_1.value;
        var policyFn = createAuthorizePolicy(config);
        var name_1 = "well-known-authorize-".concat(authPolicyIndex++);
        policyManager.registerPolicy(policyFn, name_1);
        console.log("Registered dynamic policy '".concat(name_1, "' for domains:"), config.domains);
    }
}
catch (e_2_1) { e_2 = { error: e_2_1 }; }
finally {
    try {
        if (authorizeConfigs_1_1 && !authorizeConfigs_1_1.done && (_b = authorizeConfigs_1.return)) _b.call(authorizeConfigs_1);
    }
    finally { if (e_2) throw e_2.error; }
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
    policyManager.setPolicyChain(argv['policy-chain']);
}
// Initialize Cipher
var cookieSecret = process.env.OAUTH2_PROXY_COOKIE_SECRET; // Base64 encoded?
// oauth2-proxy secret is usually 16, 24, 32 bytes.
// If provided as env var to our process, it might be the raw string or base64.
// We'll let the cipher handle it (it tries to decode).
var cipher;
if (cookieSecret) {
    try {
        cipher = new OAuth2ProxyCipher(cookieSecret);
        console.log('OAuth2ProxyCipher initialized with secret');
    }
    catch (e) {
        console.error('Failed to initialize OAuth2ProxyCipher:', e);
    }
}
else {
    console.warn('OAUTH2_PROXY_COOKIE_SECRET not provided, decryption will be unavailable.');
}
function verifyToken(token) {
    return __awaiter(this, void 0, void 0, function () {
        var payload, e_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (argv['skip-verify']) {
                        return [2 /*return*/, jwt.decode(token)];
                    }
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, verifyWithDiscovery(token)];
                case 2:
                    payload = (_a.sent()).payload;
                    return [2 /*return*/, payload];
                case 3:
                    e_3 = _a.sent();
                    console.error('Token verification failed:', e_3);
                    // If verification fails, do we return null? Or throw?
                    // The previous logic implies we want a user object if valid.
                    return [2 /*return*/, null];
                case 4: return [2 /*return*/];
            }
        });
    });
}
function start() {
    return __awaiter(this, void 0, void 0, function () {
        var upstream;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, policyManager.start()];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, fastify.register(cors, {
                            origin: true, // Reflect origin
                            credentials: true,
                        })];
                case 2:
                    _a.sent();
                    upstream = argv.upstream || '';
                    // Use onRequest to ensure we run before the proxy handler takes over completely.
                    fastify.addHook('onRequest', function (request, reply) { return __awaiter(_this, void 0, void 0, function () {
                        var headerTargetUrl, upstream, targetUrl, up, path_1, u, hostToCheck, originToCheck, isAllowed, authHeader, token, user, _a, context, result, u;
                        return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0:
                                    headerTargetUrl = request.headers['x-proxy-target-url'];
                                    upstream = argv.upstream || '';
                                    if (typeof headerTargetUrl === 'string') {
                                        targetUrl = headerTargetUrl;
                                    }
                                    else {
                                        up = upstream.endsWith('/') ? upstream.slice(0, -1) : upstream;
                                        path_1 = request.raw.url || '';
                                        targetUrl = up + path_1;
                                    }
                                    // Validate Allowed Domains
                                    if (allAllowedDomains.length > 0) {
                                        try {
                                            u = new URL(targetUrl);
                                            hostToCheck = u.host;
                                            originToCheck = u.origin;
                                            isAllowed = micromatch.isMatch(hostToCheck, allAllowedDomains) ||
                                                micromatch.isMatch(originToCheck, allAllowedDomains);
                                            if (!isAllowed) {
                                                console.warn("[AuthProxyBackend] Blocked request to unauthorized target: ".concat(targetUrl));
                                                reply.code(403).send({ error: 'Unauthorized Proxy Target' });
                                                return [2 /*return*/];
                                            }
                                        }
                                        catch (e) {
                                            console.warn("[AuthProxyBackend] Invalid target URL: ".concat(targetUrl));
                                            reply.code(400).send({ error: 'Invalid Proxy Target URL' });
                                            return [2 /*return*/];
                                        }
                                    }
                                    // If no upstream and no header, error
                                    if (!argv.upstream && !headerTargetUrl) {
                                        reply.code(400).send({ error: 'Missing upstream configuration or X-Proxy-Target-Url header' });
                                        return [2 /*return*/];
                                    }
                                    authHeader = request.headers['authorization'];
                                    token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
                                    if (!token) return [3 /*break*/, 2];
                                    return [4 /*yield*/, verifyToken(token)];
                                case 1:
                                    _a = _b.sent();
                                    return [3 /*break*/, 3];
                                case 2:
                                    _a = null;
                                    _b.label = 3;
                                case 3:
                                    user = _a;
                                    context = {
                                        request: request,
                                        user: user,
                                        utils: {
                                            cipher: cipher,
                                            parseCookies: parseCookies,
                                            joinCookieValues: joinCookieValues,
                                            jwt: jwt,
                                            getRoles: getRoles,
                                            getGroups: getGroups,
                                            hasRole: hasRole,
                                            hasGroup: hasGroup
                                        }
                                    };
                                    return [4 /*yield*/, policyManager.evaluate(context)];
                                case 4:
                                    result = _b.sent();
                                    console.log('[AuthProxyBackend] Policy evaluation result:', JSON.stringify(result));
                                    if (result.decision !== 'ALLOW') {
                                        reply.code(403).send({ error: 'Forbidden' });
                                        return [2 /*return*/];
                                    }
                                    if (result.modifiedRequest) {
                                        if (result.modifiedRequest.headers) {
                                            Object.assign(request.headers, result.modifiedRequest.headers);
                                            Object.assign(request.raw.headers, result.modifiedRequest.headers);
                                        }
                                    }
                                    if (headerTargetUrl && typeof headerTargetUrl === 'string') {
                                        try {
                                            u = new URL(targetUrl);
                                            request.raw.url = u.pathname + u.search;
                                        }
                                        catch (e) { }
                                    }
                                    return [2 /*return*/];
                            }
                        });
                    }); });
                    return [4 /*yield*/, fastify.register(proxy, {
                            upstream: upstream,
                            httpMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD'],
                            replyOptions: {
                                getUpstream: function (originalReq, base) {
                                    var targetUrl = originalReq.headers['x-proxy-target-url'];
                                    if (typeof targetUrl === 'string') {
                                        try {
                                            var u = new URL(targetUrl.trim());
                                            return u.origin;
                                        }
                                        catch (e) {
                                            return base;
                                        }
                                    }
                                    return base;
                                },
                                rewriteRequestHeaders: function (originalReq, headers) {
                                    return headers;
                                },
                            }
                        })];
                case 3:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
start().then(function () {
    fastify.listen({ port: Number(argv.port || 3000), host: '0.0.0.0' }, function (err, address) {
        if (err) {
            fastify.log.error(err);
            process.exit(1);
        }
        console.log("Server listening at ".concat(address));
    });
});
//# sourceMappingURL=index.js.map
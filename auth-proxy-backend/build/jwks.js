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
import { createLocalJWKSet, jwtVerify } from 'jose';
import makeFetchHappen from 'make-fetch-happen';
import path from 'path';
import os from 'os';
// Configure caching fetcher
var cachePath = process.env.JWKS_CACHE_PATH || path.join(os.tmpdir(), 'auth-proxy-jwks-cache');
var fetchCached = makeFetchHappen.defaults({
    cachePath: cachePath,
    cache: 'force-cache'
});
var discoveryCache = new Map();
var jwksCache = new Map();
/**
 * Discovers OIDC configuration using RFC 8414 logic with caching.
 */
function discover(issuer) {
    return __awaiter(this, void 0, void 0, function () {
        var discoveryPromise, e_1;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (discoveryCache.has(issuer)) {
                        return [2 /*return*/, discoveryCache.get(issuer)];
                    }
                    discoveryPromise = (function () { return __awaiter(_this, void 0, void 0, function () {
                        var rfc8414Url, res_1, data, e_2, oidcUrl, res;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    rfc8414Url = "".concat(issuer.replace(/\/$/, ''), "/.well-known/oauth-authorization-server");
                                    _a.label = 1;
                                case 1:
                                    _a.trys.push([1, 5, , 6]);
                                    return [4 /*yield*/, fetchCached(rfc8414Url)];
                                case 2:
                                    res_1 = _a.sent();
                                    if (!res_1.ok) return [3 /*break*/, 4];
                                    return [4 /*yield*/, res_1.json()];
                                case 3:
                                    data = _a.sent();
                                    return [2 /*return*/, data];
                                case 4: return [3 /*break*/, 6];
                                case 5:
                                    e_2 = _a.sent();
                                    return [3 /*break*/, 6];
                                case 6:
                                    oidcUrl = "".concat(issuer.replace(/\/$/, ''), "/.well-known/openid-configuration");
                                    return [4 /*yield*/, fetchCached(oidcUrl)];
                                case 7:
                                    res = _a.sent();
                                    if (!res.ok) {
                                        throw new Error("Failed to discover OIDC config for ".concat(issuer));
                                    }
                                    return [4 /*yield*/, res.json()];
                                case 8: return [2 /*return*/, _a.sent()];
                            }
                        });
                    }); })();
                    discoveryCache.set(issuer, discoveryPromise);
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, discoveryPromise];
                case 2: return [2 /*return*/, _a.sent()];
                case 3:
                    e_1 = _a.sent();
                    discoveryCache.delete(issuer);
                    throw e_1;
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * Custom Key Provider for Jose that fetches JWKS with HTTP caching.
 */
export function getKey(protectedHeader, token) {
    return __awaiter(this, void 0, void 0, function () {
        var parts, payload, issuer, config, jwksUri, res, jwks, localJWKSet;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    parts = token.split('.');
                    payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
                    issuer = payload.iss;
                    if (!issuer) {
                        throw new Error('Missing issuer in JWT');
                    }
                    return [4 /*yield*/, discover(issuer)];
                case 1:
                    config = _a.sent();
                    jwksUri = config.jwks_uri;
                    return [4 /*yield*/, fetchCached(jwksUri)];
                case 2:
                    res = _a.sent();
                    if (!res.ok) {
                        throw new Error("Failed to fetch JWKS from ".concat(jwksUri));
                    }
                    return [4 /*yield*/, res.json()];
                case 3:
                    jwks = _a.sent();
                    localJWKSet = createLocalJWKSet(jwks);
                    return [2 /*return*/, localJWKSet(protectedHeader, token)];
            }
        });
    });
}
/**
 * Verifies a JWT using automatic discovery and caching.
 */
export function verifyWithDiscovery(token) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, jwtVerify(token, getKey)];
        });
    });
}
//# sourceMappingURL=jwks.js.map
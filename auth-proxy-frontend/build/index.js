var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
import xhook from 'xhook';
var config = null;
var defaultGetAuthToken = function () {
    // Default implementation: retrieve token from cookie (e.g., _oauth2_proxy)
    // This is a placeholder; actual implementation depends on how oauth2-proxy stores the token.
    // Often oauth2-proxy handles auth via httpOnly cookies, so we might not need to send a token explicitly
    // if the proxy is on the same domain or we use credentials: 'include'.
    // However, the requirement says "injects a cookie with the authentication details",
    // so we might just rely on the browser sending the cookie.
    // If we need to extract a token from a cookie accessible to JS:
    var match = document.cookie.match(new RegExp('(^| )_oauth2_proxy=([^;]+)'));
    if (match)
        return match[2];
    return null;
};
export function configureAuthProxy(userConfig) {
    console.log('Configuring Auth Proxy', userConfig);
    config = __assign(__assign({}, userConfig), { getAuthToken: userConfig.getAuthToken || defaultGetAuthToken });
    enableInterception();
}
function shouldProxy(url) {
    if (!config)
        return false;
    try {
        var parsedUrl_1 = new URL(url, window.location.origin);
        return config.domains.some(function (domain) {
            return parsedUrl_1.host === domain ||
                parsedUrl_1.hostname === domain ||
                parsedUrl_1.hostname.endsWith('.' + domain);
        });
    }
    catch (e) {
        return false;
    }
}
function enableInterception() {
    if (!config)
        return;
    // Intercept XMLHttpRequest
    xhook.before(function (request, callback) {
        return __awaiter(this, void 0, void 0, function () {
            var originalUrl, token;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!shouldProxy(request.url)) return [3 /*break*/, 2];
                        originalUrl = request.url;
                        request.url = config.proxyUrl;
                        return [4 /*yield*/, Promise.resolve(config.getAuthToken())];
                    case 1:
                        token = _a.sent();
                        if (token) {
                            request.headers['Authorization'] = "Bearer ".concat(token);
                        }
                        request.headers['X-Proxy-Target-Url'] = originalUrl;
                        // Enable credentials for cross-origin (port) cookies
                        request.withCredentials = true;
                        _a.label = 2;
                    case 2:
                        callback();
                        return [2 /*return*/];
                }
            });
        });
    });
    // Intercept fetch
    var originalFetch = window.fetch;
    window.fetch = function (input, init) {
        return __awaiter(this, void 0, void 0, function () {
            var url, originalUrl, token, headers, newInit;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        url = input instanceof Request ? input.url : input.toString();
                        if (!shouldProxy(url)) return [3 /*break*/, 2];
                        originalUrl = url;
                        url = config.proxyUrl;
                        return [4 /*yield*/, Promise.resolve(config.getAuthToken())];
                    case 1:
                        token = _a.sent();
                        headers = new Headers((init === null || init === void 0 ? void 0 : init.headers) || {});
                        if (token) {
                            headers.set('Authorization', "Bearer ".concat(token));
                        }
                        headers.set('X-Proxy-Target-Url', originalUrl);
                        newInit = __assign(__assign({}, init), { headers: headers, credentials: 'include' });
                        // If input was a Request object, we need to clone it or create a new one with the new URL
                        if (input instanceof Request) {
                            // We can't easily mutate a Request object's URL. We have to create a new one.
                            // But we can pass the new URL and the new init to fetch.
                            return [2 /*return*/, originalFetch(url, newInit)];
                        }
                        return [2 /*return*/, originalFetch(url, newInit)];
                    case 2: return [2 /*return*/, originalFetch(input, init)];
                }
            });
        });
    };
}
//# sourceMappingURL=index.js.map
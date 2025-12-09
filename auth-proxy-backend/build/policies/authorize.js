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
import micromatch from 'micromatch';
export function createAuthorizePolicy(config) {
    var _this = this;
    return function (context) { return __awaiter(_this, void 0, void 0, function () {
        var request, user, utils, targetUrl, u, hostToCheck, originToCheck, isAllowed, userAud, audMatch;
        return __generator(this, function (_a) {
            request = context.request, user = context.user, utils = context.utils;
            console.log('[AuthorizePolicy] Evaluating request for config:', JSON.stringify(config));
            targetUrl = request.headers['x-proxy-target-url'];
            if (!targetUrl) {
                // If explicit domains are configured, we expect a target. 
                // If the request doesn't imply a target (e.g. direct backend access), maybe we skip?
                // But for a proxy, we usually need a target.
                // Let's assume index.ts validation handles missing headers if upstream is missing,
                // but here we enforce the specific domain constraint.
                console.warn('[AuthorizePolicy] Missing X-Proxy-Target-Url header');
                return [2 /*return*/, { decision: 'DENY' }];
            }
            try {
                u = new URL(targetUrl);
                hostToCheck = u.host;
                originToCheck = u.origin;
                isAllowed = micromatch.isMatch(hostToCheck, config.domains) ||
                    micromatch.isMatch(originToCheck, config.domains);
                if (!isAllowed) {
                    console.warn("[AuthorizePolicy] Target ".concat(targetUrl, " not allowed by config domains: ").concat(config.domains));
                    // If strict firewall: DENY. If we just want to say "This policy doesn't allow it, try next", we'd skip.
                    // But 'authorize' implies enforcement. If it matches target but fails check, it should probably DENY?
                    // Wait, if it *doesn't match* the domains, it might ideally SKIP (not applicable).
                    // BUT micromatch checks if it *is* in the allowed list.
                    // If `config.domains` is the allowlist for this policy.
                    // If I am Policy "ExternalAPI" and domains=["api.com"]. And request is "other.com".
                    // I should SKIP.
                    // However, the current logic was enforcing it.
                    // Let's stick to SKIP if we want fall-through, or DENY if we assume this policy *must* handle it.
                    // Given the CLI arg usually sets global allowed domains too, let's treat "target not in allowed" as SKIP (so other component might handle, or default deny).
                    return [2 /*return*/, { decision: 'SKIP' }];
                }
            }
            catch (e) {
                console.warn("[AuthorizePolicy] Invalid target URL: ".concat(targetUrl));
                return [2 /*return*/, { decision: 'DENY' }];
            }
            // 2. Validate User/Token (Issuer & Audience)
            if (!user) {
                console.warn('[AuthorizePolicy] No user/token found');
                return [2 /*return*/, { decision: 'DENY' }]; // Require user if this policy applies?
            }
            // JWT verification (signature) is handled by the main pipeline (index.ts) or utils.
            // Here we check claims if config requires them.
            if (config.issuer) {
                if (user.iss !== config.issuer) {
                    console.warn("[AuthorizePolicy] Issuer mismatch. Expected: ".concat(config.issuer, ", Got: ").concat(user.iss));
                    return [2 /*return*/, { decision: 'DENY' }];
                }
            }
            if (config.audience) {
                userAud = user.aud;
                audMatch = false;
                if (typeof userAud === 'string') {
                    audMatch = userAud === config.audience;
                }
                else if (Array.isArray(userAud)) {
                    audMatch = userAud.includes(config.audience);
                }
                if (!audMatch) {
                    console.warn("[AuthorizePolicy] Audience mismatch. Expected: ".concat(config.audience, ", Got: ").concat(user.aud));
                    return [2 /*return*/, { decision: 'DENY' }];
                }
            }
            console.log('[AuthorizePolicy] Request authorized');
            return [2 /*return*/, { decision: 'ALLOW' }];
        });
    }); };
}
;
//# sourceMappingURL=authorize.js.map
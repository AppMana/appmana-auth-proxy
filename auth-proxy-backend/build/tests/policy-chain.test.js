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
import { test } from 'node:test';
import assert from 'node:assert';
import { PolicyManager } from '../policy.js';
test('Policy Chain - First Applicable Strategy', function (t) { return __awaiter(void 0, void 0, void 0, function () {
    var manager, allowPolicy, denyPolicy, skipPolicy, modifyPolicy, context;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                manager = new PolicyManager([]);
                allowPolicy = function () { return __awaiter(void 0, void 0, void 0, function () { return __generator(this, function (_a) {
                    return [2 /*return*/, ({ decision: 'ALLOW', modifiedRequest: { headers: { 'x-test': 'allow' } } })];
                }); }); };
                denyPolicy = function () { return __awaiter(void 0, void 0, void 0, function () { return __generator(this, function (_a) {
                    return [2 /*return*/, ({ decision: 'DENY' })];
                }); }); };
                skipPolicy = function () { return __awaiter(void 0, void 0, void 0, function () { return __generator(this, function (_a) {
                    return [2 /*return*/, ({ decision: 'SKIP' })];
                }); }); };
                modifyPolicy = function () { return __awaiter(void 0, void 0, void 0, function () { return __generator(this, function (_a) {
                    return [2 /*return*/, ({ decision: 'SKIP', modifiedRequest: { headers: { 'x-mod': 'skip' } } })];
                }); }); };
                // Register them
                manager.registerPolicy(allowPolicy, 'allow-policy');
                manager.registerPolicy(denyPolicy, 'deny-policy');
                manager.registerPolicy(skipPolicy, 'skip-policy');
                manager.registerPolicy(modifyPolicy, 'modify-policy');
                context = { request: {} };
                return [4 /*yield*/, t.test('Should DENY by default if no policies match', function () { return __awaiter(void 0, void 0, void 0, function () {
                        var result;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    // Empty Chain
                                    manager.setPolicyChain([]);
                                    // Note: Empty chain -> reorderPolicies uses ALL loaded policies sorted by name.
                                    // allow-policy is first alphabetically. So it would ALLOW.
                                    // Let's set a chain explicitly to empty list? 
                                    // Currently `setPolicyChain([])` might revert to default behaviour?
                                    // Let's check implementation. 
                                    // `if (this.chainConfig.length > 0) ... else { default all }`
                                    // So passing [] usually means run all.
                                    // I need a way to say "Run Nothing" if I want default deny?
                                    // Or just test that if I run a chain with only SKIP, it DENIES.
                                    manager.setPolicyChain(['skip-policy']);
                                    return [4 /*yield*/, manager.evaluate(context)];
                                case 1:
                                    result = _a.sent();
                                    assert.strictEqual(result.decision, 'DENY');
                                    return [2 /*return*/];
                            }
                        });
                    }); })];
            case 1:
                _a.sent();
                return [4 /*yield*/, t.test('Should ALLOW if first policy ALLOWs', function () { return __awaiter(void 0, void 0, void 0, function () {
                        var result;
                        var _a;
                        return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0:
                                    manager.setPolicyChain(['allow-policy', 'deny-policy']);
                                    return [4 /*yield*/, manager.evaluate(context)];
                                case 1:
                                    result = _b.sent();
                                    assert.strictEqual(result.decision, 'ALLOW');
                                    assert.deepStrictEqual((_a = result.modifiedRequest) === null || _a === void 0 ? void 0 : _a.headers, { 'x-test': 'allow' });
                                    return [2 /*return*/];
                            }
                        });
                    }); })];
            case 2:
                _a.sent();
                return [4 /*yield*/, t.test('Should DENY if first policy DENIEs', function () { return __awaiter(void 0, void 0, void 0, function () {
                        var result;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    manager.setPolicyChain(['deny-policy', 'allow-policy']);
                                    return [4 /*yield*/, manager.evaluate(context)];
                                case 1:
                                    result = _a.sent();
                                    assert.strictEqual(result.decision, 'DENY');
                                    return [2 /*return*/];
                            }
                        });
                    }); })];
            case 3:
                _a.sent();
                return [4 /*yield*/, t.test('Should SKIP until match', function () { return __awaiter(void 0, void 0, void 0, function () {
                        var result;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    manager.setPolicyChain(['skip-policy', 'allow-policy']);
                                    return [4 /*yield*/, manager.evaluate(context)];
                                case 1:
                                    result = _a.sent();
                                    assert.strictEqual(result.decision, 'ALLOW');
                                    return [2 /*return*/];
                            }
                        });
                    }); })];
            case 4:
                _a.sent();
                return [4 /*yield*/, t.test('Should respect explicit chain order', function () { return __awaiter(void 0, void 0, void 0, function () {
                        var _a, _b, _c, _d;
                        return __generator(this, function (_e) {
                            switch (_e.label) {
                                case 0:
                                    // deny -> allow = DENY
                                    manager.setPolicyChain(['deny-policy', 'allow-policy']);
                                    _b = (_a = assert).strictEqual;
                                    return [4 /*yield*/, manager.evaluate(context)];
                                case 1:
                                    _b.apply(_a, [(_e.sent()).decision, 'DENY']);
                                    // allow -> deny = ALLOW
                                    manager.setPolicyChain(['allow-policy', 'deny-policy']);
                                    _d = (_c = assert).strictEqual;
                                    return [4 /*yield*/, manager.evaluate(context)];
                                case 2:
                                    _d.apply(_c, [(_e.sent()).decision, 'ALLOW']);
                                    return [2 /*return*/];
                            }
                        });
                    }); })];
            case 5:
                _a.sent();
                return [2 /*return*/];
        }
    });
}); });
//# sourceMappingURL=policy-chain.test.js.map
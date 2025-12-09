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
import fs from 'fs';
import path from 'path';
import chokidar from 'chokidar';
import vm from 'vm';
import fg from 'fast-glob';
var PolicyManager = /** @class */ (function () {
    function PolicyManager(policyPatterns) {
        this.policies = new Map();
        this.policyChain = []; // Explicit order
        this.watcher = null;
        this.chainConfig = []; // Configured chain from args
        this.policyPatterns = policyPatterns;
    }
    PolicyManager.prototype.setPolicyChain = function (chain) {
        this.chainConfig = chain;
        this.reorderPolicies();
    };
    PolicyManager.prototype.reorderPolicies = function () {
        // If chain is configured, use it.
        // Any loaded policies NOT in the chain are ignored? Or appended?
        // "Frontier" generally implies strictness. Only run what's in the chain if chain is defined.
        // If no chain defined, run all in alphabetical order?
        var _this = this;
        if (this.chainConfig.length > 0) {
            this.policyChain = this.chainConfig.filter(function (name) { return _this.policies.has(name); });
            // Check for missing policies
            var missing = this.chainConfig.filter(function (name) { return !_this.policies.has(name); });
            if (missing.length > 0) {
                console.warn("[PolicyManager] configured chain has missing policies: ".concat(missing.join(', ')));
            }
        }
        else {
            // Default: All loaded policies, sorted by name
            this.policyChain = Array.from(this.policies.keys()).sort();
        }
        console.log("[PolicyManager] Active Policy Chain: [".concat(this.policyChain.join(' -> '), "]"));
    };
    PolicyManager.prototype.start = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                this.loadPolicies();
                this.watcher = chokidar.watch(this.policyPatterns, {
                    persistent: true,
                    ignoreInitial: true,
                });
                this.watcher.on('all', function (event, path) {
                    console.log("Policy file ".concat(path, " changed (").concat(event, "), reloading..."));
                    _this.loadPolicies();
                });
                return [2 /*return*/];
            });
        });
    };
    PolicyManager.prototype.registerPolicy = function (policy, name) {
        // Dynamic registration usually from CLI args
        var policyName = name || "dynamic-".concat(Date.now());
        this.policies.set(policyName, {
            name: policyName,
            fn: policy,
            path: 'dynamic'
        });
        // If we have a chain config, we only add if it's in the chain (or if chain is empty?)
        // The dynamic 'authorize' policies from CLI should probably be Auto-Included or manually named?
        // The user said "express a bunch of policies by name".
        // The --authorize args are dynamic but unnamed.
        // Let's give them a synthetic name or assume they are always relevant?
        // Strategy: "dynamic-authorize" policies might need to be effectively "prepended" or treated as a specific named group.
        // For simplicity: Dynamic policies are added to the map. If chain is explicit, user must reference them?
        // BUT dynamic policies don't have stable names easily known to user unless we assign them.
        // Let's special case: authorize policies are likely separate or we give them fixed names e.g. 'cli-authorize-0'
        // Re-eval order
        this.reorderPolicies();
    };
    PolicyManager.prototype.loadPolicies = function () {
        var e_1, _a;
        var _this = this;
        var newPolicies = new Map();
        var files = fg.sync(this.policyPatterns);
        try {
            for (var files_1 = __values(files), files_1_1 = files_1.next(); !files_1_1.done; files_1_1 = files_1.next()) {
                var p = files_1_1.value;
                try {
                    // Expanding globs happens outside, but here policyPatterns might contain globs if reload logic passes raw globs?
                    // The constructor took already expanded paths? No, likely raw globs in index.ts logic.
                    // Wait, index.ts expanded globs: const policyPaths = fg.sync(...).
                    // But watcher passes individual file path on change.
                    // We should probably just reload all for simplicity or handle single file.
                    // Given logic structure, let's treat `this.policyPaths` as list of files or dirs/globs? 
                    // index.ts passed `fg.sync(argv.policy)`. So it's a list of files.
                    // On reload, we might need to re-glob if new files appeared? 
                    // For now, assume simple reload of known files + chokidar handling updates.
                    // If path is a file:
                    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
                        var name_1 = path.basename(p, path.extname(p)); // filename without ext
                        var code = fs.readFileSync(p, 'utf8');
                        var script = new vm.Script(code);
                        var sandbox = {
                            module: { exports: {} },
                            exports: {},
                            console: console,
                            process: process,
                        };
                        var context = vm.createContext(sandbox);
                        script.runInContext(context);
                        var policyFn = sandbox.module.exports;
                        if (typeof policyFn === 'function') {
                            newPolicies.set(name_1, { name: name_1, fn: policyFn, path: p });
                        }
                        else {
                            console.error("Policy file ".concat(p, " did not export a function."));
                        }
                    }
                }
                catch (e) {
                    console.error("Error loading policy ".concat(p, ":"), e);
                }
            }
        }
        catch (e_1_1) { e_1 = { error: e_1_1 }; }
        finally {
            try {
                if (files_1_1 && !files_1_1.done && (_a = files_1.return)) _a.call(files_1);
            }
            finally { if (e_1) throw e_1.error; }
        }
        // If we want to support dynamic policies persisting across file reloads, we need to merge?
        // Current 'this.policies' mixes file and dynamic policies.
        // Loading files shouldn't wipe dynamic policies.
        var dynamicPolicies = Array.from(this.policies.values()).filter(function (p) { return p.path === 'dynamic'; });
        this.policies = newPolicies;
        dynamicPolicies.forEach(function (p) { return _this.policies.set(p.name, p); });
        console.log("Loaded ".concat(this.policies.size, " policies (including dynamic)."));
        this.reorderPolicies();
    };
    PolicyManager.prototype.evaluate = function (context) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, _b, name_2, policy, result, decision, e_2, e_3_1;
            var e_3, _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        _d.trys.push([0, 7, 8, 9]);
                        _a = __values(this.policyChain), _b = _a.next();
                        _d.label = 1;
                    case 1:
                        if (!!_b.done) return [3 /*break*/, 6];
                        name_2 = _b.value;
                        policy = this.policies.get(name_2);
                        if (!policy)
                            return [3 /*break*/, 5];
                        _d.label = 2;
                    case 2:
                        _d.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, policy.fn(context)];
                    case 3:
                        result = _d.sent();
                        decision = result.decision || 'SKIP';
                        if (decision === 'ALLOW') {
                            console.log("[PolicyManager] Policy '".concat(name_2, "' ALLOWED request."));
                            return [2 /*return*/, { decision: 'ALLOW', modifiedRequest: result.modifiedRequest }];
                        }
                        if (decision === 'DENY') {
                            console.log("[PolicyManager] Policy '".concat(name_2, "' DENIED request."));
                            return [2 /*return*/, { decision: 'DENY' }];
                        }
                        return [3 /*break*/, 5];
                    case 4:
                        e_2 = _d.sent();
                        console.error("Error evaluating policy '".concat(name_2, "':"), e_2);
                        // Treat error as DENY for safety
                        return [2 /*return*/, { decision: 'DENY' }];
                    case 5:
                        _b = _a.next();
                        return [3 /*break*/, 1];
                    case 6: return [3 /*break*/, 9];
                    case 7:
                        e_3_1 = _d.sent();
                        e_3 = { error: e_3_1 };
                        return [3 /*break*/, 9];
                    case 8:
                        try {
                            if (_b && !_b.done && (_c = _a.return)) _c.call(_a);
                        }
                        finally { if (e_3) throw e_3.error; }
                        return [7 /*endfinally*/];
                    case 9:
                        // Default Fallback
                        console.log("[PolicyManager] No policy matched (Default Deny).");
                        return [2 /*return*/, { decision: 'DENY' }];
                }
            });
        });
    };
    return PolicyManager;
}());
export { PolicyManager };
//# sourceMappingURL=policy.js.map
import fs from 'fs';
import path from 'path';
import chokidar from 'chokidar';
import vm from 'vm';

export interface PolicyContext {
    request: any; // Fastify request
    user?: any; // Decoded JWT or user info
    utils?: any; // Utility functions
}

export type PolicyDecision = 'ALLOW' | 'DENY' | 'SKIP';

export interface PolicyResult {
    decision: PolicyDecision;
    modifiedRequest?: {
        headers?: Record<string, string>;
        url?: string;
        method?: string;
        body?: any;
    };
}

export type PolicyFunction = (context: PolicyContext) => Promise<PolicyResult>;

import fg from 'fast-glob';

interface LoadedPolicy {
    name: string;
    fn: PolicyFunction;
    path: string;
}

export class PolicyManager {
    private policyPatterns: string[];
    private policies: Map<string, LoadedPolicy> = new Map();
    private policyChain: string[] = []; // Explicit order
    private watcher: chokidar.FSWatcher | null = null;
    private chainConfig: string[] = []; // Configured chain from args

    constructor(policyPatterns: string[]) {
        this.policyPatterns = policyPatterns;
    }

    public setPolicyChain(chain: string[]) {
        this.chainConfig = chain;
        this.reorderPolicies();
    }

    private reorderPolicies() {
        // If chain is configured, use it.
        // Any loaded policies NOT in the chain are ignored? Or appended?
        // "Frontier" generally implies strictness. Only run what's in the chain if chain is defined.
        // If no chain defined, run all in alphabetical order?

        if (this.chainConfig.length > 0) {
            this.policyChain = this.chainConfig.filter(name => this.policies.has(name));

            // Check for missing policies
            const missing = this.chainConfig.filter(name => !this.policies.has(name));
            if (missing.length > 0) {
                console.warn(`[PolicyManager] configured chain has missing policies: ${missing.join(', ')}`);
            }
        } else {
            // Default: All loaded policies, sorted by name
            this.policyChain = Array.from(this.policies.keys()).sort();
        }
        console.log(`[PolicyManager] Active Policy Chain: [${this.policyChain.join(' -> ')}]`);
    }

    async start() {
        this.loadPolicies();
        this.watcher = chokidar.watch(this.policyPatterns, {
            persistent: true,
            ignoreInitial: true,
        });

        this.watcher.on('all', (event, path) => {
            console.log(`Policy file ${path} changed (${event}), reloading...`);
            this.loadPolicies();
        });
    }

    public registerPolicy(policy: PolicyFunction, name?: string) {
        // Dynamic registration usually from CLI args
        const policyName = name || `dynamic-${Date.now()}`;
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
    }

    private loadPolicies() {
        const newPolicies = new Map<string, LoadedPolicy>();
        const files = fg.sync(this.policyPatterns);

        for (const p of files) {
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
                    const name = path.basename(p, path.extname(p)); // filename without ext
                    const code = fs.readFileSync(p, 'utf8');

                    const script = new vm.Script(code);
                    const sandbox = {
                        module: { exports: {} },
                        exports: {},
                        console: console,
                        process: process,
                    };
                    const context = vm.createContext(sandbox);
                    script.runInContext(context);

                    const policyFn = (sandbox.module as any).exports;
                    if (typeof policyFn === 'function') {
                        newPolicies.set(name, { name, fn: policyFn, path: p });
                    } else {
                        console.error(`Policy file ${p} did not export a function.`);
                    }
                }
            } catch (e) {
                console.error(`Error loading policy ${p}:`, e);
            }
        }

        // If we want to support dynamic policies persisting across file reloads, we need to merge?
        // Current 'this.policies' mixes file and dynamic policies.
        // Loading files shouldn't wipe dynamic policies.
        const dynamicPolicies = Array.from(this.policies.values()).filter(p => p.path === 'dynamic');

        this.policies = newPolicies;
        dynamicPolicies.forEach(p => this.policies.set(p.name, p));

        console.log(`Loaded ${this.policies.size} policies (including dynamic).`);
        this.reorderPolicies();
    }

    async evaluate(context: PolicyContext): Promise<PolicyResult> {
        // First-Applicable Strategy
        // 1. ALLOW -> Return immediately
        // 2. DENY -> Return immediately
        // 3. SKIP -> Continue to next
        // Fallback -> DENY

        for (const name of this.policyChain) {
            const policy = this.policies.get(name);
            if (!policy) continue;

            try {
                const result = await policy.fn(context);

                // Strict Decision
                const decision = result.decision || 'SKIP'; // Default to SKIP if undefined (though interface enforces it mostly)

                if (decision === 'ALLOW') {
                    console.log(`[PolicyManager] Policy '${name}' ALLOWED request.`);
                    return { decision: 'ALLOW', modifiedRequest: result.modifiedRequest };
                }

                if (decision === 'DENY') {
                    console.log(`[PolicyManager] Policy '${name}' DENIED request.`);
                    return { decision: 'DENY' };
                }

                // If SKIP, continue loop

            } catch (e) {
                console.error(`Error evaluating policy '${name}':`, e);
                // Treat error as DENY for safety
                return { decision: 'DENY' };
            }
        }

        // Default Fallback
        console.log(`[PolicyManager] No policy matched (Default Deny).`);
        return { decision: 'DENY' };
    }
}

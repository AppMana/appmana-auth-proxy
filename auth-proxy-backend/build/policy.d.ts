export interface PolicyContext {
    request: any;
    user?: any;
    utils?: any;
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
export declare class PolicyManager {
    private policyPatterns;
    private policies;
    private policyChain;
    private watcher;
    private chainConfig;
    constructor(policyPatterns: string[]);
    setPolicyChain(chain: string[]): void;
    private reorderPolicies;
    start(): Promise<void>;
    registerPolicy(policy: PolicyFunction, name?: string): void;
    private loadPolicies;
    evaluate(context: PolicyContext): Promise<PolicyResult>;
}

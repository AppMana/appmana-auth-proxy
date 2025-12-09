import { PolicyFunction } from '../policy.js';
export interface AuthorizeConfig {
    issuer?: string;
    audience?: string;
    domains: string[];
}
export declare function createAuthorizePolicy(config: AuthorizeConfig): PolicyFunction;

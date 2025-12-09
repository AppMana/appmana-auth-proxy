import { JWTHeaderParameters, FlattenedJWSInput } from 'jose';
/**
 * Custom Key Provider for Jose that fetches JWKS with HTTP caching.
 */
export declare function getKey(protectedHeader: JWTHeaderParameters, token: FlattenedJWSInput): Promise<any>;
/**
 * Verifies a JWT using automatic discovery and caching.
 */
export declare function verifyWithDiscovery(token: string): Promise<import("jose").JWTVerifyResult<import("jose").JWTPayload> & import("jose").ResolvedKey>;

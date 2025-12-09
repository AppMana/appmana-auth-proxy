
import { createLocalJWKSet, jwtVerify, JWTHeaderParameters, FlattenedJWSInput } from 'jose';
import makeFetchHappen from 'make-fetch-happen';
import path from 'path';
import os from 'os';

// Configure caching fetcher
const cachePath = process.env.JWKS_CACHE_PATH || path.join(os.tmpdir(), 'auth-proxy-jwks-cache');
const fetchCached = makeFetchHappen.defaults({
    cachePath,
    cache: 'force-cache'
} as any);

interface OIDCConfiguration {
    jwks_uri: string;
    issuer: string;
}

const discoveryCache = new Map<string, Promise<OIDCConfiguration>>();
const jwksCache = new Map<string, ReturnType<typeof createLocalJWKSet>>();

/**
 * Discovers OIDC configuration using RFC 8414 logic with caching.
 */
async function discover(issuer: string): Promise<OIDCConfiguration> {
    if (discoveryCache.has(issuer)) {
        return discoveryCache.get(issuer)!;
    }

    const discoveryPromise = (async () => {
        // Try RFC 8414 first: /.well-known/oauth-authorization-server
        const rfc8414Url = `${issuer.replace(/\/$/, '')}/.well-known/oauth-authorization-server`;

        try {
            const res = await fetchCached(rfc8414Url);
            if (res.ok) {
                const data = await res.json() as OIDCConfiguration;
                return data;
            }
        } catch (e) {
            // ignore
        }

        // Fallback to OIDC: /.well-known/openid-configuration
        const oidcUrl = `${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`;
        const res = await fetchCached(oidcUrl);
        if (!res.ok) {
            throw new Error(`Failed to discover OIDC config for ${issuer}`);
        }
        return await res.json() as OIDCConfiguration;
    })();

    discoveryCache.set(issuer, discoveryPromise);
    try {
        return await discoveryPromise;
    } catch (e) {
        discoveryCache.delete(issuer);
        throw e;
    }
}

/**
 * Custom Key Provider for Jose that fetches JWKS with HTTP caching.
 */
export async function getKey(protectedHeader: JWTHeaderParameters, token: FlattenedJWSInput): Promise<any> {
    // 1. Decode generic payload to find issuer (without verification yet)
    // We assume 'iss' is in the payload. JOSE expects the key provider to find the key.
    // But JOSE's KeyFunction doesn't provide the payload, only header?
    // Wait, jose's jwtVerify doesn't pass payload to getKey?
    // "The function is called with (protectedHeader, token)"

    // We need to parse the token to get the issuer to find the JWKS URI.
    // Unsecured decode to find issuer.
    // Note: This is efficient for locating keys, but we verify signature immediately after.

    // Simplistic decode
    const parts = (token as any).split('.'); // Assuming compact JWS
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    const issuer = payload.iss;

    if (!issuer) {
        throw new Error('Missing issuer in JWT');
    }

    const config = await discover(issuer);
    const jwksUri = config.jwks_uri;

    // JWKS Caching Strategy:
    // We can't just cache the LocalJWKSet function forever because keys rotate.
    // But `make-fetch-happen` handles the HTTP cache for the JSON itself.
    // So if we re-fetch, it might return cached JSON.
    // Re-creating LocalJWKSet is cheap.

    // Let's rely on make-fetch-happen for caching the network request.
    const res = await fetchCached(jwksUri);
    if (!res.ok) {
        throw new Error(`Failed to fetch JWKS from ${jwksUri}`);
    }
    const jwks = await res.json() as any;

    const localJWKSet = createLocalJWKSet(jwks);
    return localJWKSet(protectedHeader, token);
}

/**
 * Verifies a JWT using automatic discovery and caching.
 */
export async function verifyWithDiscovery(token: string) {
    return jwtVerify(token, getKey);
}

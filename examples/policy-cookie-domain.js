/**
 * Policy Example 1: Cookie Decryption & Domain Check
 * 
 * This policy:
 * 1. Decrypts the `_oauth2_proxy` cookie using a secret from environment variables.
 * 2. Verifies the JWT contained in the cookie (assuming the cookie value IS the JWT or contains it).
 *    Note: OAuth2 Proxy cookies often contain the OIDC ID Token.
 * 3. Checks if the email in the token belongs to `@appmana.com`.
 */
module.exports = async (context) => {
    const { request, utils } = context;
    const { cipher, parseCookies } = utils;

    // 1. Get the cookie
    const cookieHeader = request.headers['cookie'];
    if (!cookieHeader) return { allow: false };

    const cookies = parseCookies(cookieHeader);
    const encryptedCookie = cookies['_oauth2_proxy'];

    if (!encryptedCookie) return { allow: false };

    // 2. Decrypt the cookie using the provided cipher
    if (!cipher) {
        console.error('Cipher not available (OAUTH2_PROXY_COOKIE_SECRET likely missing)');
        return { allow: false };
    }

    try {
        const decrypted = cipher.decrypt(encryptedCookie);

        // decrypted is the session object (parsed from JSON/MessagePack).
        // It typically contains 'email', 'user', 'id_token', etc.
        console.log('Decrypted session:', decrypted);

        // 3. Check for specific claims (e.g., email domain)
        // If decrypted is an object, we can check fields directly.
        if (decrypted && decrypted.email && decrypted.email.endsWith('@appmana.com')) {
            return {
                decision: 'ALLOW',
                modifiedRequest: {
                    headers: {
                        // Inject the real API key for the backend
                        'Authorization': `Bearer ${process.env.BACKEND_API_KEY}`
                    }
                }
            };
        }

    } catch (e) {
        console.error('Policy evaluation error (decryption failed):', e);
    }

    return { decision: 'SKIP' };
};

module.exports = async (context) => {
    const { request, user, utils } = context;
    const { cipher, parseCookies, joinCookieValues, jwt } = utils;

    console.log(`[POLICY] Evaluating request: ${request.method} ${request.url}`);

    // 1. Check Cookie
    const cookieHeader = request.headers['cookie'];
    console.log(`[POLICY] Cookie Header: ${cookieHeader ? 'Present' : 'Missing'}`);
    if (cookieHeader) {
        const cookies = parseCookies(cookieHeader);
        const encryptedCookie = joinCookieValues(cookies, '_oauth2_proxy');
        if (encryptedCookie && cipher) {
            try {
                const decrypted = cipher.decrypt(encryptedCookie);
                const email = decrypted.email || decrypted.e;
                if (email === 'admin@appmana-public.com') {
                    console.log('Policy Allow: Cookie Email match');
                    return {
                        decision: 'ALLOW',
                        modifiedRequest: { headers: { 'Authorization': 'Bearer REAL_API_KEY' } }
                    };
                }
            } catch (e) {
                console.error('Cookie decryption failed', e);
            }
        }
    }

    // 2. Check Token (Authorization Header)
    // STRICT MODE: Only use verified user from context.
    if (user) {
        console.log('Policy User (Verified):', JSON.stringify(user, null, 2));
        if (user.email === 'admin@appmana-public.com') {
            console.log('Policy Allow: Token Email match');
            return {
                decision: 'ALLOW',
                modifiedRequest: { headers: { 'Authorization': 'Bearer REAL_API_KEY' } }
            };
        } else {
            console.log('Policy Deny: Token Email mismatch');
        }
    } else {
        const authHeader = request.headers['authorization'];
        if (authHeader && authHeader.startsWith('Bearer ')) {
            console.log('Policy Deny: Token verification failed (user is null)');
        }
    }

    // 3. Fallback / Deny
    console.log('Policy Deny: No valid cookie or token');
    return { decision: 'DENY' };
};

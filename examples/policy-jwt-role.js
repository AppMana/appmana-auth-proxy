/**
 * Policy Example 2: JWT Role Check
 * 
 * This policy:
 * 1. Reads the `Authorization` header provided by the frontend.
 * 2. Verifies the JWT.
 * 3. Checks if the user has the 'admin' role.
 */
module.exports = async (context) => {
    const { request, utils } = context;
    const { jwt } = utils;

    const authHeader = request.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return { allow: false };
    }

    const token = authHeader.substring(7);

    try {
        // Verify the token.
        // In production, pass the secret or public key.
        // const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const decoded = jwt.decode(token); // Using decode for example if secret is not available in this context

        if (!decoded || typeof decoded !== 'object') return { allow: false };

        // Check for role
        // The claim name depends on the identity provider (e.g., 'roles', 'groups', 'realm_access.roles')
        const roles = decoded.roles || (decoded.realm_access && decoded.realm_access.roles) || [];

        if (roles.includes('admin')) {
            return {
                decision: 'ALLOW',
                modifiedRequest: {
                    headers: {
                        'X-User-Id': decoded.sub,
                        'X-User-Role': 'admin'
                    }
                }
            };
        }

    } catch (e) {
        console.error('Token verification failed:', e);
    }

    return { decision: 'SKIP' };
};

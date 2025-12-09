import KcAdminClient from '@keycloak/keycloak-admin-client';

export async function setupKeycloak(baseUrl: string) {
    const kcAdminClient = new KcAdminClient({
        baseUrl,
        realmName: 'master',
    });

    await kcAdminClient.auth({
        username: 'admin',
        password: 'admin',
        grantType: 'password',
        clientId: 'admin-cli',
    });

    // Create Realm
    const realmName = 'test-realm';
    try {
        await kcAdminClient.realms.del({ realm: realmName });
    } catch (e) {
        // Ignore if not exists
    }
    await kcAdminClient.realms.create({
        realm: realmName,
        enabled: true,
    });

    kcAdminClient.setConfig({ realmName });

    // Create Client
    const clientId = 'test-client';
    const client = await kcAdminClient.clients.create({
        clientId,
        enabled: true,
        publicClient: false,
        clientAuthenticatorType: 'client-secret',
        secret: 'test-client-secret',
        redirectUris: ['*'], // For testing
        webOrigins: ['*'],
        standardFlowEnabled: true,
        directAccessGrantsEnabled: true,
    });

    // Create Users
    const user = await kcAdminClient.users.create({
        username: 'user',
        email: 'user@example.com',
        enabled: true,
        emailVerified: true,
        credentials: [{ type: 'password', value: 'password', temporary: false }],
    });

    const admin = await kcAdminClient.users.create({
        username: 'admin',
        email: 'admin@appmana-public.com', // Matches policy domain check
        enabled: true,
        emailVerified: true,
        credentials: [{ type: 'password', value: 'password', temporary: false }],
    });

    // Create Role
    await kcAdminClient.roles.create({
        name: 'admin',
    });

    // Assign Role to Admin User
    // Need to fetch role and user again to get IDs if create didn't return them fully?
    // create returns { id: ... }

    const adminRole = await kcAdminClient.roles.findOneByName({ name: 'admin' });
    if (adminRole && adminRole.name && adminRole.id) {
        await kcAdminClient.users.addRealmRoleMappings({
            id: admin.id,
            roles: [{ id: adminRole.id, name: adminRole.name }],
        });
    }

    return {
        realm: realmName,
        clientId,
        clientSecret: 'test-client-secret',
        issuer: `${baseUrl}/realms/${realmName}`
    };
}

export function getRoles(user: any): string[] {
  if (!user) return [];

  const roles: Set<string> = new Set();

  // 1. KeycloakRealm Access
  if (user.realm_access && Array.isArray(user.realm_access.roles)) {
    user.realm_access.roles.forEach((r: string) => roles.add(r));
  }

  // 2. Keycloak Resource Access
  if (user.resource_access) {
    Object.keys(user.resource_access).forEach((client) => {
      const clientAccess = user.resource_access[client];
      if (clientAccess && Array.isArray(clientAccess.roles)) {
        clientAccess.roles.forEach((r: string) => roles.add(r)); // Add generic role name
        clientAccess.roles.forEach((r: string) => roles.add(`${client}:${r}`)); // Add namespaced role
      }
    });
  }

  // 3. Generic 'roles' claim
  if (Array.isArray(user.roles)) {
    user.roles.forEach((r: string) => roles.add(r));
  }

  return Array.from(roles);
}

export function getGroups(user: any): string[] {
  if (!user) return [];

  const groups: Set<string> = new Set();

  // 1. Generic 'groups' claim (Okta often uses this)
  if (Array.isArray(user.groups)) {
    user.groups.forEach((g: string) => groups.add(g));
  }

  // 2. Keycloak 'groups' assumption (if mapped)
  // Keycloak doesn't map groups to token by default unless configured.

  return Array.from(groups);
}

export function hasRole(user: any, role: string): boolean {
  const roles = getRoles(user);
  return roles.includes(role);
}

export function hasGroup(user: any, group: string): boolean {
  const groups = getGroups(user);
  return groups.includes(group);
}

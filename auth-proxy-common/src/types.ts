export interface PolicyContext {
  request: any; // Fastify request (we can improve this type later if needed)
  user?: any; // Decoded JWT (or null)
  utils: PolicyUtils;
}

export interface PolicyResult {
  allow: boolean;
  continue?: boolean; // If true, continue to next policy
  modifiedRequest?: {
    headers?: Record<string, string>;
    url?: string;
    method?: string;
    body?: any;
  };
}

export interface PolicyUtils {
  cipher?: any; // OAuth2ProxyCipher instance (typed as any to avoid circular deps if needed, or import class)
  parseCookies: (header: string) => Record<string, string>;
  joinCookieValues: (cookies: Record<string, string>, name: string) => string | null;
  jwt: any; // jsonwebtoken package

  // Helpers
  getRoles: (user: any) => string[];
  getGroups: (user: any) => string[];
  hasRole: (user: any, role: string) => boolean;
  hasGroup: (user: any, group: string) => boolean;
}

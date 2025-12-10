import { PolicyFunction, PolicyContext, PolicyResult } from "../policy.js";
import micromatch from "micromatch";

export interface AuthorizeConfig {
  issuer?: string;
  audience?: string;
  domains: string[];
}

export function createAuthorizePolicy(config: AuthorizeConfig): PolicyFunction {
  return async (context: PolicyContext): Promise<PolicyResult> => {
    const { request, user, utils } = context;
    console.log("[AuthorizePolicy] Evaluating request for config:", JSON.stringify(config));

    // 1. Check allowed domains (target URL from header)
    const targetUrl = request.headers["x-proxy-target-url"] as string;
    if (!targetUrl) {
      // If explicit domains are configured, we expect a target.
      // If the request doesn't imply a target (e.g. direct backend access), maybe we skip?
      // But for a proxy, we usually need a target.
      // Let's assume index.ts validation handles missing headers if upstream is missing,
      // but here we enforce the specific domain constraint.
      console.warn("[AuthorizePolicy] Missing X-Proxy-Target-Url header");
      return { decision: "DENY" };
    }

    try {
      const u = new URL(targetUrl);
      const hostToCheck = u.host;
      const originToCheck = u.origin;

      const isAllowed =
        micromatch.isMatch(hostToCheck, config.domains) || micromatch.isMatch(originToCheck, config.domains);

      if (!isAllowed) {
        console.warn(`[AuthorizePolicy] Target ${targetUrl} not allowed by config domains: ${config.domains}`);
        // If strict firewall: DENY. If we just want to say "This policy doesn't allow it, try next", we'd skip.
        // But 'authorize' implies enforcement. If it matches target but fails check, it should probably DENY?
        // Wait, if it *doesn't match* the domains, it might ideally SKIP (not applicable).
        // BUT micromatch checks if it *is* in the allowed list.
        // If `config.domains` is the allowlist for this policy.
        // If I am Policy "ExternalAPI" and domains=["api.com"]. And request is "other.com".
        // I should SKIP.
        // However, the current logic was enforcing it.
        // Let's stick to SKIP if we want fall-through, or DENY if we assume this policy *must* handle it.
        // Given the CLI arg usually sets global allowed domains too, let's treat "target not in allowed" as SKIP (so other component might handle, or default deny).
        return { decision: "SKIP" };
      }
    } catch (e) {
      console.warn(`[AuthorizePolicy] Invalid target URL: ${targetUrl}`);
      return { decision: "DENY" };
    }

    // 2. Validate User/Token (Issuer & Audience)
    if (!user) {
      console.warn("[AuthorizePolicy] No user/token found");
      return { decision: "DENY" }; // Require user if this policy applies?
    }

    // JWT verification (signature) is handled by the main pipeline (index.ts) or utils.
    // Here we check claims if config requires them.

    if (config.issuer) {
      if (user.iss !== config.issuer) {
        console.warn(`[AuthorizePolicy] Issuer mismatch. Expected: ${config.issuer}, Got: ${user.iss}`);
        return { decision: "DENY" };
      }
    }

    if (config.audience) {
      // aud can be string or array
      const userAud = user.aud;
      let audMatch = false;
      if (typeof userAud === "string") {
        audMatch = userAud === config.audience;
      } else if (Array.isArray(userAud)) {
        audMatch = userAud.includes(config.audience);
      }

      if (!audMatch) {
        console.warn(`[AuthorizePolicy] Audience mismatch. Expected: ${config.audience}, Got: ${user.aud}`);
        return { decision: "DENY" };
      }
    }

    console.log("[AuthorizePolicy] Request authorized");
    return { decision: "ALLOW" };
  };
}

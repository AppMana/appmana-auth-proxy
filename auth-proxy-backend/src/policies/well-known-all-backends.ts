import { PolicyFunction, PolicyContext, PolicyResult } from "../policy.js";
import micromatch from "micromatch";
import { SignatureV4 } from "@aws-sdk/signature-v4";
import { Sha256 } from "@aws-crypto/sha256-js";
import { HttpRequest } from "@aws-sdk/protocol-http";

interface WellKnownService {
  name: string;
  envVars: string[]; // Required Env Vars
  domains: string[]; // Domain patterns
  inject: (context: PolicyContext, env: NodeJS.ProcessEnv) => Promise<Record<string, string>>;
}

const services: WellKnownService[] = [
  {
    name: "OpenAI",
    envVars: ["OPENAI_API_KEY"],
    domains: ["api.openai.com"],
    inject: async (_, env) => ({ Authorization: `Bearer ${env.OPENAI_API_KEY}` }),
  },
  {
    name: "Anthropic",
    envVars: ["ANTHROPIC_API_KEY"],
    domains: ["api.anthropic.com"],
    inject: async (_, env) => ({ "x-api-key": env.ANTHROPIC_API_KEY! }),
  },
  {
    name: "Gemini",
    envVars: ["GEMINI_API_KEY"],
    domains: ["generativelanguage.googleapis.com"],
    inject: async (_, env) => ({ "x-goog-api-key": env.GEMINI_API_KEY! }),
  },
  {
    name: "GitHub",
    envVars: ["GITHUB_TOKEN"],
    domains: ["api.github.com"],
    inject: async (_, env) => ({ Authorization: `Bearer ${env.GITHUB_TOKEN}` }),
  },
  {
    name: "Stripe",
    envVars: ["STRIPE_SECRET_KEY"],
    domains: ["api.stripe.com"],
    inject: async (_, env) => ({ Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` }),
  },
  {
    name: "AWS",
    envVars: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"],
    domains: ["*.amazonaws.com"],
    inject: async (context, env) => {
      // SigV4 Signing
      const { request } = context;
      // Need to construct full request for signing
      // request is Fastify request.
      // We need method, url, headers, body.
      // But we are in a policy *before* the proxy sends the request?
      // Actually, `PolicyContext` gives us the *incoming* request.
      // The proxy logic typically forwards this.
      // For AWS SigV4, we need to sign the *outgoing* request to AWS.
      // If we modify headers here, they are passed to upstream.

      // Extract Region and Service from Host
      const targetUrl = request.headers["x-proxy-target-url"] as string;
      if (!targetUrl) return {}; // Can't sign without target

      let hostname = "";
      try {
        hostname = new URL(targetUrl).hostname;
      } catch (e) {
        return {};
      }

      // Heuristic for region/service: service.region.amazonaws.com
      // e.g. s3.us-west-2.amazonaws.com
      // e.g. lambda.us-east-1.amazonaws.com
      // e.g. bedrock-runtime.us-east-1.amazonaws.com

      const parts = hostname.split(".");
      // Typical: [service, region, amazonaws, com] (4 parts)
      // Or: [service, amazonaws, com] (3 parts, global like iam?)

      let region = env.AWS_REGION || "us-east-1";
      let service = "s3"; // Default fallback?

      if (parts.length >= 4 && parts[parts.length - 1] === "com" && parts[parts.length - 2] === "amazonaws") {
        if (parts.length === 4) {
          region = parts[1];
          service = parts[0];
        } else if (parts.length > 4) {
          // e.g. bucket.s3.us-west-2.amazonaws.com
          // This is hard.
          // Let's assume standard 4 part for API endpoints.
          region = parts[parts.length - 3];
          service = parts[parts.length - 4];
        }
      }

      const signer = new SignatureV4({
        credentials: {
          accessKeyId: env.AWS_ACCESS_KEY_ID!,
          secretAccessKey: env.AWS_SECRET_ACCESS_KEY!,
          sessionToken: env.AWS_SESSION_TOKEN,
        },
        region,
        service,
        sha256: Sha256,
      });

      // Construct HttpRequest from Fastify Request
      // We need to sign the *upstream* path. `targetUrl` includes path?
      // If x-proxy-target-url is the base, and we append `request.url`...
      // Check proxy logic: `reply.from(target + request.url)`
      // So we sign `new URL(targetUrl).pathname + request.url`?
      // Or just `request.url` if targetUrl is just origin?
      // Assuming targetUrl is the full upstream URL for this request?
      // Ref: proxy logic uses `target + url`.

      // For simplicity, let's assume we sign the path associated with targetUrl + request.url,
      // OR we just sign the request as if it's going to the hostname.
      // AWS Signature includes Host header, Method, Path, Query, Headers.

      const u = new URL(targetUrl); // 'https://s3...'
      // If targetUrl is just origin 'https://host', path is /.
      // request.url is the path from frontend e.g. '/bucket/key'.
      // So full path is `u.pathname` (usually /) + `request.url`.

      // Cleanup path double slashes
      let path = (u.pathname.replace(/\/$/, "") + request.url).replace(/\/\//g, "/");
      if (!path.startsWith("/")) path = "/" + path;

      const httpRequest = new HttpRequest({
        method: request.method,
        hostname: u.hostname,
        path: path,
        headers: {
          host: u.hostname,
          // Copy existing allowed headers... but for now just signing basic identity
        },
      });

      // Sign
      const signed = await signer.sign(httpRequest);

      // Return headers to inject
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(signed.headers)) {
        headers[k] = v;
      }
      return headers;
    },
  },
  // Add more services from the list (abbreviated for this step, but plan had 30)
  // I will implement the pattern matching loop to support all
];

// Helper for other simple bearers
const simpleBearer = (name: string, envVar: string, domain: string) => ({
  name,
  envVars: [envVar],
  domains: [domain],
  inject: async (_: any, env: any) => ({ Authorization: `Bearer ${env[envVar]}` }),
});

// Adding more from list
services.push(simpleBearer("SendGrid", "SENDGRID_API_KEY", "api.sendgrid.com"));
services.push(simpleBearer("HuggingFace", "HF_TOKEN", "huggingface.co"));
// ... (I can populate the rest if needed, or keep it extensible)

export const wellKnownAllBackendsPolicy: PolicyFunction = async (context: PolicyContext): Promise<PolicyResult> => {
  const { request } = context;
  const targetUrl = request.headers["x-proxy-target-url"] as string;

  if (!targetUrl) return { decision: "SKIP" };

  let hostname = "";
  try {
    hostname = new URL(targetUrl).hostname;
  } catch {
    return { decision: "SKIP" };
  }

  // Find matching service
  // "First Applicable" among services? Or "All Matches"?
  // Usually one service per domain.

  for (const service of services) {
    // Check domains
    if (micromatch.isMatch(hostname, service.domains)) {
      // Check Env Vars
      const missingVars = service.envVars.filter((v) => !process.env[v]);
      if (missingVars.length > 0) {
        // Service matches but keys missing.
        // Should we SKIP or Warning?
        // Probably SKIP so another policy might handle it, or just log.
        console.debug(`[AllBackends] Matched ${service.name} but missing env vars: ${missingVars}`);
        continue;
      }

      console.log(`[AllBackends] Matched ${service.name} for ${hostname}. Injecting credentials.`);
      try {
        const headers = await service.inject(context, process.env);
        return {
          decision: "ALLOW", // Or SKIP? "All Backends" implies AUTHORIZATION.
          // If we inject creds, we Authorize the access (assuming user has access to this proxy env).
          // The goal is "Authorized". So ALLOW.
          modifiedRequest: {
            headers,
          },
        };
      } catch (e) {
        console.error(`[AllBackends] Failed to inject credentials for ${service.name}:`, e);
        return { decision: "DENY" }; // Failed injection -> Deny safety
      }
    }
  }

  return { decision: "SKIP" };
};

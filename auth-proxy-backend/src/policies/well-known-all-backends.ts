import { PolicyFunction, PolicyContext, PolicyResult } from "../policy.js";
import micromatch from "micromatch";

// AWS Imports
import { SignatureV4 } from "@aws-sdk/signature-v4";
import { Sha256 } from "@aws-crypto/sha256-js";
import { HttpRequest } from "@aws-sdk/protocol-http";
import { defaultProvider } from "@aws-sdk/credential-provider-node";

// Google Imports
import { GoogleAuth } from "google-auth-library";

// Azure Imports
import { DefaultAzureCredential } from "@azure/identity";

interface WellKnownService {
  name: string;
  domains: string[]; // Glob patterns
  envVars?: string[]; // Optional check for "fast fail"
  inject: (context: PolicyContext) => Promise<Record<string, string>>;
}

/**
 * ------------------------------------------------------------------
 * CLOUD PROVIDER IMPLEMENTATIONS (The "Heavy" Logic)
 * ------------------------------------------------------------------
 */

// 1. AWS Signature V4
const injectAwsSignature = async (context: PolicyContext): Promise<Record<string, string>> => {
  const { request } = context;
  const targetUrlStr = request.headers["x-proxy-target-url"] as string;
  if (!targetUrlStr) throw new Error("Missing x-proxy-target-url header");

  const url = new URL(targetUrlStr);
  const region = process.env.AWS_REGION || "us-east-1";

  // Heuristic: extract service from hostname or default to 'execute-api'
  let service = "execute-api";
  const hostParts = url.hostname.split(".");
  if (
    hostParts.length >= 3 &&
    hostParts[hostParts.length - 1] === "com" &&
    hostParts[hostParts.length - 2] === "amazonaws"
  ) {
    service = hostParts[0];
  }

  const signer = new SignatureV4({
    credentials: defaultProvider(),
    region,
    service,
    sha256: Sha256,
  });

  const httpRequest = new HttpRequest({
    method: request.method,
    hostname: url.hostname,
    path: url.pathname + url.search,
    headers: {
      host: url.hostname,
      "x-amz-content-sha256": "UNSIGNED-PAYLOAD",
    },
  });

  const signedRequest = await signer.sign(httpRequest);
  const headers: Record<string, string> = {};
  for (const [key, val] of Object.entries(signedRequest.headers)) {
    headers[key] = String(val);
  }
  return headers;
};

// 2. Google Cloud Platform (ADC)
const injectGcpCredentials = async (): Promise<Record<string, string>> => {
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const client = await auth.getClient();
  const accessToken = await client.getAccessToken();
  if (!accessToken.token) throw new Error("Failed to generate GCP Access Token");
  return { Authorization: `Bearer ${accessToken.token}` };
};

// 3. Azure (Default Credential)
const injectAzureCredentials = async (): Promise<Record<string, string>> => {
  const credential = new DefaultAzureCredential();
  const tokenResponse = await credential.getToken("https://management.azure.com/.default");
  return { Authorization: `Bearer ${tokenResponse.token}` };
};

/**
 * ------------------------------------------------------------------
 * SAAS HELPERS
 * ------------------------------------------------------------------
 */

const bearerService = (name: string, domains: string[], envVar: string): WellKnownService => ({
  name,
  domains,
  envVars: [envVar],
  inject: async () => {
    const token = process.env[envVar];
    if (!token) throw new Error(`Missing ${envVar}`);
    return { Authorization: `Bearer ${token}` };
  },
});

const basicAuthService = (name: string, domains: string[], userEnv: string, passEnv: string): WellKnownService => ({
  name,
  domains,
  envVars: [userEnv, passEnv],
  inject: async () => {
    const user = process.env[userEnv] || "";
    const pass = process.env[passEnv] || "";
    const creds = Buffer.from(`${user}:${pass}`).toString("base64");
    return { Authorization: `Basic ${creds}` };
  },
});

const customHeaderService = (
  name: string,
  domains: string[],
  envVar: string,
  headerName: string,
): WellKnownService => ({
  name,
  domains,
  envVars: [envVar],
  inject: async () => {
    const val = process.env[envVar];
    if (!val) throw new Error(`Missing ${envVar}`);
    return { [headerName]: val };
  },
});

/**
 * ------------------------------------------------------------------
 * THE GLOBAL REGISTRY (2024-2025)
 * ------------------------------------------------------------------
 */

const services: WellKnownService[] = [
  // --- 1. AI & Machine Learning ---
  bearerService("OpenAI", ["api.openai.com"], "OPENAI_API_KEY"),
  bearerService("HuggingFace", ["huggingface.co", "api-inference.huggingface.co"], "HUGGINGFACE_TOKEN"),
  bearerService("Mistral", ["api.mistral.ai"], "MISTRAL_API_KEY"),
  bearerService("Cohere", ["api.cohere.ai"], "CO_API_KEY"),
  bearerService("Stability AI", ["api.stability.ai"], "STABILITY_API_KEY"),
  customHeaderService("DeepL", ["api-free.deepl.com", "api.deepl.com"], "DEEPL_AUTH_KEY", "DeepL-Auth-Key"),
  customHeaderService("Pinecone", ["api.pinecone.io"], "PINECONE_API_KEY", "Api-Key"),
  {
    name: "Anthropic",
    domains: ["api.anthropic.com"],
    envVars: ["ANTHROPIC_API_KEY"],
    inject: async () => ({
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    }),
  },
  {
    name: "Google Gemini",
    domains: ["generativelanguage.googleapis.com"],
    envVars: ["GEMINI_API_KEY"],
    inject: async () => ({ "x-goog-api-key": process.env.GEMINI_API_KEY! }),
  },
  {
    name: "Replicate",
    domains: ["api.replicate.com"],
    envVars: ["REPLICATE_API_TOKEN"],
    inject: async () => ({ Authorization: `Token ${process.env.REPLICATE_API_TOKEN}` }),
  },

  // --- 2. Cloud Infrastructure & PaaS ---
  {
    name: "AWS",
    domains: ["*.amazonaws.com"],
    inject: injectAwsSignature,
  },
  {
    name: "Google Cloud (Generic)",
    domains: ["*.googleapis.com", "*.cloudfunctions.net", "*.run.app"],
    inject: injectGcpCredentials,
  },
  {
    name: "Azure Management",
    domains: ["management.azure.com", "*.azure.com"],
    inject: injectAzureCredentials,
  },
  bearerService("DigitalOcean", ["api.digitalocean.com"], "DIGITALOCEAN_ACCESS_TOKEN"),
  bearerService("Vercel", ["api.vercel.com"], "VERCEL_TOKEN"),
  bearerService("Netlify", ["api.netlify.com"], "NETLIFY_AUTH_TOKEN"),
  bearerService("Linode", ["api.linode.com"], "LINODE_TOKEN"),
  bearerService("Cloudflare", ["api.cloudflare.com"], "CLOUDFLARE_API_TOKEN"),
  bearerService("Render", ["api.render.com"], "RENDER_API_KEY"),
  bearerService("Railway", ["backboard.railway.app"], "RAILWAY_TOKEN"),
  bearerService("Fly.io", ["api.fly.io"], "FLY_API_TOKEN"),
  {
    name: "Heroku",
    domains: ["api.heroku.com"],
    envVars: ["HEROKU_API_KEY"],
    inject: async () => ({
      Authorization: `Bearer ${process.env.HEROKU_API_KEY}`,
      Accept: "application/vnd.heroku+json; version=3",
    }),
  },

  // --- 3. Development & Collaboration ---
  {
    name: "GitHub",
    domains: ["api.github.com"],
    envVars: ["GITHUB_TOKEN"],
    inject: async () => ({
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github.v3+json",
    }),
  },
  customHeaderService("GitLab", ["gitlab.com", "api.gitlab.com"], "GITLAB_TOKEN", "PRIVATE-TOKEN"),
  basicAuthService("Bitbucket", ["api.bitbucket.org"], "BITBUCKET_USERNAME", "BITBUCKET_APP_PASSWORD"),
  basicAuthService("Jira Cloud", ["*.atlassian.net"], "JIRA_EMAIL", "JIRA_API_TOKEN"),
  basicAuthService("Confluence Cloud", ["*.atlassian.net"], "CONFLUENCE_EMAIL", "CONFLUENCE_API_TOKEN"),
  customHeaderService("Linear", ["api.linear.app"], "LINEAR_API_KEY", "Authorization"),
  bearerService("Asana", ["app.asana.com"], "ASANA_ACCESS_TOKEN"),
  customHeaderService("Monday.com", ["api.monday.com"], "MONDAY_API_TOKEN", "Authorization"),
  customHeaderService("ClickUp", ["api.clickup.com"], "CLICKUP_API_TOKEN", "Authorization"),
  bearerService("Notion", ["api.notion.com"], "NOTION_API_KEY"), // Version header optional but recommended
  bearerService("Airtable", ["api.airtable.com"], "AIRTABLE_API_KEY"),
  bearerService("Todoist", ["api.todoist.com"], "TODOIST_API_TOKEN"),
  bearerService("Docker Hub", ["hub.docker.com"], "DOCKER_HUB_TOKEN"),
  bearerService("npm", ["registry.npmjs.org"], "NPM_TOKEN"),
  {
    name: "Snyk",
    domains: ["api.snyk.io"],
    envVars: ["SNYK_TOKEN"],
    inject: async () => ({ Authorization: `token ${process.env.SNYK_TOKEN}` }),
  },

  // --- 4. Communication & Messaging ---
  bearerService("SendGrid", ["api.sendgrid.com"], "SENDGRID_API_KEY"),
  basicAuthService("Twilio", ["api.twilio.com"], "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"),
  bearerService("Slack", ["slack.com"], "SLACK_BOT_TOKEN"),
  bearerService("Microsoft Teams Graph", ["graph.microsoft.com"], "MS_TEAMS_ACCESS_TOKEN"),
  bearerService("Zoom", ["api.zoom.us"], "ZOOM_JWT_TOKEN"),
  customHeaderService("MessageBird", ["rest.messagebird.com"], "MESSAGEBIRD_ACCESS_KEY", "AccessKey"),
  customHeaderService("Postmark", ["api.postmarkapp.com"], "POSTMARK_SERVER_TOKEN", "X-Postmark-Server-Token"),
  {
    name: "Mailchimp",
    domains: ["api.mailchimp.com", "*.api.mailchimp.com"],
    envVars: ["MAILCHIMP_API_KEY"],
    inject: async () => {
      // User is anything, pass is key
      const creds = Buffer.from(`anystring:${process.env.MAILCHIMP_API_KEY}`).toString("base64");
      return { Authorization: `Basic ${creds}` };
    },
  },
  {
    name: "Discord",
    domains: ["discord.com", "discordapp.com"],
    envVars: ["DISCORD_BOT_TOKEN"],
    inject: async () => ({ Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` }),
  },
  {
    name: "Mailgun",
    domains: ["api.mailgun.net"],
    envVars: ["MAILGUN_API_KEY"],
    inject: async () => {
      const creds = Buffer.from(`api:${process.env.MAILGUN_API_KEY}`).toString("base64");
      return { Authorization: `Basic ${creds}` };
    },
  },

  // --- 5. Finance & Payments ---
  bearerService("Stripe", ["api.stripe.com"], "STRIPE_SECRET_KEY"),
  bearerService("PayPal", ["api.paypal.com", "api.sandbox.paypal.com"], "PAYPAL_ACCESS_TOKEN"),
  bearerService("Square", ["connect.squareup.com"], "SQUARE_ACCESS_TOKEN"),
  bearerService("Coinbase", ["api.coinbase.com"], "COINBASE_API_KEY"),
  bearerService("Wise", ["api.transferwise.com"], "WISE_API_TOKEN"),
  bearerService("Paddle", ["api.paddle.com", "sandbox-api.paddle.com"], "PADDLE_API_KEY"),
  bearerService("Lemon Squeezy", ["api.lemonsqueezy.com"], "LEMONSQUEEZY_API_KEY"),
  bearerService("RevenueCat", ["api.revenuecat.com"], "REVENUECAT_API_KEY"),
  customHeaderService("Binance", ["api.binance.com"], "BINANCE_API_KEY", "X-MBX-APIKEY"),
  customHeaderService("Adyen", ["*.adyen.com"], "ADYEN_API_KEY", "x-api-key"),
  basicAuthService("Razorpay", ["api.razorpay.com"], "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"),
  {
    name: "Plaid",
    domains: ["*.plaid.com"],
    envVars: ["PLAID_CLIENT_ID", "PLAID_SECRET"],
    inject: async () => ({
      "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID!,
      "PLAID-SECRET": process.env.PLAID_SECRET!,
    }),
  },

  // --- 6. E-Commerce & CMS ---
  customHeaderService("Shopify", ["*.myshopify.com"], "SHOPIFY_ACCESS_TOKEN", "X-Shopify-Access-Token"),
  customHeaderService("BigCommerce", ["api.bigcommerce.com"], "BIGCOMMERCE_ACCESS_TOKEN", "X-Auth-Token"),
  bearerService("Contentful", ["api.contentful.com", "preview.contentful.com"], "CONTENTFUL_ACCESS_TOKEN"),
  bearerService("Strapi", ["*"], "STRAPI_API_TOKEN"), // Wildcard domain handling depends on implementation
  bearerService("Sanity", ["api.sanity.io"], "SANITY_AUTH_TOKEN"),
  bearerService("Webflow", ["api.webflow.com"], "WEBFLOW_API_TOKEN"),

  // --- 7. Analytics & Monitoring ---
  customHeaderService("New Relic", ["api.newrelic.com"], "NEW_RELIC_API_KEY", "Api-Key"),
  bearerService("Sentry", ["sentry.io"], "SENTRY_AUTH_TOKEN"),
  bearerService("PostHog", ["app.posthog.com"], "POSTHOG_API_KEY"),
  bearerService("Grafana Cloud", ["grafana.net"], "GRAFANA_API_KEY"),
  {
    name: "Datadog",
    domains: ["api.datadoghq.com"],
    envVars: ["DD_API_KEY", "DD_APP_KEY"],
    inject: async () => ({
      "DD-API-KEY": process.env.DD_API_KEY!,
      "DD-APPLICATION-KEY": process.env.DD_APP_KEY!,
    }),
  },
  {
    name: "Splunk",
    domains: ["*.splunkcloud.com"],
    envVars: ["SPLUNK_HEC_TOKEN"],
    inject: async () => ({ Authorization: `Splunk ${process.env.SPLUNK_HEC_TOKEN}` }),
  },
  {
    name: "Mixpanel",
    domains: ["api.mixpanel.com"],
    envVars: ["MIXPANEL_API_SECRET"],
    inject: async () => {
      const creds = Buffer.from(`${process.env.MIXPANEL_API_SECRET}:`).toString("base64");
      return { Authorization: `Basic ${creds}` };
    },
  },

  // --- 8. Social & Identity ---
  bearerService("Twitter/X", ["api.twitter.com"], "TWITTER_BEARER_TOKEN"),
  bearerService("Facebook/Instagram", ["graph.facebook.com", "graph.instagram.com"], "FACEBOOK_ACCESS_TOKEN"),
  bearerService("LinkedIn", ["api.linkedin.com"], "LINKEDIN_ACCESS_TOKEN"),
  bearerService("Spotify", ["api.spotify.com"], "SPOTIFY_ACCESS_TOKEN"),
  bearerService("Auth0", ["*.auth0.com"], "AUTH0_MANAGEMENT_TOKEN"),
  bearerService("Clerk", ["api.clerk.com"], "CLERK_SECRET_KEY"),
  bearerService("Firebase Auth", ["identitytoolkit.googleapis.com"], "FIREBASE_ACCESS_TOKEN"),
  {
    name: "Supabase",
    domains: ["*.supabase.co"],
    envVars: ["SUPABASE_SERVICE_ROLE_KEY"],
    inject: async () => ({
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    }),
  },
  {
    name: "Okta",
    domains: ["*.okta.com"],
    envVars: ["OKTA_API_TOKEN"],
    inject: async () => ({ Authorization: `SSWS ${process.env.OKTA_API_TOKEN}` }),
  },
];

/**
 * ------------------------------------------------------------------
 * THE POLICY
 * ------------------------------------------------------------------
 */

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

  // Iterate registry
  for (const service of services) {
    if (micromatch.isMatch(hostname, service.domains)) {
      // 1. Check required Env Vars (if defined)
      if (service.envVars) {
        const missing = service.envVars.filter((v) => !process.env[v]);
        if (missing.length > 0) {
          // Silent skip is usually better than spamming logs in a zero-trust proxy
          // unless debugging is enabled.
          continue;
        }
      }

      // 2. Attempt Injection
      try {
        console.log(`[AllBackends] Match ${service.name}. Injecting credentials.`);
        const headers = await service.inject(context);

        return {
          decision: "ALLOW",
          modifiedRequest: { headers },
        };
      } catch (error) {
        console.error(`[AllBackends] Injection failed for ${service.name}:`, error);
        return { decision: "DENY" };
      }
    }
  }

  return { decision: "SKIP" };
};

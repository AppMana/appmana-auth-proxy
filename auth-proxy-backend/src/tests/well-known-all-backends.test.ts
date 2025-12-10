import { test, expect } from "@playwright/test";
import { wellKnownAllBackendsPolicy } from "../policies/well-known-all-backends";
import { PolicyContext } from "../policy";

// Mock PolicyContext
const createMockContext = (url: string, targetUrl: string): PolicyContext => ({
  request: {
    method: "GET",
    url: url, // path
    headers: {
      "x-proxy-target-url": targetUrl,
    },
    // Mock other parts if needed
  } as any,
  utils: {} as any,
});

test("WellKnownAllBackends: OpenAI Injection", async () => {
  process.env.OPENAI_API_KEY = "sk-test-key";

  const context = createMockContext("/v1/chat/completions", "https://api.openai.com");
  const result = await wellKnownAllBackendsPolicy(context);

  expect(result.decision).toBe("ALLOW");
  expect(result.modifiedRequest?.headers?.["Authorization"]).toBe("Bearer sk-test-key");
});

test("WellKnownAllBackends: Anthropic Injection", async () => {
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";

  const context = createMockContext("/v1/messages", "https://api.anthropic.com");
  const result = await wellKnownAllBackendsPolicy(context);

  expect(result.decision).toBe("ALLOW");
  expect(result.modifiedRequest?.headers?.["x-api-key"]).toBe("sk-ant-test");
});

test("WellKnownAllBackends: AWS injection (SigV4)", async () => {
  process.env.AWS_ACCESS_KEY_ID = "AKIAFAIL";
  process.env.AWS_SECRET_ACCESS_KEY = "secret";
  process.env.AWS_REGION = "us-east-1";

  const context = createMockContext("/bucket/key", "https://s3.us-east-1.amazonaws.com");
  const result = await wellKnownAllBackendsPolicy(context);

  expect(result.decision).toBe("ALLOW");
  const headers = result.modifiedRequest?.headers || {};

  expect(headers["Authorization"]).toContain("AWS4-HMAC-SHA256");
  expect(headers["Authorization"]).toContain("Credential=AKIAFAIL/");
  expect(headers["x-amz-date"]).toBeDefined();
  // content-sha256 might vary or be calculated
});

test("WellKnownAllBackends: Skip if no match", async () => {
  const context = createMockContext("/", "https://unknown.com");
  const result = await wellKnownAllBackendsPolicy(context);

  expect(result.decision).toBe("SKIP");
});

test("WellKnownAllBackends: Skip/Log if missing env", async () => {
  delete process.env.STRIPE_SECRET_KEY;
  const context = createMockContext("/", "https://api.stripe.com");

  // Should skip if keys are missing
  const result = await wellKnownAllBackendsPolicy(context);
  expect(result.decision).toBe("SKIP");
});

import { test, describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { wellKnownAllBackendsPolicy } from '../policies/well-known-all-backends.js';
import { PolicyContext } from '../policy.js';

// Mock PolicyContext
const createMockContext = (url: string, targetUrl: string): PolicyContext => ({
  request: {
    method: "GET",
    url: url, // path
    headers: {
      "x-proxy-target-url": targetUrl,
    },
    raw: { url, headers: {} } as any,
  } as any,
  user: null,
  utils: {} as any,
});

describe("WellKnownAllBackends Policy", () => {

  // Clear env vars after each test
  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.AWS_REGION;
    delete process.env.STRIPE_SECRET_KEY;
  });

  it("should inject OpenAI API Key", async () => {
    process.env.OPENAI_API_KEY = "sk-test-key";

    const context = createMockContext("/v1/chat/completions", "https://api.openai.com");
    const result = await wellKnownAllBackendsPolicy(context);

    assert.equal(result.decision, "ALLOW");
    assert.equal(result.modifiedRequest?.headers?.["Authorization"], "Bearer sk-test-key");
  });

  it("should inject Anthropic API Key", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";

    const context = createMockContext("/v1/messages", "https://api.anthropic.com");
    const result = await wellKnownAllBackendsPolicy(context);

    assert.equal(result.decision, "ALLOW");
    assert.equal(result.modifiedRequest?.headers?.["x-api-key"], "sk-ant-test");
  });

  it("should inject AWS SigV4 headers", async () => {
    process.env.AWS_ACCESS_KEY_ID = "AKIAFAIL";
    process.env.AWS_SECRET_ACCESS_KEY = "secret";
    process.env.AWS_REGION = "us-east-1";

    const context = createMockContext("/bucket/key", "https://s3.us-east-1.amazonaws.com");
    const result = await wellKnownAllBackendsPolicy(context);

    assert.equal(result.decision, "ALLOW");
    const headers = result.modifiedRequest?.headers || {};

    const authHeader = headers["Authorization"] || headers["authorization"];
    assert.ok(authHeader, "Authorization header should exist");
    assert.match(authHeader as string, /AWS4-HMAC-SHA256/);
    assert.match(authHeader as string, /Credential=AKIAFAIL\//);
    assert.ok(headers["x-amz-date"]);
  });

  it("should SKIP if no match", async () => {
    const context = createMockContext("/", "https://unknown.com");
    const result = await wellKnownAllBackendsPolicy(context);

    assert.equal(result.decision, "SKIP");
  });

  it("should SKIP if missing env var for matched domain", async () => {
    // Ensure no key
    delete process.env.STRIPE_SECRET_KEY;
    const context = createMockContext("/", "https://api.stripe.com");

    // Should skip if keys are missing
    const result = await wellKnownAllBackendsPolicy(context);
    assert.equal(result.decision, "SKIP");
  });
});

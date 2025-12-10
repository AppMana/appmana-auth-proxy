import { test, expect } from "@playwright/test";
import nock from "nock";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { wellKnownAllBackendsPolicy } from "../../../auth-proxy-backend/build/policies/well-known-all-backends.js";

const GEMINI_API_KEY = "test-gemini-key";

test.beforeAll(() => {
  process.env.GEMINI_API_KEY = GEMINI_API_KEY;
});

test.afterAll(() => {
  delete process.env.GEMINI_API_KEY;
  nock.cleanAll();
});

test("Compare Google Generative AI Native vs Policy Logic Injection", async () => {
  nock.disableNetConnect();

  const apiDomain = "https://generativelanguage.googleapis.com";
  const apiPath = "/v1beta/models/gemini-pro:generateContent";

  // 1. Capture Native Client Request
  let nativeRequestHeaders: any;

  const nativeScope = nock(apiDomain)
    .post(apiPath)
    .reply(200, function (uri, body) {
      nativeRequestHeaders = this.req.headers;
      return { candidates: [] };
    });

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-pro" });

  try {
    await model.generateContent("Hello native");
  } catch (e) {}

  // 2. Invoke Policy Directly
  const targetUrl = apiDomain + apiPath;

  // Mock Fastify Request context
  const mockContext: any = {
    request: {
      headers: {
        "x-proxy-target-url": targetUrl,
      },
      method: "POST",
      url: apiPath, // The path relative to the target? Or strictly the path forwarded?
      // Note: In strict proxy mode, the request.url is the path.
    },
  };

  const result = await wellKnownAllBackendsPolicy(mockContext);

  // 3. Compare
  expect(nativeRequestHeaders).toBeDefined();
  expect(result.decision).toBe("ALLOW");
  expect(result.modifiedRequest).toBeDefined();
  expect(result.modifiedRequest?.headers).toBeDefined();

  const policyHeaders = result.modifiedRequest!.headers!;

  console.log("Native Headers:", nativeRequestHeaders);
  console.log("Policy Headers:", policyHeaders);

  const nativeKey = nativeRequestHeaders["x-goog-api-key"];
  const policyKey = policyHeaders["x-goog-api-key"];

  expect(nativeKey).toBe(GEMINI_API_KEY);
  expect(policyKey).toBe(GEMINI_API_KEY);
});

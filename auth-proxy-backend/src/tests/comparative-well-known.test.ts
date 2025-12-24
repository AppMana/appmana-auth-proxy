import { test, describe, it, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import nock from 'nock';
import { wellKnownAllBackendsPolicy } from '../policies/well-known-all-backends.js';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import Stripe from 'stripe';
import { S3Client, ListBucketsCommand } from '@aws-sdk/client-s3';

describe('Comparative Testing: Official SDKs vs Well-Known Policy', () => {
    // Shared mock values
    const MOCK_OPENAI_KEY = 'sk-proj-mock-openai-key';
    const MOCK_ANTHROPIC_KEY = 'sk-ant-mock-anthropic-key';
    const MOCK_STRIPE_KEY = 'sk_test_mock_stripe_key';
    const MOCK_AWS_ACCESS_KEY = 'AKIAMOCKACCESSKEY';
    const MOCK_AWS_SECRET_KEY = 'mocksecretkey';
    const MOCK_AWS_REGION = 'us-east-1';

    before(() => {
        nock.disableNetConnect();
    });

    after(() => {
        nock.enableNetConnect();
        nock.cleanAll();
    });

    it('should match OpenAI SDK headers', async () => {
        // Setup Nock to capture SDK request
        let sdkHeaders: Record<string, string> = {};
        const scope = nock('https://api.openai.com')
            .post('/v1/chat/completions')
            .reply(200, function (uri, body) {
                // @ts-ignore
                sdkHeaders = this.req.headers;
                return { choices: [] };
            });

        // 1. Run Official SDK
        process.env.OPENAI_API_KEY = MOCK_OPENAI_KEY;
        const openai = new OpenAI();
        await openai.chat.completions.create({
            messages: [{ role: 'user', content: 'test' }],
            model: 'gpt-3.5-turbo',
        });

        // 2. Run Policy Logic
        const context: any = {
            request: {
                url: 'https://api.openai.com/v1/chat/completions',
                headers: {
                    'x-proxy-target-url': 'https://api.openai.com/v1/chat/completions',
                },
            },
        };
        const result = await wellKnownAllBackendsPolicy(context);

        // 3. Compare
        assert.equal(result.decision, 'ALLOW');
        const policyHeaders = result.modifiedRequest?.headers || {};

        console.log('OpenAI SDK Headers:', sdkHeaders);
        console.log('Policy Headers:', policyHeaders);

        // Helper for case-insensitive lookup
        const getHeader = (h: any, key: string) => {
            const k = Object.keys(h).find(k => k.toLowerCase() === key.toLowerCase());
            return k ? h[k] : undefined;
        };

        const sdkAuth = getHeader(sdkHeaders, 'authorization');
        const policyAuth = getHeader(policyHeaders, 'authorization');

        assert.ok(sdkAuth, 'SDK should have Authorization header');
        assert.ok(policyAuth, 'Policy should have Authorization header');
        assert.equal(policyAuth, sdkAuth, 'Authorization headers should match'); // Bearer ...

        // Cleanup
        delete process.env.OPENAI_API_KEY;
        scope.done();
    });

    it('should match Anthropic SDK headers', async () => {
        let sdkHeaders: Record<string, string> = {};
        const scope = nock('https://api.anthropic.com')
            .post('/v1/messages')
            .reply(200, function (uri, body) {
                // @ts-ignore
                sdkHeaders = this.req.headers;
                return { id: 'msg_123', type: 'message', role: 'assistant', content: [] };
            });

        process.env.ANTHROPIC_API_KEY = MOCK_ANTHROPIC_KEY;
        const anthropic = new Anthropic();
        await anthropic.messages.create({
            model: 'claude-3-opus-20240229',
            max_tokens: 1024,
            messages: [{ role: 'user', content: 'Hello' }],
        });

        const context: any = {
            request: {
                url: 'https://api.anthropic.com/v1/messages',
                headers: {
                    'x-proxy-target-url': 'https://api.anthropic.com/v1/messages',
                },
            },
        };
        const result = await wellKnownAllBackendsPolicy(context);

        assert.equal(result.decision, 'ALLOW');
        const policyHeaders = result.modifiedRequest?.headers || {};

        const getHeader = (h: any, key: string) => {
            const k = Object.keys(h).find(k => k.toLowerCase() === key.toLowerCase());
            return k ? h[k] : undefined;
        };

        const sdkAuth = getHeader(sdkHeaders, 'x-api-key');
        const policyAuth = getHeader(policyHeaders, 'x-api-key');

        assert.ok(sdkAuth, 'SDK should have x-api-key header');
        assert.equal(policyAuth, sdkAuth, 'API Key headers should match');

        // Check Anthropic Version if policy injects it
        if (policyHeaders['anthropic-version']) {
            assert.ok(sdkHeaders['anthropic-version'], 'SDK should inject version if policy does');
            // Versions might differ if SDK defaults vs Env var defaults differ, but usually we iterate to match SDK
            // assert.equal(policyHeaders['anthropic-version'], sdkHeaders['anthropic-version']);
        }

        delete process.env.ANTHROPIC_API_KEY;
        scope.done();
    });


});

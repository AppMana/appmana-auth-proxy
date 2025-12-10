import { test, describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { OAuth2ProxyCipher } from "@appmana-public/auth-proxy-common";
import * as crypto from "crypto";

// Helper to manually encrypt like oauth2-proxy
function encryptManually(value: string | object, secret: string) {
  const dataToEncrypt = typeof value === "string" ? Buffer.from(value) : Buffer.from(JSON.stringify(value));

  // 1. Generate IV
  const iv = crypto.randomBytes(16);

  // 2. Algorithm
  let algorithm = "aes-256-cfb";
  if (secret.length === 16) algorithm = "aes-128-cfb";
  else if (secret.length === 24) algorithm = "aes-192-cfb";

  // 3. Encrypt
  const cipher = crypto.createCipheriv(algorithm, Buffer.from(secret), iv);
  let encrypted = cipher.update(dataToEncrypt);
  encrypted = Buffer.concat([encrypted, cipher.final()]);

  // 4. Concat IV + Encrypted
  const combined = Buffer.concat([iv, encrypted]);

  // 5. Base64
  return combined.toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
}

describe('OAuth2ProxyCipher', () => {
  it('should decrypt a cookie value encrypted with the same secret', async () => {
    const secret = '1234567890123456'; // 16 bytes
    const cipher = new OAuth2ProxyCipher(secret);

    const payload = { email: "test@example.com", user: "testuser" };
    const encrypted = encryptManually(payload, secret);

    const decrypted = await cipher.decrypt(encrypted);

    let result = decrypted;
    if (typeof result === "string") {
      try {
        result = JSON.parse(result);
      } catch (e) {
        // ignore
      }
    }
    assert.deepEqual(result, payload);
  });

  it('should handle Base64URL encoding', async () => {
    const secret = "1234567890123456";
    const payload = "simple-string";
    const encrypted = encryptManually(payload, secret);

    const cipher = new OAuth2ProxyCipher(secret);
    const decrypted = await cipher.decrypt(encrypted);
    assert.equal(decrypted, payload);
  });

  it('should fail to decrypt with wrong secret', async () => {
    const secret1 = '1234567890123456';
    const secret2 = '1234567890123457';
    const cipher1 = new OAuth2ProxyCipher(secret1);
    const cipher2 = new OAuth2ProxyCipher(secret2);

    const text = 'secret data';
    const encrypted = encryptManually(text, secret1);

    // AES-CFB doesn't throw on wrong key, it produces garbage.
    // We verify that the result is NOT the original text.
    const decrypted = await cipher2.decrypt(encrypted);
    assert.notEqual(decrypted, text);
  });
});

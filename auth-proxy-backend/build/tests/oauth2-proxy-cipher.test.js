import { test, expect } from '@playwright/test'; // Using playwright test runner as it's already set up
import { OAuth2ProxyCipher } from '@appmana/auth-proxy-common';
import * as crypto from 'crypto';
// Helper to manually encrypt like oauth2-proxy
function encryptManually(value, secret) {
    var dataToEncrypt = typeof value === 'string' ? Buffer.from(value) : Buffer.from(JSON.stringify(value));
    // 1. Generate IV
    var iv = crypto.randomBytes(16);
    // 2. Algorithm
    var algorithm = 'aes-256-cfb';
    if (secret.length === 16)
        algorithm = 'aes-128-cfb';
    else if (secret.length === 24)
        algorithm = 'aes-192-cfb';
    // 3. Encrypt
    var cipher = crypto.createCipheriv(algorithm, Buffer.from(secret), iv);
    var encrypted = cipher.update(dataToEncrypt);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    // 4. Concat IV + Encrypted
    var combined = Buffer.concat([iv, encrypted]);
    // 5. Base64
    return combined.toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
}
test('OAuth2ProxyCipher should decrypt and parse JSON object', function () {
    var secret = '1234567890123456'; // 16 bytes
    var payload = { email: 'test@example.com', user: 'testuser' };
    var encryptedCookie = encryptManually(payload, secret);
    var cipher = new OAuth2ProxyCipher(secret);
    var decrypted = cipher.decrypt(encryptedCookie);
    // Since our mock encryption didn't compress with LZ4 or use MsgPack, 
    // and OAuth2ProxyCipher handles decompression/decoding failures gracefully by returning string,
    // we might get a JSON string back if it failed to detect msgpack/lz4.
    // Wait, OAuth2ProxyCipher logic try-catches lz4 and msgpack.
    // If lz4 fails, it uses original buffer.
    // If msgpack fails, it returns string.
    // So if we encrypted valid JSON string, we expect a JSON string back (since we didn't msgpack encode it).
    // Let's parse it if it's a string.
    var result = decrypted;
    if (typeof result === 'string') {
        result = JSON.parse(result);
    }
    expect(result).toEqual(payload);
});
test('OAuth2ProxyCipher should handle Base64URL encoding', function () {
    var secret = '1234567890123456';
    var payload = 'simple-string';
    var encryptedCookie = encryptManually(payload, secret);
    var cipher = new OAuth2ProxyCipher(secret);
    var decrypted = cipher.decrypt(encryptedCookie);
    expect(decrypted).toBe(payload);
});
//# sourceMappingURL=oauth2-proxy-cipher.test.js.map
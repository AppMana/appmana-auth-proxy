export * from './types.js';
export * from './utils.js';
import * as crypto from 'crypto';
import lz4js from 'lz4js';
import { decode } from '@msgpack/msgpack';

export class OAuth2ProxyCipher {
    private secret: Buffer;

    constructor(secret: string) {
        // Handle base64 encoded secret if needed, but usually it's just a string
        // oauth2-proxy expects 16, 24, or 32 bytes.
        // If the string is not that length, maybe it's base64?
        // The user provided code `SecretBytes` handles padding.
        this.secret = this.getSecretBytes(secret);
    }

    private getSecretBytes(secret: string): Buffer {
        // Try to decode as base64 first if it looks like it?
        // Or just use bytes.
        // User's Go code:
        // base64Padded := base64.URLEncoding.EncodeToString(secret)
        // sb := SecretBytes(base64Padded) -> returns secret
        // SecretBytes implementation seems to try decoding base64, and if it fails or length is wrong, returns original bytes.

        try {
            // Try Base64URL decode
            const base64Value = secret.replace(/-/g, '+').replace(/_/g, '/');
            const decoded = Buffer.from(base64Value, 'base64');
            if (decoded.length === 16 || decoded.length === 24 || decoded.length === 32) {
                return decoded;
            }
        } catch (e) {
            // Ignore
        }

        // If not valid base64 or wrong length, use raw bytes
        const raw = Buffer.from(secret);
        return raw;
    }

    public decrypt(cookieValue: string): any {
        // 1. Handle split cookies (caller should join them, but we handle the value)
        // 2. Handle timestamp/signature (split by |)

        let valueToDecrypt = cookieValue;
        if (valueToDecrypt.includes('|')) {
            const parts = valueToDecrypt.split('|');
            // Format: value|timestamp|signature
            // We only care about value
            valueToDecrypt = parts[0];
        }

        // 3. Base64 decode
        // Handle Base64URL
        const base64Value = valueToDecrypt.replace(/-/g, '+').replace(/_/g, '/');
        const decoded = Buffer.from(base64Value, 'base64');

        if (decoded.length < 16) {
            throw new Error('Cookie too short');
        }

        // 4. Extract IV
        const iv = decoded.subarray(0, 16);
        const encrypted = decoded.subarray(16);

        // 5. Determine algorithm
        let algorithm = 'aes-256-cfb';
        if (this.secret.length === 16) algorithm = 'aes-128-cfb';
        else if (this.secret.length === 24) algorithm = 'aes-192-cfb';
        else if (this.secret.length === 32) algorithm = 'aes-256-cfb';
        else {
            // Fallback or error?
            // If secret is not standard length, crypto will throw.
            // But we should have handled this in constructor.
            // If we are here, secret might be wrong length.
            console.warn(`Secret length ${this.secret.length} is non-standard, defaulting to aes-256-cfb but it might fail.`);
        }

        // 6. Decrypt
        const decipher = crypto.createDecipheriv(algorithm, this.secret, iv);
        // decipher.setAutoPadding(false); // CFB is stream, no padding

        let decrypted = decipher.update(encrypted);
        decrypted = Buffer.concat([decrypted, decipher.final()]);

        // 7. Decompress LZ4 (oauth2-proxy compresses by default)
        let decompressed: Buffer;
        try {
            // lz4js expects a buffer.
            const decompressedArr = lz4js.decompress(decrypted);
            decompressed = Buffer.from(decompressedArr);
        } catch (e) {
            // Maybe not compressed?
            decompressed = decrypted;
        }

        // 8. Decode Msgpack (oauth2-proxy uses msgpack by default)
        try {
            const session = decode(decompressed);
            return session;
        } catch (e) {
            // Maybe not msgpack? Return string
            return decompressed.toString('utf8');
        }
    }
}

export function parseCookies(header: string): Record<string, string> {
    const cookies: Record<string, string> = {};
    if (!header) return cookies;

    const parts = header.split('; ');
    for (const part of parts) {
        const eqIdx = part.indexOf('=');
        if (eqIdx === -1) continue;
        const key = part.substring(0, eqIdx).trim();
        const val = part.substring(eqIdx + 1).trim();
        cookies[key] = val;
    }
    return cookies;
}

export function joinCookieValues(cookies: Record<string, string>, name: string): string | null {
    if (cookies[name]) return cookies[name];

    // Check for split cookies: name_0, name_1, ...
    let joined = '';
    let i = 0;
    while (cookies[`${name}_${i}`]) {
        joined += cookies[`${name}_${i}`];
        i++;
    }

    return joined || null;
}

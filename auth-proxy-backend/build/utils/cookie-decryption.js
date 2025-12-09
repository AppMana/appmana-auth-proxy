import * as crypto from 'crypto';
/**
 * Decrypts a cookie value encrypted by oauth2-proxy.
 * Assumes AES-CFB encryption which is the default for oauth2-proxy.
 *
 * @param cookieValue The base64 encoded cookie value
 * @param secret The cookie secret used by oauth2-proxy (must be 16, 24, or 32 bytes)
 * @returns The decrypted string
 */
export function decryptOAuth2ProxyCookie(cookieValue, secret) {
    // oauth2-proxy implementation details:
    // https://github.com/oauth2-proxy/oauth2-proxy/blob/master/pkg/encryption/cipher.go
    // It uses AES-CFB.
    // The cookie value is Base64(IV + EncryptedData).
    // The IV size is the block size of AES (16 bytes).
    try {
        console.log('Raw cookie value:', cookieValue);
        // Replace URL-safe chars just in case
        var base64Value = cookieValue.replace(/-/g, '+').replace(/_/g, '/');
        var decoded = Buffer.from(base64Value, 'base64');
        if (decoded.length < 16) {
            console.error('Cookie too short');
            return '';
        }
        var iv = decoded.subarray(0, 16);
        var encrypted = decoded.subarray(16);
        // Determine key length to select algorithm
        var algorithm = 'aes-256-cfb';
        if (secret.length === 16)
            algorithm = 'aes-128-cfb';
        else if (secret.length === 24)
            algorithm = 'aes-192-cfb';
        else if (secret.length === 32)
            algorithm = 'aes-256-cfb';
        else {
            throw new Error("Invalid secret length: ".concat(secret.length, ". Must be 16, 24, or 32 bytes."));
        }
        // oauth2-proxy uses AES-CFB
        // Go's CFB is compatible with Node's aes-*-cfb
        var decipher = crypto.createDecipheriv(algorithm, secret, iv);
        // decipher.setAutoPadding(false); // CFB is a stream cipher, padding shouldn't matter but let's be safe? 
        // Node's createDecipheriv for CFB doesn't use padding usually.
        var decrypted = decipher.update(encrypted);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        var result = decrypted.toString('utf8');
        console.log('Decrypted result (first 50 chars):', result.substring(0, 50));
        return result;
    }
    catch (e) {
        console.error('Decryption error:', e);
        return '';
    }
}
//# sourceMappingURL=cookie-decryption.js.map
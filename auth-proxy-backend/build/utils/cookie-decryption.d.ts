/**
 * Decrypts a cookie value encrypted by oauth2-proxy.
 * Assumes AES-CFB encryption which is the default for oauth2-proxy.
 *
 * @param cookieValue The base64 encoded cookie value
 * @param secret The cookie secret used by oauth2-proxy (must be 16, 24, or 32 bytes)
 * @returns The decrypted string
 */
export declare function decryptOAuth2ProxyCookie(cookieValue: string, secret: string): string;

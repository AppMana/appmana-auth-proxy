declare module 'lz4js' {
    export function decompress(buffer: Buffer | Uint8Array): Uint8Array;
    export function compress(buffer: Buffer | Uint8Array): Uint8Array;
}

/**
 * Cryptographic utilities for token generation and validation
 */

/**
 * Generate a cryptographically secure random token
 * @param length Number of random bytes (default 32 = 256 bits)
 * @returns URL-safe base64 encoded token
 */
export function generateToken(length: number = 32): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

/**
 * Generate a UUID v4
 */
export function generateId(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

/**
 * Convert bytes to URL-safe base64
 */
function bytesToBase64Url(bytes: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
export function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);

  let result = 0;
  for (let i = 0; i < aBytes.length; i++) {
    result |= aBytes[i] ^ bBytes[i];
  }

  return result === 0;
}

/**
 * Hash a string using SHA-256
 */
export async function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = new Uint8Array(hashBuffer);
  return bytesToBase64Url(hashArray);
}

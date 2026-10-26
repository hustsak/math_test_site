import crypto from 'node:crypto';

/**
 * Generates a random, unguessable, URL-safe token.
 * 24 bytes of randomness encoded as base64url produces 32 characters of [A-Za-z0-9_-].
 */
export function generateToken(bytes: number = 24): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/**
 * Validates that a token meets minimum security requirements (at least 24 URL-safe characters).
 */
export function isValidTokenFormat(token: unknown): token is string {
  if (typeof token !== 'string') return false;
  return token.length >= 24 && /^[A-Za-z0-9_-]+$/.test(token);
}

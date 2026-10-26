import crypto from 'crypto';
import { normalize } from './grade';

/**
 * Derives a canonical profileKey from student name and optional class name.
 * Uses the exact same normalize() from src/lib/grade.ts.
 * Format: normalized(name) + "|" + normalized(className)
 */
export function getProfileKey(name: string, className?: string | null): string {
  const normName = normalize(name || '');
  const normClass = normalize(className || '');
  return `${normName}|${normClass}`;
}

/**
 * Derives a deterministic document ID for a profile from its profileKey.
 * Uses SHA-256 hex digest.
 */
export function getProfileId(profileKey: string): string {
  return crypto.createHash('sha256').update(profileKey).digest('hex');
}

/**
 * Generates an unguessable, URL-safe random token.
 * 24 bytes yields 32 URL-safe base64 characters (>= 24 chars).
 */
export function generateToken(bytes = 24): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/**
 * Generates a random claim secret for the student's device.
 */
export function generateClaimSecret(bytes = 24): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/**
 * Computes SHA-256 hex digest of a claim secret to store in Firestore.
 * The raw secret is never stored in plaintext on the server.
 */
export function hashClaimSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

/**
 * Verifies a student device claim secret using a constant-time comparison
 * against the stored SHA-256 hash.
 */
export function verifyClaimSecret(secret: string, expectedHash: string): boolean {
  if (!secret || typeof secret !== 'string') return false;
  if (!expectedHash || typeof expectedHash !== 'string') return false;

  try {
    const computedHash = hashClaimSecret(secret.trim());
    const computedBuf = Buffer.from(computedHash, 'utf8');
    const expectedBuf = Buffer.from(expectedHash.trim(), 'utf8');

    if (computedBuf.length !== expectedBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(computedBuf, expectedBuf);
  } catch {
    return false;
  }
}

import 'server-only';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

/**
 * Authenticated symmetric encryption (AES-256-GCM) for small secrets such as a
 * client login password stored in the Marken-Hub. The master key comes from the
 * SECRET_ENCRYPTION_KEY environment variable (never the database); any non-empty
 * string works — it is hashed to a 32-byte key. Ciphertext is stored at rest;
 * only the server, with the key, can decrypt it. This is encryption at rest, not
 * end-to-end: the server can decrypt for authorized agency staff.
 *
 * Stored format: `v1:<ivB64>:<authTagB64>:<cipherB64>`.
 */

function keyOrNull(): Buffer | null {
  const raw = process.env.SECRET_ENCRYPTION_KEY;
  if (!raw || raw.trim().length === 0) return null;
  // Derive a fixed 32-byte key from whatever the operator configured.
  return createHash('sha256').update(raw).digest();
}

/** True when a master key is configured (the secret vault is usable). */
export function isSecretVaultEnabled(): boolean {
  return keyOrNull() !== null;
}

/** Encrypts a plaintext secret. Returns null when no key is configured. */
export function encryptSecret(plaintext: string): string | null {
  const key = keyOrNull();
  if (!key) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

/** Decrypts a stored secret. Returns null on any failure (bad key/format/tag). */
export function decryptSecret(payload: string): string | null {
  const key = keyOrNull();
  if (!key) return null;
  const [version, ivB64, tagB64, ctB64] = payload.split(':');
  if (version !== 'v1' || !ivB64 || !tagB64 || !ctB64) return null;
  try {
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const ct = Buffer.from(ctB64, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return pt.toString('utf8');
  } catch {
    return null;
  }
}

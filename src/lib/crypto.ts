/**
 * Encryption utilities for storing secrets at rest
 * Uses AES-256-GCM for authenticated encryption
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

// Get encryption key from environment or generate a default for development
function getEncryptionKey(): Buffer {
    const keyHex = process.env.LDAP_ENCRYPTION_KEY;
    if (keyHex) {
        return Buffer.from(keyHex, 'hex');
    }
    // Development fallback - NOT SECURE FOR PRODUCTION
    console.warn('[crypto] LDAP_ENCRYPTION_KEY not set, using development key');
    return crypto.createHash('sha256').update('tablo-dev-key').digest();
}

/**
 * Encrypt a string value
 * Returns base64 encoded: IV + AuthTag + Ciphertext
 */
export function encrypt(plaintext: string): string {
    if (!plaintext) return '';

    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    // Combine: IV (16 bytes) + AuthTag (16 bytes) + Ciphertext
    const combined = Buffer.concat([
        iv,
        authTag,
        Buffer.from(encrypted, 'base64')
    ]);

    return combined.toString('base64');
}

/**
 * Decrypt an encrypted string value
 */
export function decrypt(encryptedBase64: string): string {
    if (!encryptedBase64) return '';

    try {
        const key = getEncryptionKey();
        const combined = Buffer.from(encryptedBase64, 'base64');

        const iv = combined.subarray(0, IV_LENGTH);
        const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
        const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(ciphertext);
        decrypted = Buffer.concat([decrypted, decipher.final()]);

        return decrypted.toString('utf8');
    } catch (error) {
        console.error('[crypto] Decryption failed:', error);
        return '';
    }
}

/**
 * Check if a value is encrypted (basic check)
 */
export function isEncrypted(value: string): boolean {
    if (!value) return false;
    try {
        const decoded = Buffer.from(value, 'base64');
        // Minimum length: IV + AuthTag + at least 1 byte ciphertext
        return decoded.length > IV_LENGTH + AUTH_TAG_LENGTH;
    } catch {
        return false;
    }
}

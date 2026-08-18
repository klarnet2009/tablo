/**
 * Encryption utilities for storing secrets at rest
 * Uses AES-256-GCM for authenticated encryption
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

const KEY_BYTES = 32; // AES-256

/**
 * Resolve the key used to encrypt secrets at rest.
 *
 * Exported for testing. Validates eagerly so a misconfigured key fails at the
 * point of configuration instead of surfacing as an opaque 500 from
 * createCipheriv when an admin saves the LDAP settings.
 */
export function resolveEncryptionKey(keyHex: string | undefined, nodeEnv: string | undefined): Buffer {
    if (keyHex) {
        if (!/^[0-9a-fA-F]+$/.test(keyHex)) {
            throw new Error('LDAP_ENCRYPTION_KEY must be hex encoded (openssl rand -hex 32)');
        }
        const key = Buffer.from(keyHex, 'hex');
        if (key.length !== KEY_BYTES) {
            throw new Error(
                `LDAP_ENCRYPTION_KEY must be ${KEY_BYTES} bytes (${KEY_BYTES * 2} hex characters), got ${key.length}`
            );
        }
        return key;
    }

    if (nodeEnv === 'production') {
        // Falling back here would encrypt the directory service-account password
        // with a key derived from a constant in this repository.
        throw new Error(
            'LDAP_ENCRYPTION_KEY is required in production. Generate one with: openssl rand -hex 32'
        );
    }

    console.warn('[crypto] LDAP_ENCRYPTION_KEY not set, using development key');
    return crypto.createHash('sha256').update('tablo-dev-key').digest();
}

function getEncryptionKey(): Buffer {
    return resolveEncryptionKey(process.env.LDAP_ENCRYPTION_KEY, process.env.NODE_ENV);
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

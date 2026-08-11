import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { resolveEncryptionKey, encrypt, decrypt } from './crypto.ts';

const validKey = crypto.randomBytes(32).toString('hex');

test('resolveEncryptionKey returns the configured 32-byte key', () => {
    const key = resolveEncryptionKey(validKey, 'production');
    assert.equal(key.length, 32);
    assert.equal(key.toString('hex'), validKey);
});

test('resolveEncryptionKey refuses to start in production without a key', () => {
    assert.throws(
        () => resolveEncryptionKey(undefined, 'production'),
        /LDAP_ENCRYPTION_KEY/
    );
});

test('resolveEncryptionKey rejects a key of the wrong length', () => {
    // AES-256-GCM needs exactly 32 bytes; a short key made createCipheriv throw
    // deep inside encrypt(), surfacing as an opaque 500 when saving LDAP config.
    assert.throws(() => resolveEncryptionKey('abcd', 'production'), /32 bytes/);
    assert.throws(() => resolveEncryptionKey('abcd', 'development'), /32 bytes/);
});

test('resolveEncryptionKey rejects a key that is not hex', () => {
    assert.throws(() => resolveEncryptionKey('z'.repeat(64), 'production'), /hex/i);
});

test('resolveEncryptionKey falls back to a development key outside production', () => {
    const key = resolveEncryptionKey(undefined, 'development');
    assert.equal(key.length, 32);
});

test('encrypt/decrypt round-trips a value', () => {
    process.env.LDAP_ENCRYPTION_KEY = validKey;
    const ciphertext = encrypt('s3cret-bind-password');
    assert.notEqual(ciphertext, 's3cret-bind-password');
    assert.equal(decrypt(ciphertext), 's3cret-bind-password');
});

test('encrypt produces a different ciphertext each time', () => {
    process.env.LDAP_ENCRYPTION_KEY = validKey;
    assert.notEqual(encrypt('same input'), encrypt('same input'));
});

test('decrypt returns empty string on a tampered ciphertext', () => {
    process.env.LDAP_ENCRYPTION_KEY = validKey;
    const ciphertext = encrypt('s3cret');
    const bytes = Buffer.from(ciphertext, 'base64');
    bytes[bytes.length - 1] ^= 0xff; // break the GCM auth tag check
    assert.equal(decrypt(bytes.toString('base64')), '');
});

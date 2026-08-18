import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveBindPasswordSource } from './ldap-auth-policy.ts';

const stored = { host: 'dc01.corp.local', port: 389, bindDn: 'CN=svc,DC=corp', hasStoredPassword: true };

test('uses the stored password when the request targets the stored server', () => {
    const result = resolveBindPasswordSource(
        { host: 'dc01.corp.local', port: 389, bindDn: 'CN=svc,DC=corp' },
        stored
    );
    assert.deepEqual(result, { source: 'stored' });
});

test('refuses to send the stored password to a different host', () => {
    // Otherwise a caller points `host` at a server they control, omits the
    // password, and the app performs a bind with the real directory
    // service-account password against that server.
    const result = resolveBindPasswordSource(
        { host: 'attacker.example.com', port: 389, bindDn: 'CN=svc,DC=corp' },
        stored
    );
    assert.ok('error' in result);
    assert.match(result.error, /password/i);
});

test('refuses to send the stored password to a different port', () => {
    const result = resolveBindPasswordSource(
        { host: 'dc01.corp.local', port: 3899, bindDn: 'CN=svc,DC=corp' },
        stored
    );
    assert.ok('error' in result);
});

test('refuses to reuse the stored password for a different bind DN', () => {
    const result = resolveBindPasswordSource(
        { host: 'dc01.corp.local', port: 389, bindDn: 'CN=someone-else,DC=corp' },
        stored
    );
    assert.ok('error' in result);
});

test('a password supplied in the request may target any host', () => {
    const result = resolveBindPasswordSource(
        { host: 'other.example.com', port: 636, bindDn: 'CN=svc,DC=corp', bindPassword: 'pw' },
        stored
    );
    assert.deepEqual(result, { source: 'request' });
});

test('a password supplied in the request wins over the stored one', () => {
    const result = resolveBindPasswordSource(
        { host: 'dc01.corp.local', port: 389, bindDn: 'CN=svc,DC=corp', bindPassword: 'pw' },
        stored
    );
    assert.deepEqual(result, { source: 'request' });
});

test('works with nothing stored yet, as long as the request carries a password', () => {
    const result = resolveBindPasswordSource(
        { host: 'dc01.corp.local', port: 389, bindDn: 'CN=svc,DC=corp', bindPassword: 'pw' },
        null
    );
    assert.deepEqual(result, { source: 'request' });
});

test('reports a missing password when nothing is stored and none is supplied', () => {
    const result = resolveBindPasswordSource(
        { host: 'dc01.corp.local', port: 389, bindDn: 'CN=svc,DC=corp' },
        null
    );
    assert.ok('error' in result);
});

test('reports a missing password when the stored config has none', () => {
    const result = resolveBindPasswordSource(
        { host: 'dc01.corp.local', port: 389, bindDn: 'CN=svc,DC=corp' },
        { ...stored, hasStoredPassword: false }
    );
    assert.ok('error' in result);
});

test('host comparison ignores case and surrounding whitespace', () => {
    const result = resolveBindPasswordSource(
        { host: ' DC01.CORP.LOCAL ', port: 389, bindDn: 'CN=svc,DC=corp' },
        stored
    );
    assert.deepEqual(result, { source: 'stored' });
});

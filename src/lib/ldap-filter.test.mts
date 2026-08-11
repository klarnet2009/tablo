import test from 'node:test';
import assert from 'node:assert/strict';

import { escapeFilterValue, buildUserSearchFilter } from './ldap-filter.ts';

test('escapeFilterValue hex-escapes the RFC 4515 special characters', () => {
    assert.equal(escapeFilterValue('*'), '\\2a');
    assert.equal(escapeFilterValue('a(b)c'), 'a\\28b\\29c');
    assert.equal(escapeFilterValue('a\\b'), 'a\\5cb');
    assert.equal(escapeFilterValue('a\0b'), 'a\\00b');
});

test('escapeFilterValue leaves an ordinary username untouched', () => {
    assert.equal(escapeFilterValue('alice.smith'), 'alice.smith');
});

test('buildUserSearchFilter substitutes the username placeholder', () => {
    assert.equal(
        buildUserSearchFilter('(sAMAccountName={{username}})', 'alice'),
        '(sAMAccountName=alice)'
    );
});

test('buildUserSearchFilter also accepts the single-brace placeholder', () => {
    // Databases initialised by docker-entrypoint.sh before this fix carry the
    // single-brace default, so it has to keep working without an admin edit.
    assert.equal(
        buildUserSearchFilter('(&(objectClass=user)(sAMAccountName={username}))', 'alice'),
        '(&(objectClass=user)(sAMAccountName=alice))'
    );
});

test('buildUserSearchFilter replaces every occurrence of the placeholder', () => {
    assert.equal(
        buildUserSearchFilter('(|(uid={{username}})(cn={{username}}))', 'alice'),
        '(|(uid=alice)(cn=alice))'
    );
});

test('buildUserSearchFilter neutralises an injected filter expression', () => {
    // Without escaping this would widen the query to (sAMAccountName=*)(objectClass=*)
    assert.equal(
        buildUserSearchFilter('(sAMAccountName={{username}})', '*)(objectClass=*'),
        '(sAMAccountName=\\2a\\29\\28objectClass=\\2a)'
    );
});

test('buildUserSearchFilter does not let the username inject a new placeholder', () => {
    assert.equal(
        buildUserSearchFilter('(sAMAccountName={{username}})', '{{username}}'),
        '(sAMAccountName={{username}})'
    );
});

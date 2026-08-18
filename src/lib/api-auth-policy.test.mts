import test from 'node:test';
import assert from 'node:assert/strict';

import { checkAccess } from './api-auth-policy.ts';

const admin = { user: { id: 'u1', username: 'a', displayName: 'A', role: 'ADMIN' } };
const security = { user: { id: 'u2', username: 's', displayName: 'S', role: 'SECURITY' } };

test('an anonymous caller gets 401', () => {
    const result = checkAccess(null, ['ADMIN']);
    assert.ok(!result.ok);
    assert.equal(result.status, 401);
});

test('an authenticated caller with an allowed role passes', () => {
    assert.equal(checkAccess(admin, ['ADMIN']).ok, true);
    assert.equal(checkAccess(admin, ['SUPERVISOR', 'ADMIN']).ok, true);
});

test('an authenticated caller with a disallowed role gets 403', () => {
    const result = checkAccess(security, ['SUPERVISOR', 'ADMIN']);
    assert.ok(!result.ok);
    assert.equal(result.status, 403);
});

test('an empty role list means "any authenticated user"', () => {
    assert.equal(checkAccess(security, []).ok, true);
});

test('a session without a role is refused, not treated as allowed', () => {
    const result = checkAccess({ user: { id: 'u3', username: 'x', displayName: 'X' } }, ['ADMIN']);
    assert.ok(!result.ok);
    assert.equal(result.status, 403);
});

test('role comparison is exact, so a lowercase role does not pass', () => {
    const result = checkAccess({ user: { id: 'u4', username: 'x', displayName: 'X', role: 'admin' } }, ['ADMIN']);
    assert.ok(!result.ok);
    assert.equal(result.status, 403);
});

test('an empty role list still refuses an anonymous caller', () => {
    const result = checkAccess(null, []);
    assert.ok(!result.ok);
    assert.equal(result.status, 401);
});

import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveLdapFailure } from './ldap-auth-policy.ts';

const allowFallback = { disableLocalFallback: false };
const denyFallback = { disableLocalFallback: true };

test('a disabled AD account is denied, never falls back to a local password', () => {
    const decision = resolveLdapFailure(allowFallback, {
        success: false,
        disabled: true,
        disabledReason: 'account_disabled',
    });

    assert.equal(decision.action, 'deny');
    assert.match(decision.message!, /disabled/i);
});

test('an expired AD account is denied with an expiry-specific message', () => {
    const decision = resolveLdapFailure(allowFallback, {
        success: false,
        disabled: true,
        disabledReason: 'account_expired',
    });

    assert.equal(decision.action, 'deny');
    assert.match(decision.message!, /expired/i);
});

test('a locked AD account is denied with a lockout-specific message', () => {
    const decision = resolveLdapFailure(allowFallback, {
        success: false,
        disabled: true,
        disabledReason: 'account_locked',
    });

    assert.equal(decision.action, 'deny');
    assert.match(decision.message!, /locked/i);
});

test('a user excluded by the group allow/deny list is denied', () => {
    const decision = resolveLdapFailure(allowFallback, {
        success: false,
        deniedByGroupList: true,
    });

    assert.equal(decision.action, 'deny');
    assert.match(decision.message!, /not authorized/i);
});

test('wrong LDAP password falls back to local auth while fallback is enabled', () => {
    const decision = resolveLdapFailure(allowFallback, {
        success: false,
        errorCode: 'INVALID_CREDENTIALS',
    });

    assert.equal(decision.action, 'fallback');
});

test('wrong LDAP password is denied outright once fallback is disabled', () => {
    const decision = resolveLdapFailure(denyFallback, {
        success: false,
        errorCode: 'INVALID_CREDENTIALS',
    });

    assert.equal(decision.action, 'deny');
});

test('an unreachable directory is denied once fallback is disabled', () => {
    // Otherwise an attacker who can knock the directory offline downgrades the
    // whole application to local passwords — the exact case this setting exists for.
    const decision = resolveLdapFailure(denyFallback, {
        success: false,
        errorCode: 'LDAP_UNREACHABLE',
    });

    assert.equal(decision.action, 'deny');
    assert.match(decision.message!, /directory/i);
});

test('an unreachable directory still falls back while fallback is enabled', () => {
    const decision = resolveLdapFailure(allowFallback, {
        success: false,
        errorCode: 'LDAP_UNREACHABLE',
    });

    assert.equal(decision.action, 'fallback');
});

test('an unknown user falls back so local-only accounts keep working', () => {
    const decision = resolveLdapFailure(allowFallback, {
        success: false,
        errorCode: 'USER_NOT_FOUND',
    });

    assert.equal(decision.action, 'fallback');
});

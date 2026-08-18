import test from 'node:test';
import assert from 'node:assert/strict';

import { mapGroupsToRole, checkAccountStatus, type GroupMappingRule } from './ldap-service.ts';

const DISPATCHERS = 'CN=Dispatchers,OU=Groups,DC=corp,DC=local';
const ADMINS = 'CN=Yard Admins,OU=Groups,DC=corp,DC=local';

test('with no rules everyone gets the default role', () => {
    assert.equal(mapGroupsToRole([DISPATCHERS], [], 'highest_role_wins', 'SECURITY'), 'SECURITY');
});

test('a user in no mapped group gets the default role', () => {
    const rules: GroupMappingRule[] = [{ groupDn: ADMINS, role: 'ADMIN' }];
    assert.equal(mapGroupsToRole([DISPATCHERS], rules, 'highest_role_wins', 'SECURITY'), 'SECURITY');
});

test('a matching group grants its role', () => {
    const rules: GroupMappingRule[] = [{ groupDn: DISPATCHERS, role: 'DISPATCHER' }];
    assert.equal(mapGroupsToRole([DISPATCHERS], rules, 'highest_role_wins', 'SECURITY'), 'DISPATCHER');
});

test('group DNs are matched case-insensitively, as directories return them', () => {
    const rules: GroupMappingRule[] = [{ groupDn: DISPATCHERS.toUpperCase(), role: 'DISPATCHER' }];
    assert.equal(
        mapGroupsToRole([DISPATCHERS.toLowerCase()], rules, 'highest_role_wins', 'SECURITY'),
        'DISPATCHER'
    );
});

test('highest_role_wins lets an explicit priority beat the role hierarchy', () => {
    const rules: GroupMappingRule[] = [
        { groupDn: ADMINS, role: 'ADMIN', priority: 1 },
        { groupDn: DISPATCHERS, role: 'DISPATCHER', priority: 5 },
    ];
    assert.equal(
        mapGroupsToRole([ADMINS, DISPATCHERS], rules, 'highest_role_wins', 'SECURITY'),
        'DISPATCHER'
    );
});

test('with equal priority the stronger role wins', () => {
    const rules: GroupMappingRule[] = [
        { groupDn: DISPATCHERS, role: 'DISPATCHER' },
        { groupDn: ADMINS, role: 'ADMIN' },
    ];
    assert.equal(mapGroupsToRole([ADMINS, DISPATCHERS], rules, 'highest_role_wins', 'SECURITY'), 'ADMIN');
});

test('merge_permissions takes the strongest matched role and ignores priority', () => {
    const rules: GroupMappingRule[] = [
        { groupDn: ADMINS, role: 'ADMIN', priority: 1 },
        { groupDn: DISPATCHERS, role: 'DISPATCHER', priority: 99 },
    ];
    assert.equal(
        mapGroupsToRole([ADMINS, DISPATCHERS], rules, 'merge_permissions', 'SECURITY'),
        'ADMIN'
    );
});

test('an unrecognised role in a rule cannot outrank a real one', () => {
    const rules: GroupMappingRule[] = [
        { groupDn: DISPATCHERS, role: 'SUPREME_LEADER' },
        { groupDn: ADMINS, role: 'DISPATCHER' },
    ];
    assert.equal(
        mapGroupsToRole([ADMINS, DISPATCHERS], rules, 'merge_permissions', 'SECURITY'),
        'DISPATCHER'
    );
});

test('a disabled AD account is detected from userAccountControl', () => {
    // 0x2 = ACCOUNTDISABLE, here combined with NORMAL_ACCOUNT (0x200).
    assert.deepEqual(checkAccountStatus({ userAccountControl: 514 }), {
        disabled: true,
        reason: 'account_disabled',
    });
});

test('a locked AD account is detected from userAccountControl', () => {
    // 0x10 = LOCKOUT
    assert.deepEqual(checkAccountStatus({ userAccountControl: 528 }), {
        disabled: true,
        reason: 'account_locked',
    });
});

test('an ordinary enabled account is not reported as disabled', () => {
    assert.deepEqual(checkAccountStatus({ userAccountControl: 512 }), { disabled: false });
    assert.deepEqual(checkAccountStatus({ userAccountControl: '512' }), { disabled: false });
});

test('accountExpires of 0 or the AD "never" sentinel does not mean expired', () => {
    assert.deepEqual(checkAccountStatus({ accountExpires: '0' }), { disabled: false });
    assert.deepEqual(checkAccountStatus({ accountExpires: '9223372036854775807' }), { disabled: false });
});

test('an accountExpires in the past is reported as expired', () => {
    // AD counts 100-nanosecond intervals since 1601-01-01.
    const past = (BigInt(Date.now() - 86_400_000) + BigInt('11644473600000')) * BigInt(10000);
    assert.deepEqual(checkAccountStatus({ accountExpires: past.toString() }), {
        disabled: true,
        reason: 'account_expired',
    });
});

test('an accountExpires in the future is not reported as expired', () => {
    const future = (BigInt(Date.now() + 86_400_000) + BigInt('11644473600000')) * BigInt(10000);
    assert.deepEqual(checkAccountStatus({ accountExpires: future.toString() }), { disabled: false });
});

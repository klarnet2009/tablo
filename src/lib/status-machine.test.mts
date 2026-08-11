import test from 'node:test';
import assert from 'node:assert/strict';

import {
    isValidTransition,
    canUserTransition,
    getAvailableTransitions,
    getTimestampField,
    type VisitStatus,
    type UserRole,
} from './status-machine.ts';

test('the happy path through a visit is allowed', () => {
    const path: VisitStatus[] = ['ARRIVED', 'WAITING', 'CALLED', 'DOCKED', 'IN_SERVICE', 'DONE', 'LEFT'];
    for (let i = 0; i < path.length - 1; i++) {
        assert.ok(
            isValidTransition(path[i], path[i + 1]),
            `${path[i]} -> ${path[i + 1]} should be allowed`
        );
    }
});

test('a truck cannot skip from the gate straight to a dock', () => {
    assert.equal(isValidTransition('ARRIVED', 'DOCKED'), false);
    assert.equal(isValidTransition('WAITING', 'IN_SERVICE'), false);
});

test('terminal states have no way out', () => {
    for (const terminal of ['LEFT', 'CANCELLED', 'NO_SHOW'] as VisitStatus[]) {
        assert.deepEqual(getAvailableTransitions(terminal, 'ADMIN'), []);
    }
});

test('gate security can check a truck in but cannot call it to a dock', () => {
    assert.equal(canUserTransition('ARRIVED', 'WAITING', 'SECURITY'), true);
    assert.equal(canUserTransition('WAITING', 'CALLED', 'SECURITY'), false);
    assert.equal(canUserTransition('WAITING', 'CALLED', 'DISPATCHER'), true);
});

test('gate security cannot cancel a visit', () => {
    assert.equal(canUserTransition('ARRIVED', 'CANCELLED', 'SECURITY'), false);
    assert.equal(canUserTransition('ARRIVED', 'CANCELLED', 'DISPATCHER'), true);
});

test('getAvailableTransitions is filtered by role', () => {
    assert.deepEqual(getAvailableTransitions('WAITING', 'SECURITY'), []);
    assert.deepEqual(getAvailableTransitions('WAITING', 'DISPATCHER'), ['CALLED', 'HOLD', 'CANCELLED']);
});

test('an unknown status or role is refused rather than defaulting to allowed', () => {
    assert.equal(isValidTransition('NOPE' as VisitStatus, 'WAITING'), false);
    assert.equal(canUserTransition('WAITING', 'CALLED', 'INTERN' as UserRole), false);
});

test('every allowed transition has a role that can perform it', () => {
    // A transition present in the state machine but missing from the permission
    // table is impossible for everyone, and silently so.
    const statuses: VisitStatus[] = [
        'PLANNED', 'NEW', 'ARRIVED', 'WAITING', 'CALLED', 'DOCKED',
        'IN_SERVICE', 'DONE', 'LEFT', 'CANCELLED', 'NO_SHOW', 'HOLD',
    ];
    const roles: UserRole[] = ['SECURITY', 'DISPATCHER', 'SUPERVISOR', 'ADMIN'];

    for (const from of statuses) {
        for (const to of statuses) {
            if (!isValidTransition(from, to)) continue;
            assert.ok(
                roles.some(role => canUserTransition(from, to, role)),
                `${from} -> ${to} is allowed by the state machine but no role can perform it`
            );
        }
    }
});

test('statuses that record a time map to their timestamp column', () => {
    assert.equal(getTimestampField('ARRIVED'), 'arrivedAt');
    assert.equal(getTimestampField('CALLED'), 'calledAt');
    assert.equal(getTimestampField('DOCKED'), 'dockedAt');
    assert.equal(getTimestampField('IN_SERVICE'), 'startedAt');
    assert.equal(getTimestampField('DONE'), 'finishedAt');
    assert.equal(getTimestampField('LEFT'), 'leftAt');
});

test('statuses that record no time map to null', () => {
    assert.equal(getTimestampField('WAITING'), null);
    assert.equal(getTimestampField('HOLD'), null);
    assert.equal(getTimestampField('CANCELLED'), null);
});

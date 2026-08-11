import test from 'node:test';
import assert from 'node:assert/strict';

import { priorityRank, sortVisitsForQueue } from './queue-order.ts';

const visit = (
    id: string,
    priority: string,
    queuePosition: number | null = null,
    createdAt = '2026-01-01T00:00:00.000Z'
) => ({ id, priority, queuePosition, createdAt });

test('priorityRank orders URGENT above SLA above HIGH above NORMAL', () => {
    assert.ok(priorityRank('URGENT') > priorityRank('SLA'));
    assert.ok(priorityRank('SLA') > priorityRank('HIGH'));
    assert.ok(priorityRank('HIGH') > priorityRank('NORMAL'));
});

test('an unknown priority never outranks NORMAL', () => {
    assert.ok(priorityRank('WHATEVER') <= priorityRank('NORMAL'));
});

test('HIGH is served before NORMAL', () => {
    // Ordering by the priority *string* descending put HIGH last of all four
    // ("URGENT" > "SLA" > "NORMAL" > "HIGH"), i.e. below NORMAL.
    const sorted = sortVisitsForQueue([visit('normal', 'NORMAL'), visit('high', 'HIGH')]);
    assert.deepEqual(sorted.map(v => v.id), ['high', 'normal']);
});

test('all four priorities come out in the intended order', () => {
    const sorted = sortVisitsForQueue([
        visit('n', 'NORMAL'),
        visit('h', 'HIGH'),
        visit('u', 'URGENT'),
        visit('s', 'SLA'),
    ]);
    assert.deepEqual(sorted.map(v => v.id), ['u', 's', 'h', 'n']);
});

test('within one priority the lower queue position goes first', () => {
    const sorted = sortVisitsForQueue([
        visit('third', 'NORMAL', 3),
        visit('first', 'NORMAL', 1),
        visit('second', 'NORMAL', 2),
    ]);
    assert.deepEqual(sorted.map(v => v.id), ['first', 'second', 'third']);
});

test('a visit without a queue position waits behind the numbered ones', () => {
    // Returning a truck to WAITING clears its queuePosition. In SQL, ASC put those
    // NULLs first, so a truck sent back to the queue jumped to the head of it.
    const sorted = sortVisitsForQueue([
        visit('unpositioned', 'NORMAL', null, '2026-01-01T08:00:00.000Z'),
        visit('positioned', 'NORMAL', 5, '2026-01-01T09:00:00.000Z'),
    ]);
    assert.deepEqual(sorted.map(v => v.id), ['positioned', 'unpositioned']);
});

test('with equal priority and no positions, the older visit goes first', () => {
    const sorted = sortVisitsForQueue([
        visit('newer', 'NORMAL', null, '2026-01-01T10:00:00.000Z'),
        visit('older', 'NORMAL', null, '2026-01-01T09:00:00.000Z'),
    ]);
    assert.deepEqual(sorted.map(v => v.id), ['older', 'newer']);
});

test('priority beats queue position', () => {
    const sorted = sortVisitsForQueue([
        visit('normal-first-in-line', 'NORMAL', 1),
        visit('urgent-last-in-line', 'URGENT', 99),
    ]);
    assert.deepEqual(sorted.map(v => v.id), ['urgent-last-in-line', 'normal-first-in-line']);
});

test('sortVisitsForQueue does not mutate its input', () => {
    const input = [visit('n', 'NORMAL'), visit('u', 'URGENT')];
    const sorted = sortVisitsForQueue(input);
    assert.deepEqual(input.map(v => v.id), ['n', 'u']);
    assert.deepEqual(sorted.map(v => v.id), ['u', 'n']);
});

test('accepts Date objects for createdAt as Prisma returns them', () => {
    const sorted = sortVisitsForQueue([
        { id: 'newer', priority: 'NORMAL', queuePosition: null, createdAt: new Date('2026-01-02') },
        { id: 'older', priority: 'NORMAL', queuePosition: null, createdAt: new Date('2026-01-01') },
    ]);
    assert.deepEqual(sorted.map(v => v.id), ['older', 'newer']);
});

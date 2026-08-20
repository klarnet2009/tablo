import test from 'node:test';
import assert from 'node:assert/strict';

import { nextRevision, shouldRefresh, computeDataStatus } from './display-freshness.ts';

test('the revision only advances when the payload actually changed', () => {
    const first = nextRevision(null, 0, '[{"id":"a"}]');
    assert.deepEqual(first, { revision: 1, changed: true });

    const same = nextRevision('[{"id":"a"}]', 1, '[{"id":"a"}]');
    assert.deepEqual(same, { revision: 1, changed: false });

    const different = nextRevision('[{"id":"a"}]', 1, '[{"id":"b"}]');
    assert.deepEqual(different, { revision: 2, changed: true });
});

test('an empty queue is a real state, not "no data"', () => {
    // Going from three trucks to none has to reach the board.
    const emptied = nextRevision('[{"id":"a"}]', 7, '[]');
    assert.deepEqual(emptied, { revision: 8, changed: true });
    // ...and staying empty must not keep bumping the revision.
    assert.deepEqual(nextRevision('[]', 8, '[]'), { revision: 8, changed: false });
});

test('a refresh happens when a mutation marked the data dirty', () => {
    assert.equal(shouldRefresh({ dirty: true, sinceLastFetchMs: 0, safetyNetMs: 30000 }), true);
});

test('an idle server does not touch the database', () => {
    // This is the whole point: no dirty flag, safety net not due, no query.
    assert.equal(shouldRefresh({ dirty: false, sinceLastFetchMs: 3000, safetyNetMs: 30000 }), false);
});

test('the safety net still refreshes periodically for out-of-band changes', () => {
    // Someone editing the database directly never sets the dirty flag.
    assert.equal(shouldRefresh({ dirty: false, sinceLastFetchMs: 30001, safetyNetMs: 30000 }), true);
    assert.equal(shouldRefresh({ dirty: false, sinceLastFetchMs: 29999, safetyNetMs: 30000 }), false);
});

const conn = (over: Partial<Parameters<typeof computeDataStatus>[0]> = {}) => ({
    connectedAt: new Date(1_000_000),
    clientRevision: 5 as number | null,
    clientRevisionAt: new Date(1_000_000) as Date | null,
    ...over,
});

test('a display that acknowledged the current revision is synced', () => {
    const status = computeDataStatus(conn({ clientRevisionAt: new Date(1_000_000) }), 5, 1_005_000);
    assert.equal(status, 'synced');
});

test('a display still acknowledging on schedule stays synced on a quiet yard', () => {
    // With payloads only sent on change, the ping-driven ack is the liveness signal.
    // An ack 16s old (one ping cycle) must not read as stale.
    const status = computeDataStatus(conn({ clientRevisionAt: new Date(1_000_000) }), 5, 1_016_000);
    assert.equal(status, 'synced');
});

test('a display behind the server but acknowledging recently is lagging', () => {
    const status = computeDataStatus(conn({ clientRevision: 4 }), 5, 1_005_000);
    assert.equal(status, 'lagging');
});

test('a display behind the server with an old acknowledgement is stale', () => {
    const status = computeDataStatus(conn({ clientRevision: 4 }), 5, 1_025_000);
    assert.equal(status, 'stale');
});

test('a display that stopped acknowledging is stale even on the right revision', () => {
    // Two missed ping cycles: the connection object is there, the screen is not.
    const status = computeDataStatus(conn(), 5, 1_046_000);
    assert.equal(status, 'stale');
});

test('a display that just connected is unknown, not stale', () => {
    const status = computeDataStatus(
        conn({ clientRevision: null, clientRevisionAt: null }),
        5,
        1_005_000
    );
    assert.equal(status, 'unknown');
});

test('a display that never acknowledged after the grace period is stale', () => {
    const status = computeDataStatus(
        conn({ clientRevision: null, clientRevisionAt: null }),
        5,
        1_040_000
    );
    assert.equal(status, 'stale');
});

test('a client ahead of the server is treated as synced, not lagging', () => {
    // Happens after a server restart resets the counter: the screen holds a higher
    // number than the server. It is not behind, so it must not be flagged.
    const status = computeDataStatus(conn({ clientRevision: 99 }), 5, 1_005_000);
    assert.equal(status, 'synced');
});

/**
 * Freshness arithmetic for the display boards.
 *
 * Kept free of Prisma and next/server imports so the decisions are unit-testable:
 * display-registry.ts owns the connections, this owns the rules.
 */

/** How long a fresh connection may go without an ack before it counts as stale. */
export const NO_ACK_GRACE_MS = 35_000;
/** An ack older than this on a connection means the screen went quiet. */
export const ACK_SILENCE_MS = 45_000;
/** A screen behind the server for longer than this is stale rather than lagging. */
export const BEHIND_TOLERANCE_MS = 20_000;

export type DataStatus = 'synced' | 'lagging' | 'stale' | 'unknown';

/**
 * Advance the payload revision only when the serialised payload differs.
 *
 * @param previousJson the last payload sent, or null if nothing has been sent
 * @param previousRevision the revision that payload carried
 */
export function nextRevision(
    previousJson: string | null,
    previousRevision: number,
    currentJson: string
): { revision: number; changed: boolean } {
    if (previousJson === currentJson) {
        return { revision: previousRevision, changed: false };
    }
    return { revision: previousRevision + 1, changed: true };
}

/**
 * Whether the broadcast loop should hit the database on this tick.
 *
 * The loop used to query and broadcast unconditionally every 3 seconds. Now a
 * mutation marks the data dirty, and the safety net covers changes made outside
 * the application (a direct database edit, a restored backup).
 */
export function shouldRefresh(input: {
    dirty: boolean;
    sinceLastFetchMs: number;
    safetyNetMs: number;
}): boolean {
    return input.dirty || input.sinceLastFetchMs > input.safetyNetMs;
}

/**
 * Classify how fresh one connected screen's data is.
 *
 * Acks arrive with the server's ping (every 15s) rather than with every payload,
 * so the thresholds are in ping cycles: one missed cycle is tolerated, two is not.
 */
export function computeDataStatus(
    conn: {
        connectedAt: Date;
        clientRevision: number | null;
        clientRevisionAt: Date | null;
    },
    serverRevision: number,
    now: number
): DataStatus {
    if (conn.clientRevision === null || conn.clientRevisionAt === null) {
        // Nothing acknowledged yet: new connections get one ping cycle to report in.
        return now - conn.connectedAt.getTime() < NO_ACK_GRACE_MS ? 'unknown' : 'stale';
    }

    const ackAgeMs = now - conn.clientRevisionAt.getTime();

    // The screen stopped talking to us, whatever revision it last held.
    if (ackAgeMs > ACK_SILENCE_MS) return 'stale';

    // Not behind. A client *ahead* of the server happens after a restart resets the
    // counter, and is not a freshness problem.
    if (conn.clientRevision >= serverRevision) return 'synced';

    return ackAgeMs > BEHIND_TOLERANCE_MS ? 'stale' : 'lagging';
}

/**
 * Queue ordering.
 *
 * SQLite cannot express this ordering: `ORDER BY priority DESC` sorts the label
 * alphabetically, which puts HIGH below NORMAL, and `queuePosition ASC` puts NULLs
 * first, which sends a truck that was returned to the queue to the head of it.
 * The queue is tens of rows, so it is ordered here instead.
 */

const PRIORITY_RANK: Record<string, number> = {
    URGENT: 4,
    SLA: 3,
    HIGH: 2,
    NORMAL: 1,
};

/** Higher is served earlier. An unrecognised priority never outranks NORMAL. */
export function priorityRank(priority: string | null | undefined): number {
    return PRIORITY_RANK[priority ?? ''] ?? 0;
}

interface Orderable {
    priority: string;
    queuePosition?: number | null;
    createdAt: string | Date;
}

function time(value: string | Date): number {
    return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

/**
 * Priority first, then place in the queue, then arrival order. Returns a new array.
 */
export function sortVisitsForQueue<T extends Orderable>(visits: readonly T[]): T[] {
    return [...visits].sort((a, b) => {
        const byPriority = priorityRank(b.priority) - priorityRank(a.priority);
        if (byPriority !== 0) return byPriority;

        // No position yet: keep it behind everything that has one.
        const posA = a.queuePosition ?? Number.MAX_SAFE_INTEGER;
        const posB = b.queuePosition ?? Number.MAX_SAFE_INTEGER;
        if (posA !== posB) return posA - posB;

        return time(a.createdAt) - time(b.createdAt);
    });
}

// Explicit extension so `node --test` can resolve this module too (Node's ESM
// loader does not guess extensions the way the bundler does).
import prisma from './prisma.ts';

const ACTIVE_AT_DOCK = ['CALLED', 'DOCKED', 'IN_SERVICE'];

/**
 * Take a dock for a visit, atomically.
 *
 * The previous code read the dock, decided it was free, then wrote BUSY in a
 * separate statement — so two dispatchers calling trucks at the same moment could
 * both pass the check and send two trucks to one dock. The claim is a single
 * conditional UPDATE instead, which SQLite applies atomically.
 *
 * @param currentDockId the dock this visit already holds, if any
 * @returns false when another active visit already holds the dock
 */
export async function claimDock(
    dockId: string,
    dockType: string,
    visitId: string,
    currentDockId: string | null
): Promise<boolean> {
    // Several trucks can be on the scales at once, so it is never exclusive.
    if (dockType === 'SCALES') {
        await prisma.dock.update({ where: { id: dockId }, data: { status: 'BUSY' } });
        return true;
    }

    const claimed = await prisma.dock.updateMany({
        where: { id: dockId, status: 'AVAILABLE' },
        data: { status: 'BUSY' },
    });
    if (claimed.count === 1) {
        return true;
    }

    // Not AVAILABLE. Acceptable only if this visit is the one already holding it.
    //
    // Deliberately does NOT fall back to "BUSY but no visit actually holds it":
    // a visit records assignedDockId *after* the claim, so during the window
    // between two concurrent claims neither is visible as the holder, and that
    // tolerance let both callers succeed — the exact race this function exists to
    // prevent. A dock stuck BUSY with nobody on it is cleared by an operator from
    // the docks page instead.
    return currentDockId === dockId;
}

/**
 * Release a dock on behalf of a visit, unless another active visit still holds it
 * (which is normal for the scales, where several trucks share one "dock").
 */
export async function releaseDock(dockId: string, releasingVisitId: string): Promise<void> {
    const otherHolder = await prisma.truckVisit.findFirst({
        where: {
            assignedDockId: dockId,
            status: { in: ACTIVE_AT_DOCK },
            id: { not: releasingVisitId },
        },
        select: { id: true },
    });

    if (otherHolder) return;

    await prisma.dock.update({ where: { id: dockId }, data: { status: 'AVAILABLE' } });
}

/**
 * What the right-hand column of a driver-board row says.
 *
 * The status decides the wording; the dock only adds a number or the scales icon.
 * It used to be the other way round — each state was shown only when a dock was
 * assigned, and anything else fell through to WAITING. The dock FK is ON DELETE
 * SET NULL, so deleting a dock left a called truck announced as waiting while the
 * dispatcher believed it had been called.
 */

export type BoardLabel =
    | 'proceedTo' | 'goToScales' | 'called'
    | 'atDock' | 'atScales'
    | 'loading' | 'weighing'
    | 'waiting';

export interface BoardRowStatus {
    /** Key into the board's translations. */
    label: BoardLabel;
    /** The bay number to show in a badge, or null when there is none to show. */
    dockNumber: number | null;
    /** Show the scales icon instead of a number. */
    scales: boolean;
    tone: 'called' | 'docked' | 'loading' | 'waiting';
}

interface Source {
    status: string;
    assignedDock?: { dockNumber: number; dockType: string } | null;
}

export function boardRowStatus({ status, assignedDock }: Source): BoardRowStatus {
    const scales = assignedDock?.dockType === 'SCALES';
    const dockNumber = assignedDock && !scales ? assignedDock.dockNumber : null;

    switch (status) {
        case 'CALLED':
            return {
                label: !assignedDock ? 'called' : scales ? 'goToScales' : 'proceedTo',
                dockNumber, scales, tone: 'called',
            };
        case 'DOCKED':
            return { label: scales ? 'atScales' : 'atDock', dockNumber, scales, tone: 'docked' };
        case 'IN_SERVICE':
            return { label: scales ? 'weighing' : 'loading', dockNumber, scales, tone: 'loading' };
        default:
            return { label: 'waiting', dockNumber: null, scales: false, tone: 'waiting' };
    }
}

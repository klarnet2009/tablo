// Status transition validation
// Implements the state machine from the implementation plan

export type VisitStatus =
    | 'PLANNED'
    | 'NEW'
    | 'ARRIVED'
    | 'WAITING'
    | 'CALLED'
    | 'DOCKED'
    | 'IN_SERVICE'
    | 'DONE'
    | 'LEFT'
    | 'CANCELLED'
    | 'NO_SHOW'
    | 'HOLD';

export type UserRole = 'SECURITY' | 'DISPATCHER' | 'SUPERVISOR' | 'ADMIN';

// Define valid transitions: from -> [to states]
const validTransitions: Record<VisitStatus, VisitStatus[]> = {
    PLANNED: ['ARRIVED', 'CANCELLED'],
    NEW: ['ARRIVED', 'CANCELLED'],
    ARRIVED: ['WAITING', 'CANCELLED'],
    WAITING: ['CALLED', 'HOLD', 'CANCELLED'],
    HOLD: ['WAITING', 'CANCELLED'],
    CALLED: ['DOCKED', 'WAITING', 'NO_SHOW'],
    DOCKED: ['IN_SERVICE', 'WAITING'],
    IN_SERVICE: ['DONE'],
    DONE: ['LEFT', 'WAITING', 'CALLED'],
    LEFT: [],
    CANCELLED: [],
    NO_SHOW: [],
};

// Define who can trigger each transition
const transitionPermissions: Record<string, UserRole[]> = {
    'PLANNED->ARRIVED': ['SECURITY', 'DISPATCHER', 'SUPERVISOR', 'ADMIN'],
    'PLANNED->CANCELLED': ['DISPATCHER', 'SUPERVISOR', 'ADMIN'],
    'NEW->ARRIVED': ['SECURITY', 'DISPATCHER', 'SUPERVISOR', 'ADMIN'],
    'NEW->CANCELLED': ['DISPATCHER', 'SUPERVISOR', 'ADMIN'],
    'ARRIVED->WAITING': ['SECURITY', 'DISPATCHER', 'SUPERVISOR', 'ADMIN'],
    'ARRIVED->CANCELLED': ['DISPATCHER', 'SUPERVISOR', 'ADMIN'],
    'WAITING->CALLED': ['DISPATCHER', 'SUPERVISOR', 'ADMIN'],
    'WAITING->HOLD': ['DISPATCHER', 'SUPERVISOR', 'ADMIN'],
    'WAITING->CANCELLED': ['DISPATCHER', 'SUPERVISOR', 'ADMIN'],
    'HOLD->WAITING': ['DISPATCHER', 'SUPERVISOR', 'ADMIN'],
    'HOLD->CANCELLED': ['DISPATCHER', 'SUPERVISOR', 'ADMIN'],
    'CALLED->DOCKED': ['DISPATCHER', 'SUPERVISOR', 'ADMIN'],
    'CALLED->WAITING': ['DISPATCHER', 'SUPERVISOR', 'ADMIN'],
    'CALLED->NO_SHOW': ['DISPATCHER', 'SUPERVISOR', 'ADMIN'],
    'DOCKED->IN_SERVICE': ['DISPATCHER', 'SUPERVISOR', 'ADMIN'],
    'DOCKED->WAITING': ['DISPATCHER', 'SUPERVISOR', 'ADMIN'],
    'IN_SERVICE->DONE': ['SECURITY', 'DISPATCHER', 'SUPERVISOR', 'ADMIN'],
    'DONE->LEFT': ['SECURITY', 'DISPATCHER', 'SUPERVISOR', 'ADMIN'],
    'DONE->WAITING': ['DISPATCHER', 'SUPERVISOR', 'ADMIN'],
    'DONE->CALLED': ['DISPATCHER', 'SUPERVISOR', 'ADMIN'],
};

export function isValidTransition(from: VisitStatus, to: VisitStatus): boolean {
    return validTransitions[from]?.includes(to) ?? false;
}

export function canUserTransition(from: VisitStatus, to: VisitStatus, role: UserRole): boolean {
    const key = `${from}->${to}`;
    const allowedRoles = transitionPermissions[key];
    if (!allowedRoles) return false;
    return allowedRoles.includes(role);
}

export function getAvailableTransitions(from: VisitStatus, role: UserRole): VisitStatus[] {
    const possibleStates = validTransitions[from] || [];
    return possibleStates.filter(to => canUserTransition(from, to, role));
}

// Timestamp field to update for each status
export function getTimestampField(status: VisitStatus): string | null {
    const fieldMap: Record<VisitStatus, string | null> = {
        PLANNED: null,
        NEW: null,
        ARRIVED: 'arrivedAt',
        WAITING: null,
        CALLED: 'calledAt',
        DOCKED: 'dockedAt',
        IN_SERVICE: 'startedAt',
        DONE: 'finishedAt',
        LEFT: 'leftAt',
        CANCELLED: null,
        NO_SHOW: null,
        HOLD: null,
    };
    return fieldMap[status];
}

// Status display info.
//
// Tinted for the dark surfaces this app actually renders on. These used to be a
// light-theme set (bg-*-100 with text-*-600) — legible in itself, but the one
// place in the product where the palette came from a different theme, so status
// chips read as pasted onto the dark cards rather than belonging to them.
// Every pair below is >= 6.8:1 against the card surface.
export const statusInfo: Record<VisitStatus, { label: string; color: string; bgColor: string }> = {
    PLANNED: { label: 'Planned', color: 'text-cyan-300', bgColor: 'bg-cyan-500/15' },
    NEW: { label: 'New', color: 'text-slate-300', bgColor: 'bg-slate-500/15' },
    ARRIVED: { label: 'Arrived', color: 'text-blue-300', bgColor: 'bg-blue-500/15' },
    WAITING: { label: 'Waiting', color: 'text-yellow-300', bgColor: 'bg-yellow-500/15' },
    CALLED: { label: 'Called', color: 'text-orange-300', bgColor: 'bg-orange-500/15' },
    DOCKED: { label: 'At Dock', color: 'text-purple-300', bgColor: 'bg-purple-500/15' },
    IN_SERVICE: { label: 'Loading', color: 'text-indigo-300', bgColor: 'bg-indigo-500/15' },
    DONE: { label: 'Done', color: 'text-green-300', bgColor: 'bg-green-500/15' },
    LEFT: { label: 'Left', color: 'text-slate-400', bgColor: 'bg-slate-500/10' },
    CANCELLED: { label: 'Cancelled', color: 'text-red-300', bgColor: 'bg-red-500/15' },
    NO_SHOW: { label: 'No Show', color: 'text-red-300', bgColor: 'bg-red-500/15' },
    HOLD: { label: 'On Hold', color: 'text-amber-300', bgColor: 'bg-amber-500/15' },
};

// Priority display info
export const priorityInfo: Record<string, { label: string; color: string; bgColor: string }> = {
    NORMAL: { label: 'Normal', color: 'text-slate-300', bgColor: 'bg-slate-500/15' },
    HIGH: { label: 'High', color: 'text-orange-300', bgColor: 'bg-orange-500/15' },
    URGENT: { label: 'Urgent', color: 'text-red-300', bgColor: 'bg-red-500/15' },
    SLA: { label: 'SLA', color: 'text-purple-300', bgColor: 'bg-purple-500/15' },
};

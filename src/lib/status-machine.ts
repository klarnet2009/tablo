// Status transition validation
// Implements the state machine from the implementation plan

export type VisitStatus =
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

// Status display info
export const statusInfo: Record<VisitStatus, { label: string; color: string; bgColor: string }> = {
    NEW: { label: 'New', color: 'text-gray-600', bgColor: 'bg-gray-100' },
    ARRIVED: { label: 'Arrived', color: 'text-blue-600', bgColor: 'bg-blue-100' },
    WAITING: { label: 'Waiting', color: 'text-yellow-600', bgColor: 'bg-yellow-100' },
    CALLED: { label: 'Called', color: 'text-orange-600', bgColor: 'bg-orange-100' },
    DOCKED: { label: 'At Dock', color: 'text-purple-600', bgColor: 'bg-purple-100' },
    IN_SERVICE: { label: 'Loading', color: 'text-indigo-600', bgColor: 'bg-indigo-100' },
    DONE: { label: 'Done', color: 'text-green-600', bgColor: 'bg-green-100' },
    LEFT: { label: 'Left', color: 'text-gray-500', bgColor: 'bg-gray-50' },
    CANCELLED: { label: 'Cancelled', color: 'text-red-600', bgColor: 'bg-red-100' },
    NO_SHOW: { label: 'No Show', color: 'text-red-600', bgColor: 'bg-red-100' },
    HOLD: { label: 'On Hold', color: 'text-amber-600', bgColor: 'bg-amber-100' },
};

// Priority display info
export const priorityInfo: Record<string, { label: string; color: string; bgColor: string }> = {
    NORMAL: { label: 'Normal', color: 'text-gray-600', bgColor: 'bg-gray-100' },
    HIGH: { label: 'High', color: 'text-orange-600', bgColor: 'bg-orange-100' },
    URGENT: { label: 'Urgent', color: 'text-red-600', bgColor: 'bg-red-100' },
    SLA: { label: 'SLA', color: 'text-purple-600', bgColor: 'bg-purple-100' },
};

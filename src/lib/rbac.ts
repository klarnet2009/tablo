// Role-based access control

import { UserRole } from './status-machine';

// Permission definitions
type Permission =
    | 'visit:create'
    | 'visit:read'
    | 'visit:update'
    | 'visit:delete'
    | 'visit:assign_dock'
    | 'visit:change_priority'
    | 'visit:cancel'
    | 'dock:read'
    | 'dock:create'
    | 'dock:update'
    | 'dock:close'
    | 'user:read'
    | 'user:create'
    | 'user:update'
    | 'user:delete'
    | 'report:read'
    | 'audit:read'
    | 'settings:read'
    | 'settings:update'
    | 'override:rules';

// Role -> Permissions mapping
const rolePermissions: Record<UserRole, Permission[]> = {
    SECURITY: [
        'visit:create',
        'visit:read',
        'visit:update', // Limited to certain status changes
        'dock:read',
    ],
    DISPATCHER: [
        'visit:create',
        'visit:read',
        'visit:update',
        'visit:assign_dock',
        'visit:change_priority',
        'visit:cancel',
        'dock:read',
        'report:read',
    ],
    SUPERVISOR: [
        'visit:create',
        'visit:read',
        'visit:update',
        'visit:delete',
        'visit:assign_dock',
        'visit:change_priority',
        'visit:cancel',
        'dock:read',
        'dock:create',
        'dock:update',
        'dock:close',
        'user:read',
        'user:create',
        'user:update',
        'report:read',
        'audit:read',
        'override:rules',
    ],
    ADMIN: [
        'visit:create',
        'visit:read',
        'visit:update',
        'visit:delete',
        'visit:assign_dock',
        'visit:change_priority',
        'visit:cancel',
        'dock:read',
        'dock:create',
        'dock:update',
        'dock:close',
        'user:read',
        'user:create',
        'user:update',
        'user:delete',
        'report:read',
        'audit:read',
        'settings:read',
        'settings:update',
        'override:rules',
    ],
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
    return rolePermissions[role]?.includes(permission) ?? false;
}

export function checkPermission(role: UserRole, permission: Permission): void {
    if (!hasPermission(role, permission)) {
        throw new Error(`Permission denied: ${permission} requires higher privileges`);
    }
}

// Role hierarchy for comparison
const roleHierarchy: Record<UserRole, number> = {
    SECURITY: 1,
    DISPATCHER: 2,
    SUPERVISOR: 3,
    ADMIN: 4,
};

export function isRoleAtLeast(userRole: UserRole, requiredRole: UserRole): boolean {
    return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
}

export function getRoleLabel(role: UserRole): string {
    const labels: Record<UserRole, string> = {
        SECURITY: 'Security',
        DISPATCHER: 'Dispatcher',
        SUPERVISOR: 'Supervisor',
        ADMIN: 'Administrator',
    };
    return labels[role] || role;
}

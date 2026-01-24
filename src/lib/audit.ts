// Audit logging helper

import prisma from './prisma';

interface AuditLogEntry {
    action: string;
    entityType: string;
    entityId: string;
    userId: string;
    visitId?: string;
    beforeState?: object;
    afterState?: object;
    metadata?: object;
}

export async function createAuditLog(entry: AuditLogEntry): Promise<void> {
    try {
        await prisma.auditLog.create({
            data: {
                action: entry.action,
                entityType: entry.entityType,
                entityId: entry.entityId,
                userId: entry.userId,
                visitId: entry.visitId,
                beforeState: entry.beforeState ? JSON.stringify(entry.beforeState) : null,
                afterState: entry.afterState ? JSON.stringify(entry.afterState) : null,
                metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
            },
        });
    } catch (error) {
        console.error('Failed to create audit log:', error);
        // Don't throw - audit logging should not break the main operation
    }
}

// Common audit actions
export const AuditActions = {
    VISIT_CREATED: 'VISIT_CREATED',
    STATUS_CHANGE: 'STATUS_CHANGE',
    DOCK_ASSIGNED: 'DOCK_ASSIGNED',
    DOCK_UNASSIGNED: 'DOCK_UNASSIGNED',
    DOCK_REASSIGN: 'DOCK_REASSIGN',
    PRIORITY_CHANGED: 'PRIORITY_CHANGED',
    VISIT_UPDATED: 'VISIT_UPDATED',
    VISIT_DELETED: 'VISIT_DELETED',
    DOCK_CREATED: 'DOCK_CREATED',
    DOCK_UPDATED: 'DOCK_UPDATED',
    USER_LOGIN: 'USER_LOGIN',
    USER_LOGOUT: 'USER_LOGOUT',
} as const;

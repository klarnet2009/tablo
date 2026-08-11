/**
 * Request validation for truck visits, shared by the create and update routes.
 *
 * The schedule field carries a time of day ("08:30"). It used to be an unchecked
 * string that the routes fed straight into `new Date(y, m, d, parseInt(h), parseInt(m))`,
 * so anything unparseable became an Invalid Date and surfaced as a 500 from Prisma.
 */

import { z } from 'zod';

/** 24-hour HH:MM. */
const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;

const plate = z.string().transform(s => s.toUpperCase().replace(/\s/g, ''));

/** A plate that is non-empty *after* whitespace is stripped. */
const requiredPlate = plate.refine(s => s.length > 0, { message: 'Plate is required' });

const scheduledAt = z
    .string()
    .refine(s => s === '' || TIME_OF_DAY.test(s), { message: 'Expected a time of day as HH:MM' });

export const createVisitSchema = z.object({
    truckPlate: requiredPlate,
    trailerPlate: plate.optional(),
    carrier: z.string().optional(),
    driverName: z.string().optional(),
    driverPhone: z.string().optional(),
    loadType: z.enum(['INBOUND', 'OUTBOUND', 'MIXED']).default('INBOUND'),
    orderRef: z.string().optional(),
    priority: z.enum(['NORMAL', 'HIGH', 'URGENT', 'SLA']).default('NORMAL'),
    scheduledAt: scheduledAt.optional(),
    notes: z.string().optional(),
    flags: z.array(z.string()).optional(),
});

export const updateVisitSchema = z.object({
    truckPlate: requiredPlate.optional(),
    trailerPlate: plate.optional(),
    carrier: z.string().optional(),
    driverName: z.string().optional(),
    driverPhone: z.string().optional(),
    loadType: z.enum(['INBOUND', 'OUTBOUND', 'MIXED']).optional(),
    orderRef: z.string().optional(),
    priority: z.enum(['NORMAL', 'HIGH', 'URGENT', 'SLA']).optional(),
    scheduledAt: scheduledAt.optional(),
    notes: z.string().optional(),
});

/**
 * Combine an HH:MM time with the date part of `reference`.
 * @returns null when the value is empty or not a valid time.
 */
export function parseTimeOfDay(value: string, reference: Date): Date | null {
    if (!TIME_OF_DAY.test(value)) return null;

    const [hours, minutes] = value.split(':').map(Number);
    return new Date(
        reference.getFullYear(),
        reference.getMonth(),
        reference.getDate(),
        hours,
        minutes
    );
}

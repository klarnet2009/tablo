import test from 'node:test';
import assert from 'node:assert/strict';

import { createVisitSchema, updateVisitSchema, parseTimeOfDay } from './visit-schemas.ts';

test('a valid HH:MM schedule is accepted', () => {
    const parsed = createVisitSchema.parse({ truckPlate: 'AB123', scheduledAt: '08:30' });
    assert.equal(parsed.scheduledAt, '08:30');
});

test('a nonsense time is rejected instead of reaching the database', () => {
    // '25:99' used to reach `new Date(y, m, d, parseInt('25'), parseInt('99'))`,
    // and 'later' produced NaN, which Prisma rejected as an opaque 500.
    assert.throws(() => createVisitSchema.parse({ truckPlate: 'AB123', scheduledAt: '25:99' }));
    assert.throws(() => createVisitSchema.parse({ truckPlate: 'AB123', scheduledAt: 'later' }));
    assert.throws(() => createVisitSchema.parse({ truckPlate: 'AB123', scheduledAt: '8:5' }));
});

test('an empty schedule is accepted and means "no appointment"', () => {
    const parsed = updateVisitSchema.parse({ scheduledAt: '' });
    assert.equal(parsed.scheduledAt, '');
});

test('the truck plate is uppercased and stripped of spaces', () => {
    const parsed = createVisitSchema.parse({ truckPlate: ' ab 123 cd ' });
    assert.equal(parsed.truckPlate, 'AB123CD');
});

test('an empty truck plate is rejected on create and on update', () => {
    assert.throws(() => createVisitSchema.parse({ truckPlate: '' }));
    assert.throws(() => updateVisitSchema.parse({ truckPlate: '' }));
});

test('a plate of nothing but spaces is rejected, not silently emptied', () => {
    assert.throws(() => createVisitSchema.parse({ truckPlate: '   ' }));
});

test('parseTimeOfDay places the time on the reference date', () => {
    const reference = new Date(2026, 7, 11, 15, 45);
    const parsed = parseTimeOfDay('08:30', reference);
    assert.equal(parsed?.getFullYear(), 2026);
    assert.equal(parsed?.getMonth(), 7);
    assert.equal(parsed?.getDate(), 11);
    assert.equal(parsed?.getHours(), 8);
    assert.equal(parsed?.getMinutes(), 30);
});

test('parseTimeOfDay returns null for an empty or malformed value', () => {
    const reference = new Date(2026, 7, 11);
    assert.equal(parseTimeOfDay('', reference), null);
    assert.equal(parseTimeOfDay('nope', reference), null);
});

test('parseTimeOfDay handles midnight, which is falsy as an hour', () => {
    const parsed = parseTimeOfDay('00:00', new Date(2026, 7, 11));
    assert.equal(parsed?.getHours(), 0);
    assert.equal(parsed?.getMinutes(), 0);
});

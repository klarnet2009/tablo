import test from 'node:test';
import assert from 'node:assert/strict';

import { boardRowStatus } from './board-status.ts';

const bay = { dockNumber: 7, dockType: 'BOTH' };
const scales = { dockNumber: 99, dockType: 'SCALES' };

test('a called truck is told its dock', () => {
    assert.deepEqual(boardRowStatus({ status: 'CALLED', assignedDock: bay }),
        { label: 'proceedTo', dockNumber: 7, scales: false, tone: 'called' });
});

test('a called truck sent to the scales gets the scales, not a number', () => {
    assert.deepEqual(boardRowStatus({ status: 'CALLED', assignedDock: scales }),
        { label: 'goToScales', dockNumber: null, scales: true, tone: 'called' });
});

test('a called truck whose dock was deleted still reads as called, never as waiting', () => {
    // The dock FK is ON DELETE SET NULL. The board used to fall through to WAITING
    // here while the dispatcher believed the truck had been called.
    assert.deepEqual(boardRowStatus({ status: 'CALLED' }),
        { label: 'called', dockNumber: null, scales: false, tone: 'called' });
});

test('docked and loading keep their state when the dock is gone', () => {
    assert.equal(boardRowStatus({ status: 'DOCKED' }).label, 'atDock');
    assert.equal(boardRowStatus({ status: 'IN_SERVICE' }).label, 'loading');
});

test('docked and loading at the scales use the scales wording', () => {
    assert.deepEqual(boardRowStatus({ status: 'DOCKED', assignedDock: scales }),
        { label: 'atScales', dockNumber: null, scales: true, tone: 'docked' });
    assert.deepEqual(boardRowStatus({ status: 'IN_SERVICE', assignedDock: scales }),
        { label: 'weighing', dockNumber: null, scales: true, tone: 'loading' });
});

test('docked and loading at a bay show the bay number', () => {
    assert.deepEqual(boardRowStatus({ status: 'DOCKED', assignedDock: bay }),
        { label: 'atDock', dockNumber: 7, scales: false, tone: 'docked' });
    assert.deepEqual(boardRowStatus({ status: 'IN_SERVICE', assignedDock: bay }),
        { label: 'loading', dockNumber: 7, scales: false, tone: 'loading' });
});

test('everything else on the board is waiting', () => {
    assert.deepEqual(boardRowStatus({ status: 'WAITING' }),
        { label: 'waiting', dockNumber: null, scales: false, tone: 'waiting' });
});

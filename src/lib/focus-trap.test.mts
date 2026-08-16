import test from 'node:test';
import assert from 'node:assert/strict';

import { nextFocusIndex } from './focus-trap.ts';

test('Tab moves forward through the dialog', () => {
    assert.equal(nextFocusIndex(0, 4, false), 1);
    assert.equal(nextFocusIndex(2, 4, false), 3);
});

test('Tab on the last control wraps to the first, instead of escaping to the page', () => {
    assert.equal(nextFocusIndex(3, 4, false), 0);
});

test('Shift+Tab moves backward', () => {
    assert.equal(nextFocusIndex(3, 4, true), 2);
});

test('Shift+Tab on the first control wraps to the last', () => {
    assert.equal(nextFocusIndex(0, 4, true), 3);
});

test('focus outside the dialog is pulled to the first control', () => {
    // getElementIndex returns -1 when focus escaped, e.g. it was on the page behind.
    assert.equal(nextFocusIndex(-1, 4, false), 0);
    assert.equal(nextFocusIndex(-1, 4, true), 3);
});

test('a dialog with a single control keeps focus on it', () => {
    assert.equal(nextFocusIndex(0, 1, false), 0);
    assert.equal(nextFocusIndex(0, 1, true), 0);
});

test('a dialog with nothing focusable reports no target', () => {
    assert.equal(nextFocusIndex(-1, 0, false), -1);
    assert.equal(nextFocusIndex(0, 0, true), -1);
});

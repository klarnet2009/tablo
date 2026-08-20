import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldReloadForBuild } from './build-id.ts';

test('the first build id observed is recorded, not reloaded on', () => {
    assert.equal(shouldReloadForBuild(null, 'abc123'), false);
});

test('the same build id on every later ping changes nothing', () => {
    assert.equal(shouldReloadForBuild('abc123', 'abc123'), false);
});

test('a different build id means a new deployment is serving, so reload', () => {
    assert.equal(shouldReloadForBuild('abc123', 'def456'), true);
});

test('a server that reports no build id never triggers a reload', () => {
    // An older server, or one that could not read .next/BUILD_ID. Reloading on a
    // missing value would put the board in a reload loop.
    assert.equal(shouldReloadForBuild('abc123', undefined), false);
    assert.equal(shouldReloadForBuild('abc123', ''), false);
    assert.equal(shouldReloadForBuild(null, undefined), false);
});

test('a non-string build id is ignored rather than compared', () => {
    // Defends against a malformed payload turning into an endless reload.
    assert.equal(shouldReloadForBuild('abc123', 42 as unknown as string), false);
    assert.equal(shouldReloadForBuild('abc123', null as unknown as string), false);
});

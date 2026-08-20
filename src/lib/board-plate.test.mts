import test from 'node:test';
import assert from 'node:assert/strict';

import { boardPlateText } from './board-plate.ts';

test('the truck plate is the line the driver reads, on its own', () => {
    // Measured on the panel: joining the plate to the carrier inside one 8s marquee
    // meant the plate was off-screen for most of every cycle. The plate is pinned now,
    // so this must never come back as a joined string.
    assert.deepEqual(
        boardPlateText({ truckPlate: 'AB 1234', trailerPlate: 'TR 5678', carrier: 'Kreiss' }),
        { primary: 'AB 1234', secondary: 'TR 5678' },
    );
});

test('the carrier never appears beside a plate', () => {
    assert.deepEqual(
        boardPlateText({ truckPlate: 'AB 1234', carrier: 'Girteka Logistics International' }),
        { primary: 'AB 1234', secondary: null },
    );
});

test('with no truck plate the trailer plate is promoted, not duplicated', () => {
    assert.deepEqual(
        boardPlateText({ trailerPlate: 'TR 5678', carrier: 'DSV' }),
        { primary: 'TR 5678', secondary: null },
    );
});

test('with no plate at all the carrier stands in, rather than UNKNOWN', () => {
    // The alternative is a board announcing UNKNOWN for a truck that is really there.
    assert.deepEqual(
        boardPlateText({ carrier: 'Rhenus' }),
        { primary: 'Rhenus', secondary: null },
    );
});

test('placeholder values count as absent', () => {
    for (const placeholder of ['', '   ', '-', '—', 'N/A']) {
        assert.deepEqual(
            boardPlateText({ truckPlate: placeholder, trailerPlate: 'TR 5678' }),
            { primary: 'TR 5678', secondary: null },
            `expected ${JSON.stringify(placeholder)} to be treated as absent`,
        );
    }
});

test('a visit carrying nothing identifiable says so', () => {
    assert.deepEqual(boardPlateText({}), { primary: 'UNKNOWN', secondary: null });
    assert.deepEqual(
        boardPlateText({ truckPlate: '-', trailerPlate: 'N/A', carrier: '  ' }),
        { primary: 'UNKNOWN', secondary: null },
    );
});

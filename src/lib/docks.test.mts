/**
 * Integration test: dock claiming must be atomic.
 *
 * Builds a throwaway SQLite database from prisma/schema.prisma (via
 * `prisma migrate diff`, so the schema is never duplicated here) and drives the
 * real Prisma client against it.
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const dbPath = path.join(os.tmpdir(), `tablo-docks-test-${process.pid}.db`);

// prisma.ts reads DATABASE_URL when the module is first evaluated, so the
// environment has to be set before anything imports it.
process.env.DATABASE_URL = `file:${dbPath}`;

type DockModule = typeof import('./docks.ts');
let claimDock: DockModule['claimDock'];
let releaseDock: DockModule['releaseDock'];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let prisma: any;

before(async () => {
    // Invoke the CLI's JS entry directly: spawning npx.cmd fails with EINVAL on
    // Windows under Node 24.
    const ddl = execFileSync(
        process.execPath,
        [
            'node_modules/prisma/build/index.js',
            'migrate', 'diff', '--from-empty', '--to-schema', 'prisma/schema.prisma', '--script',
        ],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    );

    // Each statement is preceded by a "-- CreateTable" comment, so comments are
    // stripped per line; dropping whole chunks that start with one would drop
    // every statement.
    const statements = ddl
        .split(';')
        .map(chunk =>
            chunk
                .split('\n')
                .filter(line => !line.trim().startsWith('--'))
                .join('\n')
                .trim()
        )
        .filter(chunk => /^(CREATE|ALTER|PRAGMA|INSERT)/i.test(chunk));

    assert.ok(statements.length > 0, 'prisma migrate diff produced no statements');

    const { createClient } = await import('@libsql/client');
    const bootstrap = createClient({ url: `file:${dbPath}` });
    for (const statement of statements) {
        await bootstrap.execute(statement);
    }
    bootstrap.close();

    ({ default: prisma } = await import('./prisma.ts'));
    ({ claimDock, releaseDock } = await import('./docks.ts'));

    await prisma.user.create({
        data: { id: 'u1', username: 'tester', passwordHash: 'x', displayName: 'Tester' },
    });
});

after(async () => {
    await prisma?.$disconnect();
    // Best effort: Windows may still hold the file handle briefly.
    try {
        fs.rmSync(dbPath, { force: true });
    } catch {
        // temp file, left for the OS to reap
    }
});

let seq = 0;
async function freshDock(dockType = 'BOTH', status = 'AVAILABLE') {
    seq += 1;
    return prisma.dock.create({
        data: { id: `dock-${seq}`, name: `Dock ${seq}`, dockNumber: seq, dockType, status },
    });
}

async function freshVisit(assignedDockId: string | null = null, status = 'WAITING') {
    seq += 1;
    return prisma.truckVisit.create({
        data: { id: `visit-${seq}`, truckPlate: `PLATE${seq}`, status, assignedDockId, createdById: 'u1' },
    });
}

test('two visits claiming the same dock at the same time: exactly one wins', async () => {
    const dock = await freshDock();
    const a = await freshVisit();
    const b = await freshVisit();

    const [first, second] = await Promise.all([
        claimDock(dock.id, dock.dockType, a.id, null),
        claimDock(dock.id, dock.dockType, b.id, null),
    ]);

    assert.equal([first, second].filter(Boolean).length, 1, 'exactly one claim should succeed');
    const after = await prisma.dock.findUnique({ where: { id: dock.id } });
    assert.equal(after.status, 'BUSY');
});

test('claiming an available dock succeeds and marks it busy', async () => {
    const dock = await freshDock();
    const visit = await freshVisit();

    assert.equal(await claimDock(dock.id, dock.dockType, visit.id, null), true);
    const after = await prisma.dock.findUnique({ where: { id: dock.id } });
    assert.equal(after.status, 'BUSY');
});

test('a visit may re-claim the dock it already holds', async () => {
    const dock = await freshDock('BOTH', 'BUSY');
    const visit = await freshVisit(dock.id, 'CALLED');

    assert.equal(await claimDock(dock.id, dock.dockType, visit.id, dock.id), true);
});

test('a busy dock held by another active visit cannot be claimed', async () => {
    const dock = await freshDock('BOTH', 'BUSY');
    await freshVisit(dock.id, 'DOCKED');
    const newcomer = await freshVisit();

    assert.equal(await claimDock(dock.id, dock.dockType, newcomer.id, null), false);
});

test('a dock left busy with nobody on it is not silently taken', async () => {
    // Tempting to allow, but a visit records assignedDockId only *after* claiming,
    // so "BUSY and unheld" is indistinguishable from "claimed a millisecond ago" —
    // allowing it lets two concurrent claims both succeed. Recovering such a dock
    // is an explicit operator action on the docks page.
    const dock = await freshDock('BOTH', 'BUSY');
    const visit = await freshVisit();

    assert.equal(await claimDock(dock.id, dock.dockType, visit.id, null), false);
});

test('the scales accept several trucks at once', async () => {
    const scales = await freshDock('SCALES');
    const a = await freshVisit();
    const b = await freshVisit();

    assert.equal(await claimDock(scales.id, 'SCALES', a.id, null), true);
    assert.equal(await claimDock(scales.id, 'SCALES', b.id, null), true);
});

test('releasing a dock frees it', async () => {
    const dock = await freshDock('BOTH', 'BUSY');
    const visit = await freshVisit(dock.id, 'DONE');

    await releaseDock(dock.id, visit.id);
    const after = await prisma.dock.findUnique({ where: { id: dock.id } });
    assert.equal(after.status, 'AVAILABLE');
});

test('releasing a dock leaves it busy while another active visit holds it', async () => {
    const dock = await freshDock('BOTH', 'BUSY');
    const leaving = await freshVisit(dock.id, 'DONE');
    await freshVisit(dock.id, 'IN_SERVICE');

    await releaseDock(dock.id, leaving.id);
    const after = await prisma.dock.findUnique({ where: { id: dock.id } });
    assert.equal(after.status, 'BUSY');
});

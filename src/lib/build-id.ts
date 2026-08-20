/**
 * Build identity, so a screen that nobody attends can notice it is running code
 * from a previous deployment.
 *
 * The board holds one page open for weeks. On a deploy the server restarts, the SSE
 * stream drops and EventSource reconnects within seconds — well inside the 90s
 * silence watchdog — so the page never reloads and keeps executing the old bundle.
 * The build id rides along on every ping; when it changes, the board reloads.
 *
 * Deliberately free of imports: this is bundled into the client, so it cannot reach
 * for node:fs. Reading the id is the server's job, in display-registry.ts.
 */

/**
 * Whether a reported build id means the page should reload.
 *
 * @param seen the build id this page started with, or null before the first ping
 * @param reported what the server just said
 */
export function shouldReloadForBuild(seen: string | null, reported: string | undefined): boolean {
    if (typeof reported !== 'string' || reported === '') return false;
    if (seen === null) return false;
    return seen !== reported;
}

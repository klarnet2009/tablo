/**
 * What the driver board prints on a queue row.
 *
 * The board answers one question — "is that me?" — and it used to answer it badly:
 * truck plate, trailer plate and carrier were joined with " | " into a single line
 * that scrolled on an 8s marquee whenever it ran past twelve characters, which was
 * nearly always. Measured on the panel, a driver glancing up at `AB 1234 | TR 5678 |
 * Kreiss` saw `| Kreiss  AB 12`. The plate — the product's proper noun, and the one
 * thing the row exists to show — was off-screen for most of every cycle.
 *
 * So the plate is pinned and the carrier is off the board. A driver knows who they
 * drive for; the carrier name was dispatcher information that followed the data model
 * onto a public sign. It survives only as a last resort, when a visit carries no plate
 * at all and the alternative is a board announcing UNKNOWN about a truck that is
 * really standing there.
 */

export interface BoardPlateSource {
    truckPlate?: string;
    trailerPlate?: string;
    carrier?: string;
}

export interface BoardPlateText {
    /** The identity line. Pinned, never scrolled. */
    primary: string;
    /** The trailer plate, when it is not already carrying the row. */
    secondary: string | null;
}

/**
 * Operators type these by hand, and an absent value arrives as a dash as often as
 * an empty string.
 */
function present(value?: string): string | null {
    const trimmed = value?.trim();
    if (!trimmed || trimmed === '-' || trimmed === '—' || trimmed === 'N/A') return null;
    return trimmed;
}

export function boardPlateText(visit: BoardPlateSource): BoardPlateText {
    const truck = present(visit.truckPlate);
    const trailer = present(visit.trailerPlate);

    if (truck) return { primary: truck, secondary: trailer };
    // No tractor plate: whatever identifies the vehicle is promoted to the line, and
    // nothing repeats underneath it.
    return { primary: trailer ?? present(visit.carrier) ?? 'UNKNOWN', secondary: null };
}

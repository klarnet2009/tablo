---
target: дисплей (driver board)
total_score: 15
max_score: 28
na_heuristics: 3,7,10
p0_count: 2
p1_count: 2
timestamp: 2026-08-20T13-10-08Z
slug: src-app-display-page-tsx
---
⚠️ DEGRADED: single-context (session instruction forbids spawning sub-agents; A and B ran sequentially in one context)

Surface: driver board (`src/app/display/page.tsx`) — public information display, Read mode.
Measured live at 576×224 in a 720×480 viewport against a seeded queue carrying one row per board state.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Connection state uses two contradicting thresholds (dot at 15s, banner at 35s); page position is a 6px dot |
| 2 | Match System / Real World | 3 | Departure-board metaphor is right; plate/trailer/carrier joined with a developer's pipe separator |
| 3 | User Control and Freedom | n/a | Zero-interaction wall panel; no controls exist to escape from |
| 4 | Consistency and Standards | 2 | Status labels 12px vs 20px by status; `⚠` glyph icon against the project's own ban; banner English-only while the board rotates EN/PL |
| 5 | Error Prevention | 1 | Plate marquees together with the carrier, so "is that me?" is intermittently unanswerable; flash plate at 2.22:1 |
| 6 | Recognition Rather Than Recall | 2 | 10s page rotation and 7s language rotation force the driver to wait and re-scan |
| 7 | Flexibility and Efficiency | n/a | No accelerators are possible or wanted for a driver in a cab |
| 8 | Aesthetic and Minimalist Design | 3 | Genuinely spare and hierarchy-first; undercut by 53% unused panel and a technician's status dot |
| 9 | Error Recovery | 2 | Detection and escalation are excellent; the message shown to the driver is not |
| 10 | Help and Documentation | n/a | A wall sign has no help affordance and needs none |
| **Total** | | **15/28** | **Acceptable (54%)** |

*Post-review amendment: the [P1] panel-size finding below is withdrawn (framebuffer measurement correct, physical panel unaffected). Heuristic 8 keeps its score of 3 on the strength of the 6px diagnostic dot alone.*

## Design Specificity Verdict

**LLM assessment — authored, not interchangeable.** This board could not be lifted onto another product. The composition is specific to its scene: a black ground because the panel is backlit in a yard, monospace plates because a plate is a machine-issued identifier, a 4px status stripe because the row is a departure-board listing, EN/PL alternation because of who drives into this yard, and a five-second green takeover because the one thing that matters happens once per truck. The weather readout is the kind of detail that only appears when someone has actually stood in front of the thing. Nothing here reads as a dashboard template.

The failures are not failures of specificity. They are failures of follow-through: the project wrote itself four named rules for this surface, and the surface breaks three of them.

- **Distance Floor Rule** (nothing below 14.1:1) — the list now obeys it, 14.13–17.99:1 measured. The call flash does not: the plate is 2.22:1.
- **Plate Leads Rule** (the plate is first and largest in its container) — broken by joining the plate to the carrier inside one marquee.
- **One Loud Thing Rule** (nothing competes with the call flash) — the connection banner pulses and pings, and the parking warning blinks.
- **Plate Is Never Tinted Rule** — obeyed, with the measurement written into the code.

**Deterministic scan** — 2 findings, both `side-tab` warnings on `border-l-4` at `src/app/display/page.tsx:530` and `:533`, severity warning, category slop. Both are false positives on this surface: DESIGN.md licenses them explicitly ("The driver board's rows carry a 4px status stripe on their leading edge. This is the one place a heavy directional border is correct"). They remain unsuppressed. The detector found nothing the review missed.

**Visual overlays** — not available. The Browser pane would not composite frames, so there is no screenshot and no injected overlay; no user-visible overlay exists in the browser. Evidence is direct measurement inside the page instead: computed colors repainted onto a 1×1 canvas and converted to sRGB before the contrast math (Tailwind v4 emits `oklab()`, which an RGB regex reads as nonsense), plus geometry from `getBoundingClientRect`.

## Overall Impression

The list is in good shape and the engineering underneath it is better than the design on top of it. Connection health is observable, self-healing and cheap; the queue rows are legible at 14–18:1; the plate is correctly untinted.

Then the moment the board exists for arrives, and it falls apart: a 60px white plate on mid-green, 2.22:1. Every other number on this surface sits between 10:1 and 21:1. The single frame a driver has been waiting for is the only frame they cannot read.

The biggest opportunity is not a contrast token. It was that the board seemed to waste half its panel — withdrawn on the operator's report that the image fills the glass. What remains is type sized for a screen read at arm's length on a screen read from a cab.

## What's Working

- **Colour genuinely is status.** Row tint, leading stripe and right-hand label encode the same state three ways, so the information survives distance and colour-blindness alike. Nothing on this board is coloured for mood.
- **The connection algorithm is observable and self-healing.** A real `event: ping` rather than an invisible SSE comment, a revision the client acknowledges, a soft reconnect when the stream is open but stale, a 90s hard reload behind that, and a build id so a board that has sat for weeks notices a deployment. The right failure modes, in the right order.
- **The plate is untinted, and the code says why.** The comment at line 536 records that tinting by status once cost 6.04:1 against 17.85:1. A decision with its measurement attached is worth more than the decision.

## Priority Issues

### [P0] The call flash sets the plate at 2.22:1

**Why it matters.** This is the board's one authored moment and the only frame aimed at the driver it concerns. White `#ffffff` on `green-500 #00c950` measures 2.22:1 — below the 3:1 floor for large text, and one sixth of the 14.1:1 floor this project wrote for this exact surface. At the gradient's left edge (`green-600`) it is 3.22:1. The supporting line (`green-100` on `green-500`) is 2.02:1 and "PROCEED NOW!" is 2.22:1. The only readable element in the flash is the dock badge at 21:1 — so the hierarchy is inverted: the driver can read the dock number but not whether the truck being called is theirs.

**Fix.** Keep the green; it is the product's one loud thing and it should stay loud. Flip the plate to black on the green (9.47:1), or set it white on a black panel inside the green (21:1), which also restores plate-largest, dock-second. Same treatment for the two supporting lines.

**Suggested command:** `/impeccable polish`

### [P0] The plate shares a scrolling line with the carrier

**Why it matters.** Line 549 joins truck plate, trailer plate and carrier into one string with ` | ` and marquees the result whenever it exceeds 12 characters on an active row — which is nearly always. Measured live: `AB 1234 | TR 5678 | Kreiss` scrolling on an 8s loop. A driver glancing up gets `| Kreiss  AB 12`. The one question this board answers is "is that me", and for most of every 8 seconds it cannot be answered. This breaks the Plate Leads Rule two lines above the comment that correctly defends the plate's colour.

**Fix.** Pin the plate; let only the overflow scroll. Better: drop the carrier from the board. A driver knows who they drive for — the carrier name is dispatcher information that followed the data model onto a public sign. The trailer plate can stay; it is how a driver with a swapped trailer identifies themselves.

**Suggested command:** `/impeccable distill`

### ~~[P1] Just under half the panel goes unused~~ — WITHDRAWN

**Why it matters.** Measured: board 576×224 inside a 720×480 viewport — 144px of width and 256px of height are black. The panel's current HDMI mode is 720×480 and it advertises 1920×1080 as preferred. DESIGN.md justifies the fixed size as "a specific piece of hardware bolted to a wall", but the hardware is not 576×224; that number is the page. Every legibility problem on this board — 12px status labels, a 6px dot, a marqueeing plate — is partly a symptom of a canvas smaller than its screen.

**Fix.** Let the board fill its viewport and scale type with it rather than pinning a pixel box. `--force-device-scale-factor=1.25` in the kiosk launcher buys 25% without touching code, but it is a workaround for a layout that should measure its own screen.

**Withdrawn after review.** The framebuffer measurement stands — 576×224 drawn inside a 720×480 output — but the operator confirms the image fills the physical panel correctly, and the glass is the authority on what a driver sees, not the framebuffer. Consequence for the rest of this report: the 12px status labels are not a symptom of an undersized canvas, they are simply small type, so [P2] stands on its own merits.

**Suggested command:** none

### [P1] Connection state contradicts itself, and the message is aimed at nobody

**Why it matters.** The footer dot turns red above 15s (line 630); the banner appears above 35s (`STALE_THRESHOLD_SEC`). For twenty seconds the board says "broken" in one corner and "fine" everywhere else. When the banner does appear it reads `⚠ Connection Lost — Reconnecting...` with `Auto-reload in 47s`: English only, on a board that otherwise rotates English and Polish every seven seconds; a `⚠` glyph used as an icon, which the project's own Don'ts forbid in favour of lucide; `animate-pulse` plus `animate-ping`, competing with the call flash the One Loud Thing Rule exists to protect; and a countdown a driver can neither act on nor care about.

**Fix.** One threshold, taken from `display-freshness.ts` where the tolerances already live. Localise the string. Use `TriangleAlert`, already imported on line 5. Drop the countdown — it is technician information. Make it a still strip, not a pulse.

**Suggested command:** `/impeccable clarify`

### [P2] Status labels are 12px on a board read from a cab

**Why it matters.** `LOADING`, `AT DOCK`, `AT SCALES` and `WEIGHING` are `text-xs`, measured at 12px. `DOCK` and `SCALES` on a called truck are `text-xl`, 20px. Same column, same job, 1.7× apart, and the size is decided by status rather than by importance. The 12px labels are smaller than the 14px column header that describes them, and at thirty metres contrast stops helping: 8.95:1 on 12px type is unreadable for the same reason 3:1 on 60px type is.

**Fix.** One size for the status column, no smaller than the column header. If the called state needs to shout, let the badge do it — it already blinks.

**Suggested command:** `/impeccable typeset`

## Persona Red Flags

**Jordan (first time at this yard).** Arrives to find three rows and no indication there are more; the two waiting trucks are on a second page that appears 10 seconds later, and nothing says "1 of 2" in words — only two 6px dots in a corner. Reads `DOCK / STATUS`, sees `DOCK 1`, and cannot tell whether that means "go to dock 1" or "you are at dock 1"; the label for the called state is the same word as the column header. Waits for a language they read, which arrives on a 7-second cycle out of step with the 10-second page cycle, so the combination they need can take 70 seconds to come round.

**Sam (functionally low vision — which at thirty metres is everyone).** The flash plate at 2.22:1 does not resolve against the green at all. Status labels at 12px are below the angular resolution the scene demands. Dock badges, which carry the actionable fact, are the lowest-contrast readable elements in the list at 5.25–6.52:1. The 6px connection dot is imperceptible, which is defensible only because a driver does not need it. `prefers-reduced-motion` is handled properly and the marquee degrades to an ellipsis — genuinely good, and irrelevant on a kiosk that never sets it.

**Riley (edge cases).** Zero trucks: clean, white at 21:1, correct. A truck with no plate: falls through to trailer, then carrier, then `UNKNOWN` — handled. Twenty trucks: pagination is unbounded, so a driver at position 18 waits sixty seconds per lap with no way to learn their position. A CALLED truck with no assigned dock falls to the `WAITING` branch and reads "WAITING" while the dispatcher believes it was called — the one case where the board actively lies. Carrier `Raben Transport Polska Sp z o o` marquees the plate off-screen for most of its loop. The parking warning fires 2 seconds after load and covers the top 48px, so the board's first impression on every reload is a red banner over its own header.

## Minor Observations

- `md:` variants never fire on this board: `text-base md:text-lg` (line 498) and `text-2xl md:text-4xl` (line 626) sit on a surface pinned to 576px, where `md` is 768px. Dead code implying responsiveness on the one surface DESIGN.md forbids to be responsive.
- The 6px connection dot carries `title="Connection status"` — a hover tooltip on a screen with no cursor. The same fact already lives in `/settings/displays`, where someone can act on it.
- Weather is a live third-party fetch (`api.open-meteo.com`) — the board's only internet dependency, on a kiosk that otherwise needs nothing but the LAN. It fails silently and invisibly, which is the right failure, but the element earns its place by departure-board convention rather than by being queue information.
- Pagination and language rotate on independent 10s and 7s timers with no relationship, so the pairing a given driver needs recurs on a 70-second beat.
- The parking warning's first run is deferred 2s after load specifically so the first paint is not a red banner — and then paints one 2 seconds later, on a board that reloads whenever a deploy lands.

## Questions to Consider

- If the board answers exactly one question — "is it me, and where do I go" — what is the carrier name doing on it?
- Why does the board paginate rather than shrink to fit? A driver who cannot see their row cannot tell whether they are fourth or fourteenth, and that is the second question they have.
- The panel prefers 1920×1080. What would this board look like if it were designed for the glass it is actually bolted to, rather than for 576×224?
- The flash is the only moment that matters and the only moment nobody measured. What else in this product has never been looked at during the five seconds it exists?

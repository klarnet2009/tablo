---
name: Tablo
description: Truck queue and dock management for a warehouse yard, with a public board for drivers
colors:
  yard-night: "#0f172a"
  yard-surface: "#1e293b"
  yard-control: "#334155"
  yard-edge: "#475569"
  signal-blue: "#3b82f6"
  signal-blue-light: "#60a5fa"
  signal-cyan: "#06b6d4"
  board-black: "#000000"
  board-clock: "#eab308"
  proceed-green: "#16a34a"
  brand-green: "#7CBD6E"
  refuse-red: "#dc2626"
  text-primary: "#f8fafc"
  text-label: "#cbd5e1"
  text-secondary: "#94a3b8"
typography:
  display:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "3.75rem"
    fontWeight: 900
    letterSpacing: "0.05em"
  headline:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.25
  title:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
  body:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    letterSpacing: "0.05em"
  plate:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "1.125rem"
    fontWeight: 700
    letterSpacing: "0.05em"
rounded:
  sm: "0.25rem"
  md: "0.5rem"
  lg: "0.75rem"
  sheet: "1rem"
  pill: "9999px"
spacing:
  xs: "0.5rem"
  sm: "0.75rem"
  md: "1rem"
  lg: "1.25rem"
  xl: "1.5rem"
  tap: "2.75rem"
components:
  button-primary:
    backgroundColor: "{colors.signal-blue}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "0.625rem 1.5rem"
  button-secondary:
    backgroundColor: "{colors.yard-control}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "0.625rem 1.5rem"
  button-destructive:
    backgroundColor: "{colors.refuse-red}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "0.5rem 0.75rem"
  input:
    backgroundColor: "{colors.yard-control}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "0.625rem 0.75rem"
  card:
    backgroundColor: "{colors.yard-surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.lg}"
    padding: "1.25rem"
  chip-status:
    backgroundColor: "{colors.yard-control}"
    textColor: "{colors.text-label}"
    rounded: "{rounded.pill}"
    padding: "0.25rem 0.625rem"
  board-row:
    backgroundColor: "{colors.board-black}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "0.25rem 0.5rem"
---

# Design System: Tablo

## Overview

**Creative North Star: "The Night Shift Yard"**

Tablo is read in two places that could not be less alike, and the system exists to
serve both without pretending they are the same. Inside, a dispatcher works a dark
console at arm's length, scanning a board of trucks and docks under warehouse
lighting, often on a phone with gloves on. Outside, a driver sitting in a cab
across the yard looks up at a small illuminated panel and needs exactly one fact:
whether it is their turn, and which dock. The console is dense, quiet and
information-first. The panel is loud, sparse and readable at thirty metres. Same
palette, opposite volume.

Depth comes from tonal layering, not shadow: one near-black ground with
translucent surfaces stacked on it. Colour is functional almost everywhere — a hue
on this system means a status, not a mood — which is what lets the single green
flash on the driver board carry so much weight. Nothing else in the product is
allowed to shout.

The plate number is the product's proper noun. It is always monospace, always the
largest thing in its container, and it is the one place where type is doing work
rather than decoration.

**Key Characteristics:**
- Dark-first by use scene, not by fashion: a warehouse at night and a backlit yard panel
- Colour is status, not decoration
- Depth by translucency over one ground; shadows only for things that float
- Monospace for identifiers, sans for everything a human wrote
- One authored motion moment, and it belongs to the driver

## Colors

A cold slate ground with a single warm-free accent, plus a ten-hue status
vocabulary that exists to be decoded at a glance rather than admired.

### Primary
- **Signal Blue** (`{colors.signal-blue}`): interactive intent. Primary buttons, the
  focus ring on every control, active navigation. Paired with **Signal Blue Light**
  (`{colors.signal-blue-light}`) for links and text-level accents, which is the
  contrast-safe form on dark surfaces (5.75:1).
- **Signal Cyan** (`{colors.signal-cyan}`): appears only as the second stop of the
  primary button gradient and the temperature readout on the board. It is never a
  standalone accent.

### Secondary
- **Proceed Green** (`{colors.proceed-green}`): the call flash and the "go" state.
  This is the loudest colour in the product and it is spent on exactly one moment.
- **Brand Green** (`{colors.brand-green}`): the company logo chip on the driver
  board. Fixed by the logo asset; not part of the interface palette.

### Tertiary
- **Board Clock** (`{colors.board-clock}`): the time on the driver board and the
  weighbridge badge. High-luminance yellow, chosen to survive a black background at
  distance (10.95:1).
- **Refuse Red** (`{colors.refuse-red}`): destructive actions and the parking
  warning banner. Never used for a merely-negative status.

### Neutral
- **Yard Night** (`{colors.yard-night}`): the application ground.
- **Yard Surface** (`{colors.yard-surface}`): cards and panels, usually at 50%
  opacity over the ground so the layering reads as depth.
- **Yard Control** (`{colors.yard-control}`): inputs, secondary buttons, chips.
- **Yard Edge** (`{colors.yard-edge}`): control borders.
- **Text Primary / Label / Secondary** (`{colors.text-primary}`,
  `{colors.text-label}`, `{colors.text-secondary}`): headings and values, form
  labels, supporting text. All three clear WCAG AA on both surfaces.
- **Board Black** (`{colors.board-black}`): the driver board only. The console
  never uses pure black; the board never uses anything else.

### Named Rules

**The Status Hue Rule.** A status colour is declared once, in
`src/lib/status-machine.ts`, as a chip pair (`accent-300` on `accent-500/15`). No
component re-derives it and no screen invents a hue for a state. Adding a status
means adding a row there, not styling a badge.

**The One Loud Thing Rule.** Proceed Green at full strength appears in exactly one
place: the call flash on the driver board. If a second element on any screen is
competing with it for attention, the second element is wrong.

**The Contrast Floor Rule.** Text is never set below `{colors.text-secondary}` on
any surface in this product. Slate-500 measures 3.07:1 on a card and fails AA; it
is permitted only for non-text decoration.

## Typography

**Display / Plate Font:** Geist Mono (with `ui-monospace`, `monospace`)
**Body Font:** Geist (with `system-ui`, `sans-serif`)

**Character:** Geist is neutral to the point of being invisible, which is what the
console wants — nothing between the dispatcher and the data. Geist Mono does the
opposite job: it makes a licence plate look like a licence plate, with even
character widths that survive a marquee scroll and a glance from a cab.

### Hierarchy
- **Display** (900, 3.75rem, mono): the plate in the driver board's call flash. The
  single largest element in the product.
- **Headline** (700, 1.5rem): page titles.
- **Title** (600, 1.125rem): card and section headings, dialog titles.
- **Body** (400, 0.875rem): values, descriptions, table cells.
- **Label** (500, 0.75rem, +0.05em, often uppercase): form labels, column headers,
  status chips.
- **Plate** (700, 1.125rem, mono, +0.05em): the truck plate everywhere in the
  console.

### Named Rules

**The Monospace Is For Machines Rule.** Monospace marks an identifier a machine
issued: plates, order references, DNs, hashes. It is never used to make prose look
technical.

**The Plate Leads Rule.** Wherever a visit appears, its plate is the first and
largest thing in the container. Carrier, dock and time are support.

## Layout

The console is a single-column stack of cards on phones and widens into task-shaped
grids: five status columns on the queue board at `xl`, three-up cards on the docks
screen at `lg`, a 2/1 split on the dashboard. Container padding steps from
`{spacing.md}` on phones to `{spacing.xl}` from `md` up; card padding is
`{spacing.lg}`; the rhythm inside a card is `{spacing.xs}` between related lines
and `{spacing.md}` between groups.

Navigation is side rail from `md` up and a fixed bottom bar below it, with
`env(safe-area-inset-bottom)` respected. Dialogs are centred panels on desktop and
bottom sheets on phones; the same component renders both.

The driver board is the exception and is deliberately not responsive: a fixed
576×224 surface, because it is a specific piece of hardware bolted to a wall, not a
viewport.

### Named Rules

**The Gloved Thumb Rule.** Anything tapped on a phone gets a 44px minimum box
(`{spacing.tap}`). Controls that only exist on the admin desktop screens may drop
to 24px, and nothing goes below that.

## Elevation & Depth

Flat by default, with depth carried by translucency rather than shadow. A card is
`{colors.yard-surface}` at 50% over `{colors.yard-night}` with a 1px border at 50%
opacity — the layering is what reads as raised, not a drop shadow.

Shadows are reserved for surfaces that genuinely float above the page: the login
card and dialog panels (`shadow-2xl`), and the dock-assignment buttons on hover
(`shadow-xl`). A shadow anywhere else means the element is pretending.

### Named Rules

**The Tonal Depth Rule.** To make something look higher, raise its opacity or its
border, not its shadow.

## Shapes

One radius family, stepped by container size: `{rounded.sm}` for chips and board
rows, `{rounded.md}` for controls and buttons, `{rounded.lg}` for cards and panels,
`{rounded.sheet}` for the top corners of a mobile bottom sheet, and
`{rounded.pill}` for status chips and avatars. Borders are 1px and low-contrast;
they separate, they do not decorate.

The driver board's rows carry a 4px status stripe on their leading edge. This is
the one place a heavy directional border is correct: the rows are a departure-board
listing read at distance, where the stripe is a status cue rather than an ornament.

## Components

### Buttons
- **Shape:** gently rounded (`{rounded.md}`)
- **Primary:** Signal Blue, white text, `0.625rem 1.5rem`. The gradient variant
  (blue → cyan) is reserved for the single committing action on a screen: sign in,
  save changes, register truck.
- **Hover / Focus:** background steps one stop lighter; focus always shows a 2px
  Signal Blue ring.
- **Secondary:** Yard Control background, white text, same shape.
- **Destructive:** Refuse Red, used for clear and delete only.
- **Icon-only:** a square tap box (44px on phone surfaces, 24px on admin desktop),
  always with an `aria-label`.

### Chips
- **Style:** status hue at 15% as background, the 300-step of the same hue as text,
  fully rounded, label type.
- **State:** one chip per visit status and one per priority, both taken from
  `status-machine.ts`.

### Cards / Containers
- **Corner Style:** `{rounded.lg}`
- **Background:** Yard Surface at 50% over the ground
- **Shadow Strategy:** none at rest; see Elevation
- **Border:** 1px Yard Control at 50%
- **Internal Padding:** `{spacing.lg}`

### Inputs / Fields
- **Style:** Yard Control at 50% with a 1px Yard Edge border, `{rounded.md}`
- **Focus:** border goes transparent and a 2px Signal Blue ring takes over
- **Label:** always present, always associated via `htmlFor` — the `Field`
  component generates the id so it cannot be skipped
- **Error:** stated above the form in a red-tinted panel with `role="alert"`

### Navigation
- Side rail from `md`: label plus icon, active item in Signal Blue on a 20% blue
  wash. Bottom bar below `md`: five equal targets, icon over label, active in
  Signal Blue Light.

### Driver Board (signature)
The product's one public surface. Black ground, a header carrying the logo chip,
clock and temperature, then up to three rows paginating every ten seconds. A row is
a plate in large mono with a status stripe, and a dock number or weighbridge icon
on the right. When a truck is called the whole panel is taken over for five seconds
by Proceed Green with the plate at display size and the dock number pulsing at 2 Hz.
Language alternates between English and Polish on a seven-second cycle; a `?lang=`
parameter pins it.

## Do's and Don'ts

### Do:
- **Do** take status colour from `src/lib/status-machine.ts`, and add new statuses there.
- **Do** pair every `focus:outline-none` with `focus:ring-2` — the whole product does this today.
- **Do** set identifiers in Geist Mono and human prose in Geist.
- **Do** give every control a 44px tap box on any screen a phone reaches.
- **Do** keep the driver board to one idea per glance: who is next, and where they go.

### Don't:
- **Don't** set text in slate-500 or darker; it fails AA on every surface here (3.07:1 on a card).
- **Don't** add a drop shadow to convey hierarchy — raise the tonal layer instead.
- **Don't** use a unicode glyph or emoji as an icon; lucide-react is the icon system.
- **Don't** flash anything faster than 3 Hz, and give every animation a `prefers-reduced-motion` alternative that keeps the information and drops the movement.
- **Don't** let a second element compete with the call flash for attention.
- **Don't** make the driver board responsive; it is a fixed 576×224 panel on a wall.

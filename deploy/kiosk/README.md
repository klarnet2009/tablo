# Display board on a Raspberry Pi

The board at `/display` is a fixed 576×224 surface that has to stay lit for months
without anyone touching it. This directory holds the pieces that make a Pi do that.

## Which runtime

**Not Electron.** Electron ships its own Chromium *plus* a Node runtime — it is
strictly heavier than the browser already installed on the Pi, harder to update,
and it would render exactly the same page. There is nothing to gain.

Rough resident memory for the same board, measured on Pi-class hardware by others
(treat as orders of magnitude, not as measurements from this yard):

| Runtime | RAM | Needs a desktop | Code to maintain |
|---|---|---|---|
| `cog` (WPE WebKit, DRM/KMS) | ~80–120 MB | no | none |
| Chromium `--kiosk` | ~150–250 MB | yes (X/Wayland) | none |
| Electron | ~200–300 MB | yes | a wrapper app |
| Native framebuffer client | ~15–30 MB | no | a second implementation of the board |

`cog` is the default here: it is the runtime built for embedded panels, it draws
straight to the display controller with no window manager, and the page needs no
changes. Chromium is kept as a fallback because most Raspberry Pi OS desktop
images already have it.

## Install

```bash
sudo apt install cog          # or: sudo apt install chromium-browser
sudo useradd --system --create-home --groups video,render,input tablo
sudo install -m 755 deploy/kiosk/tablo-kiosk.sh /usr/local/bin/tablo-kiosk.sh
sudo install -m 644 deploy/kiosk/tablo-kiosk.default /etc/default/tablo-kiosk
sudo install -m 644 deploy/kiosk/tablo-kiosk.service /etc/systemd/system/
sudo nano /etc/default/tablo-kiosk        # set TABLO_URL and DEVICE_ID
sudo systemctl enable --now tablo-kiosk
```

Watch it come up:

```bash
journalctl -u tablo-kiosk -f
```

## DEVICE_ID matters

Set it. The board identifies itself to *Settings → Displays* by an id it otherwise
generates and keeps in `localStorage`. A kiosk profile wipe, an incognito launch or
a reflashed SD card loses that, and the next boot registers a **new** screen —
leaving the back office listing screens that no longer exist. `DEVICE_ID` puts the
id in the URL instead, so it survives anything.

Give it the name the yard uses: `yard-gate-1`, `dock-side`, `weighbridge`.

## What the flags are for

Both runtimes are configured for an unattended screen:

- **No blanking.** `xset s off -dpms` under Chromium; `cog` on DRM never blanks.
- **No background throttling.** `--disable-background-timer-throttling` and
  `--disable-renderer-backgrounding` on Chromium. Without these the browser slows
  timers on a window it thinks nobody is watching, which on a kiosk is always.
- **A persistent profile.** `--user-data-dir` on purpose, so the board keeps its
  identity if `DEVICE_ID` was not set.
- **No dialogs.** Crash bubbles, translation bars and update prompts have no one to
  dismiss them.
- **Restart forever.** `Restart=always` with a 5s backoff: the screen recovers from
  a crash, a server restart or a power cut without a visit.

## What the board itself does about a bad connection

Independent of the kiosk setup, the page handles a lost server on its own:

| After | What happens |
|---|---|
| 35 s without a ping or payload | red "connection lost" strip with a countdown |
| 20 s of the server reporting newer data than the board has | soft reconnect of the SSE stream |
| 90 s of silence | full page reload |

It also reconnects on `visibilitychange` and on the browser reporting the network
back. See `src/app/display/page.tsx` and `src/lib/display-freshness.ts`.

## Going lighter than a browser

If the Pi is old enough that even WPE is too much, the board is simple enough to
render natively: a text list, a clock, a dock number, a full-screen green flash. A
framebuffer client in Python or Rust reading the same `/api/display/stream` SSE
feed would fit in tens of megabytes.

The cost is a second implementation of the board — layout, both languages, the
marquee, the call flash — to keep in step with the web one. Worth it only if the
hardware really cannot run WPE. Try `cog` first and measure.

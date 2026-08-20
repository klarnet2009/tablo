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

On the Pi, with the repository checked out (or just this directory copied over):

```bash
cd deploy/kiosk
sudo TABLO_URL=http://<tablo-host>:3000/display DEVICE_ID=yard-gate-1 ./install.sh
```

That installs the runtime, creates the service account, writes the config, enables
the board at boot and schedules the weekly restart. It is idempotent: re-run it
after pulling a change, and it will leave `/etc/default/tablo-kiosk` as you edited
it.

| Variable | Default | What it does |
|---|---|---|
| `TABLO_URL` | *required* | Full URL of the board. No default: a wrong one is a silent black screen |
| `DEVICE_ID` | the Pi's hostname | Identity in *Settings → Displays* |
| `KIOSK_RUNTIME` | `cog` | `cog` or `chromium` |
| `KIOSK_LANG` | empty | `en` / `pl` to stop the language alternating |
| `RESTART_SCHEDULE` | `Sun 04:00` | systemd `OnCalendar` for the weekly restart |
| `RESTART_MODE` | `service` | `service` restarts the board; `reboot` reboots the Pi |

Watch it come up:

```bash
journalctl -u tablo-kiosk -f
systemctl list-timers tablo-kiosk-restart.timer
```

Change something later:

```bash
sudo nano /etc/default/tablo-kiosk
sudo systemctl restart tablo-kiosk
```

## The weekly restart

A screen that runs for months accumulates renderer memory. The installer adds
`tablo-kiosk-restart.timer`, which by default restarts the **board process** every
Sunday at 04:00 — not the whole Pi. That clears the renderer without risking a
machine that does not come back up, and 04:00 keeps it out of a shift.

`Persistent=true` catches up if the Pi was off at the scheduled moment, and a 5
minute random delay stops a wall of screens restarting in lockstep.

For a full reboot instead — worth it if the Pi has other reasons to drift, like a
flaky USB or a clock that needs re-syncing:

```bash
sudo RESTART_MODE=reboot TABLO_URL=... ./install.sh
```

## Optional OS tweaks

Not done by the installer, because they change a machine beyond the board. Apply
deliberately:

```bash
# Console blanking off (matters for cog on DRM, which has no X to tell to stop).
sudo sed -i 's/$/ consoleblank=0/' /boot/firmware/cmdline.txt   # single line, reboot after

# A display Pi usually needs neither.
sudo systemctl disable --now bluetooth avahi-daemon

# Quiet boot: no rainbow splash, no kernel log on the panel.
# Add "disable_splash=1" to /boot/firmware/config.txt and "quiet logo.nologo" to cmdline.txt
```

Check `dtoverlay=vc4-kms-v3d` is present in `/boot/firmware/config.txt` — `cog
--platform=drm` needs the KMS driver. Recent Raspberry Pi OS images have it by
default.

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

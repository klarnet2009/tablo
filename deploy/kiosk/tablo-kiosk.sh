#!/bin/sh
# Launch the Tablo display board full-screen on a Raspberry Pi.
#
# Configure via /etc/default/tablo-kiosk (see tablo-kiosk.default), then run this
# through the systemd unit next to it. Two runtimes are supported:
#
#   cog       WPE WebKit, built for embedded panels. Renders straight to DRM/KMS
#             with no desktop, no window manager and no X. The light option.
#   chromium  Falls back to the browser already on the Pi. Heavier, but it is what
#             most Raspberry Pi OS images ship with a desktop.
#
# Pick with KIOSK_RUNTIME. Both are configured for a screen that must stay awake
# and keep its timers running for months without anyone touching it.
set -eu

: "${TABLO_URL:=http://localhost:3000/display}"
: "${DEVICE_ID:=}"
: "${KIOSK_RUNTIME:=cog}"
: "${KIOSK_LANG:=}"

url="$TABLO_URL"

# Pin the identity in the URL. Without it the board invents a new id whenever the
# browser profile is wiped, and the back office fills up with dead screens.
if [ -n "$DEVICE_ID" ]; then
    case "$url" in
        *\?*) url="$url&deviceId=$DEVICE_ID" ;;
        *)    url="$url?deviceId=$DEVICE_ID" ;;
    esac
fi

# Lock the board to one language instead of rotating; leave empty to rotate.
if [ -n "$KIOSK_LANG" ]; then
    case "$url" in
        *\?*) url="$url&lang=$KIOSK_LANG" ;;
        *)    url="$url?lang=$KIOSK_LANG" ;;
    esac
fi

echo "Tablo kiosk: runtime=$KIOSK_RUNTIME url=$url"

case "$KIOSK_RUNTIME" in
cog)
    # No X, no compositor: WPE draws directly on the display controller.
    exec cog \
        --platform=drm \
        --enable-media=false \
        --disable-accelerated-2d-canvas \
        "$url"
    ;;

chromium)
    # Under a Wayland session the compositor may not have its socket yet when the
    # user's systemd units start. Wait for it rather than failing and leaving
    # Restart= to paper over the race.
    if [ -n "${WAYLAND_DISPLAY:-}" ] && [ -n "${XDG_RUNTIME_DIR:-}" ]; then
        i=0
        while [ ! -S "$XDG_RUNTIME_DIR/$WAYLAND_DISPLAY" ] && [ "$i" -lt 30 ]; do
            sleep 1
            i=$((i + 1))
        done
    fi

    # Resolve whichever name this image uses.
    for candidate in chromium-browser chromium; do
        if command -v "$candidate" >/dev/null 2>&1; then
            BROWSER="$candidate"
            break
        fi
    done
    : "${BROWSER:?chromium not found; install chromium-browser or set KIOSK_RUNTIME=cog}"

    # Keep the screen and the timers alive.
    if command -v xset >/dev/null 2>&1; then
        xset s off || true
        xset -dpms || true
        xset s noblank || true
    fi
    if command -v unclutter >/dev/null 2>&1; then
        unclutter -idle 0 -root &
    fi

    # Chromium remembers being killed and offers to restore tabs. On a screen with
    # no keyboard that dialog just sits there.
    PREFS="${CHROMIUM_PROFILE:-$HOME/.config/chromium}/Default/Preferences"
    if [ -f "$PREFS" ]; then
        sed -i 's/"exit_type":"[^"]*"/"exit_type":"Normal"/; s/"exited_cleanly":false/"exited_cleanly":true/' "$PREFS" || true
    fi

    # A persistent profile directory on purpose: an incognito or throwaway profile
    # loses localStorage, and with it the board's identity.
    exec "$BROWSER" \
        --kiosk \
        --user-data-dir="${CHROMIUM_PROFILE:-/var/lib/tablo-kiosk/profile}" \
        --window-position=0,0 \
        --noerrdialogs \
        --disable-infobars \
        --disable-session-crashed-bubble \
        --disable-features=Translate,TranslateUI,AutofillServerCommunication \
        --disable-pinch \
        --overscroll-history-navigation=0 \
        --password-store=basic \
        --check-for-update-interval=31536000 \
        --disable-dev-shm-usage \
        --disable-background-timer-throttling \
        --disable-renderer-backgrounding \
        --disable-backgrounding-occluded-windows \
        --autoplay-policy=no-user-gesture-required \
        "$url"
    ;;

*)
    echo "Unknown KIOSK_RUNTIME: $KIOSK_RUNTIME (expected cog or chromium)" >&2
    exit 1
    ;;
esac

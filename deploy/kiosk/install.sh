#!/bin/sh
# Set up the Tablo display board on a Raspberry Pi: runtime, service, weekly
# restart. Idempotent — safe to re-run after a change or an upgrade.
#
#   sudo TABLO_URL=http://10.21.10.50:3000/display ./install.sh
#
# Optional:
#   DEVICE_ID=yard-gate-1      identity in Settings -> Displays (default: hostname)
#   KIOSK_RUNTIME=cog          cog (default) or chromium
#   KIOSK_LANG=en              lock the board to one language; empty = alternate
#   RESTART_SCHEDULE='Sun 04:00'   systemd OnCalendar for the weekly restart
#   RESTART_MODE=service       service (default) or reboot
set -eu

SRC_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

: "${DEVICE_ID:=$(hostname)}"
: "${KIOSK_RUNTIME:=cog}"
: "${KIOSK_LANG:=}"
: "${RESTART_SCHEDULE:=Sun 04:00}"
: "${RESTART_MODE:=service}"

die() { echo "ERROR: $*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || die "run with sudo"
command -v systemctl >/dev/null 2>&1 || die "systemd not found; this script targets Raspberry Pi OS"

# The board is useless pointed at nothing, and a wrong URL is a silent black screen,
# so there is no default here.
[ -n "${TABLO_URL:-}" ] || die "TABLO_URL is required, e.g. TABLO_URL=http://10.21.10.50:3000/display"
case "$TABLO_URL" in
    http://*|https://*) ;;
    *) die "TABLO_URL must start with http:// or https://" ;;
esac

case "$RESTART_MODE" in
    service|reboot) ;;
    *) die "RESTART_MODE must be service or reboot" ;;
esac

echo "==> Runtime: $KIOSK_RUNTIME"
case "$KIOSK_RUNTIME" in
cog)
    if ! command -v cog >/dev/null 2>&1; then
        apt-get update
        # cog is WPE WebKit's launcher; the backend package name differs per release.
        apt-get install -y cog || die "cog is not available in this release; re-run with KIOSK_RUNTIME=chromium"
    fi
    ;;
chromium)
    if ! command -v chromium-browser >/dev/null 2>&1 && ! command -v chromium >/dev/null 2>&1; then
        apt-get update
        apt-get install -y chromium-browser || apt-get install -y chromium \
            || die "could not install chromium"
    fi
    # Hides the pointer and stops the screen blanking under X.
    apt-get install -y unclutter x11-xserver-utils || true
    ;;
*)
    die "KIOSK_RUNTIME must be cog or chromium"
    ;;
esac

echo "==> Service account"
if ! id tablo >/dev/null 2>&1; then
    useradd --system --create-home --shell /usr/sbin/nologin tablo
fi
# video+render for DRM/KMS, input so a touch panel keeps working.
for g in video render input; do
    getent group "$g" >/dev/null 2>&1 && usermod -aG "$g" tablo
done

echo "==> Files"
install -m 755 "$SRC_DIR/tablo-kiosk.sh" /usr/local/bin/tablo-kiosk.sh
install -m 644 "$SRC_DIR/tablo-kiosk.service" /etc/systemd/system/tablo-kiosk.service

# Config is written once. A re-run must not overwrite what the operator changed.
if [ -f /etc/default/tablo-kiosk ]; then
    echo "    /etc/default/tablo-kiosk exists, leaving it alone"
else
    cat > /etc/default/tablo-kiosk <<ENVFILE
# Written by deploy/kiosk/install.sh. Edit and then:
#   sudo systemctl restart tablo-kiosk
TABLO_URL=$TABLO_URL
DEVICE_ID=$DEVICE_ID
KIOSK_RUNTIME=$KIOSK_RUNTIME
KIOSK_LANG=$KIOSK_LANG
ENVFILE
    chmod 644 /etc/default/tablo-kiosk
fi

echo "==> Weekly restart ($RESTART_MODE, $RESTART_SCHEDULE)"
if [ "$RESTART_MODE" = reboot ]; then
    restart_desc="Weekly reboot for the Tablo display board"
    restart_cmd="/sbin/shutdown -r now"
else
    restart_desc="Weekly restart of the Tablo display board"
    restart_cmd="/bin/systemctl restart tablo-kiosk.service"
fi

cat > /etc/systemd/system/tablo-kiosk-restart.service <<UNIT
[Unit]
Description=$restart_desc

[Service]
Type=oneshot
ExecStart=$restart_cmd
UNIT

cat > /etc/systemd/system/tablo-kiosk-restart.timer <<UNIT
[Unit]
Description=$restart_desc

[Timer]
OnCalendar=$RESTART_SCHEDULE
# Catch up if the Pi was powered off at the scheduled moment.
Persistent=true
# Keeps a wall of screens from restarting in lockstep.
RandomizedDelaySec=5m

[Install]
WantedBy=timers.target
UNIT

echo "==> Enable"
systemctl daemon-reload
systemctl enable --now tablo-kiosk.service
systemctl enable --now tablo-kiosk-restart.timer
systemctl restart tablo-kiosk.service

echo
echo "Done. Board: $TABLO_URL (deviceId=$DEVICE_ID)"
echo
systemctl --no-pager --lines=0 status tablo-kiosk.service || true
echo
echo "Next restart:"
systemctl list-timers --no-pager tablo-kiosk-restart.timer || true
echo
echo "Logs:    journalctl -u tablo-kiosk -f"
echo "Config:  /etc/default/tablo-kiosk"

#!/bin/sh
# Reboot the whole Raspberry Pi once a week, at night. Idempotent.
#
#   sudo ./install-weekly-reboot.sh
#   sudo REBOOT_SCHEDULE='Sun 04:00' ./install-weekly-reboot.sh
#
# Independent of KIOSK_SCOPE: a user-session kiosk cannot reboot the machine from
# its own systemd session, so the reboot always lives in the system manager. After
# a reboot lightdm autologs in and the kiosk starts on its own, so this replaces
# the weekly browser restart rather than adding to it — that timer is disabled here.
set -eu

: "${REBOOT_SCHEDULE:=Sun 04:00}"
: "${KIOSK_USER:=${SUDO_USER:-}}"

[ "$(id -u)" = 0 ] || { echo "ERROR: run with sudo" >&2; exit 1; }
systemd-analyze calendar "$REBOOT_SCHEDULE" >/dev/null 2>&1 \
    || { echo "ERROR: REBOOT_SCHEDULE is not a valid systemd OnCalendar: $REBOOT_SCHEDULE" >&2; exit 1; }

cat > /etc/systemd/system/tablo-weekly-reboot.service <<'UNIT'
[Unit]
Description=Weekly reboot of the Tablo display board

[Service]
Type=oneshot
ExecStart=/bin/systemctl reboot
UNIT

cat > /etc/systemd/system/tablo-weekly-reboot.timer <<UNIT
[Unit]
Description=Weekly reboot of the Tablo display board

[Timer]
OnCalendar=$REBOOT_SCHEDULE
# No Persistent=: a reboot missed because the Pi was off is not worth catching up
# on — the Pi has just booted anyway, and catching up would reboot it mid-shift.
RandomizedDelaySec=5m

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now tablo-weekly-reboot.timer

# The system-scope kiosk's own weekly restart, if that is how it was installed.
systemctl disable --now tablo-kiosk-restart.timer 2>/dev/null || true
# The user-scope kiosk's weekly browser restart.
if [ -n "$KIOSK_USER" ]; then
    uid=$(id -u "$KIOSK_USER")
    sudo -u "$KIOSK_USER" XDG_RUNTIME_DIR="/run/user/$uid" \
        systemctl --user disable --now tablo-kiosk-restart.timer 2>/dev/null || true
fi

echo "==> Weekly reboot: $REBOOT_SCHEDULE"
systemctl list-timers tablo-weekly-reboot.timer --no-pager

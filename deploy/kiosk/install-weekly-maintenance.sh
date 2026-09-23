#!/bin/sh
# Weekly night maintenance for the Tablo display Pi: install updates, then reboot.
# Idempotent — safe to re-run.
#
#   sudo ./install-weekly-maintenance.sh
#   sudo MAINTENANCE_SCHEDULE='Sun 03:30' ./install-weekly-maintenance.sh
#
# One timer does both, in order, so updates never land in the middle of a shift and
# a kernel or Chromium update is always followed by the reboot that applies it.
#
# - Updates come from unattended-upgrades, limited to the release the Pi already
#   runs (bookworm, its security and updates suites, and the Raspberry Pi archive).
#   It never moves the Pi to a new Debian release.
# - The daily apt timer keeps refreshing lists and downloading packages, but is told
#   not to install: installing happens only inside the night window.
# - If the upgrade fails the reboot still happens: a board that reboots on stale
#   packages is better than one that silently stops rebooting.
#
# Independent of KIOSK_SCOPE: a user-session kiosk cannot reboot the machine, so
# this lives in the system manager. After the reboot lightdm autologs in and the
# kiosk starts by itself, so the weekly browser restart is disabled as redundant.
set -eu

: "${MAINTENANCE_SCHEDULE:=Sun 03:30}"
: "${KIOSK_USER:=${SUDO_USER:-}}"

die() { echo "ERROR: $*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || die "run with sudo"
systemd-analyze calendar "$MAINTENANCE_SCHEDULE" >/dev/null 2>&1 \
    || die "MAINTENANCE_SCHEDULE is not a valid systemd OnCalendar: $MAINTENANCE_SCHEDULE"

. /etc/os-release
[ -n "${VERSION_CODENAME:-}" ] || die "cannot read VERSION_CODENAME from /etc/os-release"

echo "==> unattended-upgrades"
command -v unattended-upgrade >/dev/null 2>&1 || {
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y unattended-upgrades
}

cat > /etc/apt/apt.conf.d/52tablo-unattended-upgrades <<CONF
// Written by deploy/kiosk/install-weekly-maintenance.sh.
// Only the release this Pi runs ($VERSION_CODENAME); never a release upgrade.
Unattended-Upgrade::Origins-Pattern {
    "origin=Debian,codename=$VERSION_CODENAME";
    "origin=Debian,codename=$VERSION_CODENAME-updates";
    "origin=Debian,codename=$VERSION_CODENAME-security,label=Debian-Security";
    "origin=Raspberry Pi Foundation,codename=$VERSION_CODENAME";
};
// The maintenance timer reboots right after the upgrade; do not reboot twice.
Unattended-Upgrade::Automatic-Reboot "false";
// The SD card is small. Old kernels and orphaned dependencies are what fill it.
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::MinimalSteps "true";
CONF

# Numbered after 20auto-upgrades so these values win.
cat > /etc/apt/apt.conf.d/52tablo-auto-upgrades <<'CONF'
// Written by deploy/kiosk/install-weekly-maintenance.sh.
// Refresh and pre-download daily, install only in the night window.
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Download-Upgradeable-Packages "1";
APT::Periodic::Unattended-Upgrade "0";
APT::Periodic::AutocleanInterval "7";
CONF

echo "==> Maintenance timer ($MAINTENANCE_SCHEDULE)"
cat > /etc/systemd/system/tablo-weekly-maintenance.service <<'UNIT'
[Unit]
Description=Weekly update and reboot of the Tablo display board
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
# "-" prefix: a failed update must not cancel the reboot.
ExecStartPre=-/usr/bin/apt-get -q update
ExecStartPre=-/usr/bin/unattended-upgrade -v
ExecStart=/bin/systemctl reboot
# A Pi 3 needs a while for a Chromium or kernel update. Killing dpkg halfway leaves
# a broken system, so the limit is generous.
TimeoutStartSec=3h
UNIT

cat > /etc/systemd/system/tablo-weekly-maintenance.timer <<UNIT
[Unit]
Description=Weekly update and reboot of the Tablo display board

[Timer]
OnCalendar=$MAINTENANCE_SCHEDULE
# No Persistent=: a window missed because the Pi was off is not worth catching up
# on — it has just booted, and catching up would update and reboot mid-shift.
RandomizedDelaySec=5m

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now tablo-weekly-maintenance.timer

# Replaced by this timer: an earlier reboot-only timer, the system-scope kiosk's
# weekly restart, and the user-scope kiosk's weekly browser restart.
for t in tablo-weekly-reboot.timer tablo-kiosk-restart.timer; do
    systemctl disable --now "$t" 2>/dev/null || true
done
rm -f /etc/systemd/system/tablo-weekly-reboot.service /etc/systemd/system/tablo-weekly-reboot.timer
if [ -n "$KIOSK_USER" ]; then
    uid=$(id -u "$KIOSK_USER")
    sudo -u "$KIOSK_USER" XDG_RUNTIME_DIR="/run/user/$uid" \
        systemctl --user disable --now tablo-kiosk-restart.timer 2>/dev/null || true
fi
systemctl daemon-reload

echo
systemctl list-timers tablo-weekly-maintenance.timer --no-pager
echo
echo "Check what the next window would install:  sudo unattended-upgrade --dry-run -v"
echo "Last run:                                  journalctl -u tablo-weekly-maintenance -b -1"

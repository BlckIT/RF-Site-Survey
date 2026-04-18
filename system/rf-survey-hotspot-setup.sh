#!/usr/bin/env bash
# rf-survey-hotspot-setup.sh
# Installationsscript för persistent fallback-hotspot (systemd + NetworkManager)
# Skapar NM connection-profil med låg prioritet som fallback.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_NAME="rf-survey-hotspot"
CON_NAME="rf-survey-fallback"
CONFIG_DIR="/opt/rf-survey"
CONFIG_FILE="${CONFIG_DIR}/hotspot-config.json"
DEFAULT_SSID="Buster"
DEFAULT_IFACE="wlan0"

# Kolla att vi kör som root
if [ "$(id -u)" -ne 0 ]; then
  echo "Error: This script must be run as root (sudo)."
  exit 1
fi

# Kolla att NetworkManager finns
if ! command -v nmcli &>/dev/null; then
  echo "Error: nmcli not found. NetworkManager is required."
  exit 1
fi

echo "=== RF Survey Fallback Hotspot Setup ==="

# 1. Skapa config-katalog och default config om den inte finns
mkdir -p "$CONFIG_DIR"
if [ ! -f "$CONFIG_FILE" ]; then
  cat > "$CONFIG_FILE" <<EOF
{
  "ssid": "${DEFAULT_SSID}",
  "password": "",
  "enabled": true
}
EOF
  echo "[OK] Created default config: ${CONFIG_FILE}"
else
  echo "[OK] Config already exists: ${CONFIG_FILE}"
fi

# 2. Läs config
SSID=$(python3 -c "import json; print(json.load(open('${CONFIG_FILE}')).get('ssid', '${DEFAULT_SSID}'))" 2>/dev/null || echo "$DEFAULT_SSID")
PASSWORD=$(python3 -c "import json; print(json.load(open('${CONFIG_FILE}')).get('password', ''))" 2>/dev/null || echo "")

# 3. Skapa/uppdatera NetworkManager connection-profil
CON_EXISTS=$(nmcli -t -f NAME connection show | grep -c "^${CON_NAME}$" || true)

if [ "$CON_EXISTS" -gt 0 ]; then
  echo "[OK] Updating existing connection profile: ${CON_NAME}"
  nmcli connection modify "$CON_NAME" \
    802-11-wireless.ssid "$SSID" \
    connection.autoconnect yes \
    connection.autoconnect-priority -1
else
  echo "[OK] Creating connection profile: ${CON_NAME}"
  ARGS=(
    connection add type wifi ifname "$DEFAULT_IFACE" con-name "$CON_NAME"
    ssid "$SSID" 802-11-wireless.mode ap 802-11-wireless.band bg
    ipv4.method shared ipv6.method disabled
    connection.autoconnect yes connection.autoconnect-priority -1
  )

  if [ -n "$PASSWORD" ] && [ "${#PASSWORD}" -ge 8 ]; then
    ARGS+=(wifi-sec.key-mgmt wpa-psk wifi-sec.psk "$PASSWORD")
  fi

  nmcli "${ARGS[@]}"
fi

# 4. Uppdatera lösenord om det finns
if [ -n "$PASSWORD" ] && [ "${#PASSWORD}" -ge 8 ]; then
  nmcli connection modify "$CON_NAME" wifi-sec.key-mgmt wpa-psk wifi-sec.psk "$PASSWORD"
  echo "[OK] WPA2 password configured"
else
  echo "[OK] Open network (no password)"
fi

# 5. Installera systemd-tjänsten
cp "${SCRIPT_DIR}/${SERVICE_NAME}.service" "/etc/systemd/system/${SERVICE_NAME}.service"
systemctl daemon-reload
systemctl enable "${SERVICE_NAME}.service"
echo "[OK] Systemd service installed and enabled"

echo ""
echo "=== Setup Complete ==="
echo "  SSID:    ${SSID}"
echo "  Config:  ${CONFIG_FILE}"
echo "  Service: ${SERVICE_NAME}.service (enabled, starts at boot)"
echo ""
echo "To start now:  systemctl start ${SERVICE_NAME}"
echo "To check:      systemctl status ${SERVICE_NAME}"
echo "To disable:    systemctl disable ${SERVICE_NAME}"

#!/usr/bin/env bash
# /etc/NetworkManager/dispatcher.d/99-rf-survey-hotspot
# Aktiverar fallback hotspot när ingen WiFi station-connection finns

INTERFACE="$1"
ACTION="$2"
CON_NAME="rf-survey-fallback"
CONFIG="/opt/rf-survey/hotspot-config.json"
LOG_TAG="rf-survey-hotspot"

# Kolla om hotspot är aktiverad i config
if [ -f "$CONFIG" ]; then
  ENABLED=$(python3 -c "import json; print(json.load(open('$CONFIG')).get('enabled', True))" 2>/dev/null || echo "true")
  if [ "$ENABLED" = "False" ] || [ "$ENABLED" = "false" ]; then
    exit 0
  fi
fi

# Bara reagera på wifi-interface events
IFACE_TYPE=$(nmcli -t -f DEVICE,TYPE device | grep "^${INTERFACE}:" | cut -d: -f2)
if [ "$IFACE_TYPE" != "wifi" ] && [ "$ACTION" != "connectivity-change" ]; then
  exit 0
fi

# Kolla om det finns en aktiv WiFi station-connection (inte AP/hotspot)
ACTIVE_STATION=$(nmcli -t -f NAME,TYPE,DEVICE connection show --active | grep ":802-11-wireless:" | grep -v "$CON_NAME" | grep -v "rf-survey-hotspot" | head -1)

# Kolla om fallback hotspot redan är aktiv
HOTSPOT_ACTIVE=$(nmcli -t -f NAME connection show --active | grep -c "^${CON_NAME}$" || true)

case "$ACTION" in
  down|deactivating)
    # WiFi gick ner — kolla om vi behöver fallback
    sleep 2  # Vänta lite så NM hinner reconnecta
    ACTIVE_STATION=$(nmcli -t -f NAME,TYPE,DEVICE connection show --active | grep ":802-11-wireless:" | grep -v "$CON_NAME" | grep -v "rf-survey-hotspot" | head -1)
    if [ -z "$ACTIVE_STATION" ] && [ "$HOTSPOT_ACTIVE" -eq 0 ]; then
      logger -t "$LOG_TAG" "No active WiFi station — activating fallback hotspot"
      nmcli connection up "$CON_NAME" 2>/dev/null || true
    fi
    ;;
  up|connectivity-change)
    # Ny connection kom upp — stäng hotspot om station finns
    if [ -n "$ACTIVE_STATION" ] && [ "$HOTSPOT_ACTIVE" -gt 0 ]; then
      logger -t "$LOG_TAG" "WiFi station active — deactivating fallback hotspot"
      nmcli connection down "$CON_NAME" 2>/dev/null || true
    fi
    # Om ingen station och ingen hotspot — aktivera hotspot
    if [ -z "$ACTIVE_STATION" ] && [ "$HOTSPOT_ACTIVE" -eq 0 ]; then
      logger -t "$LOG_TAG" "No active WiFi station — activating fallback hotspot"
      nmcli connection up "$CON_NAME" 2>/dev/null || true
    fi
    ;;
esac

#!/usr/bin/env bash
# install.sh — One-command installer for RF-Site-Survey
# Usage: sudo ./install.sh
# Or:    curl -sSL https://raw.githubusercontent.com/BlckIT/RF-Site-Survey/dev/install.sh | sudo bash
set -euo pipefail

# Färger
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

INSTALL_DIR="/opt/rf-site-survey"
REPO_URL="https://github.com/BlckIT/RF-Site-Survey.git"
BRANCH="dev"
APP_NAME="rf-site-survey"
SERVICE_USER="${SUDO_USER:-$(whoami)}"

echo -e "${BOLD}╔══════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   RF-Site-Survey Installer            ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════╝${NC}"
echo ""

# --- Kräv root ---
if [ "$(id -u)" -ne 0 ]; then
  echo -e "${RED}This installer must be run as root (sudo).${NC}"
  exit 1
fi

# --- Detektera om vi körs från ett befintligt repo ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
if [ -f "$SCRIPT_DIR/package.json" ] && grep -q "rf-site-survey" "$SCRIPT_DIR/package.json" 2>/dev/null; then
  INSTALL_DIR="$SCRIPT_DIR"
  echo -e "${CYAN}Detected existing installation at $INSTALL_DIR${NC}"
fi

# --- 1. Node.js ---
echo -e "\n${BOLD}[1/8] Checking Node.js...${NC}"
if command -v node &>/dev/null; then
  NODE_VER=$(node -v)
  echo -e "${GREEN}Node.js $NODE_VER found.${NC}"
else
  echo -e "${CYAN}Installing Node.js 22 LTS...${NC}"
  if command -v apt-get &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
  else
    echo -e "${RED}Could not install Node.js automatically. Please install Node.js 22+ manually.${NC}"
    exit 1
  fi
  echo -e "${GREEN}Node.js $(node -v) installed.${NC}"
fi

# --- 2. pm2 ---
echo -e "\n${BOLD}[2/8] Checking pm2...${NC}"
if command -v pm2 &>/dev/null; then
  echo -e "${GREEN}pm2 found.${NC}"
else
  echo -e "${CYAN}Installing pm2 globally...${NC}"
  npm install -g pm2
  echo -e "${GREEN}pm2 installed.${NC}"
fi

# --- 3. Clone or update repo ---
echo -e "\n${BOLD}[3/8] Setting up application...${NC}"
if [ -d "$INSTALL_DIR/.git" ]; then
  echo -e "${CYAN}Updating existing installation...${NC}"
  cd "$INSTALL_DIR"
  # Bevara lokala data
  git stash --include-untracked 2>/dev/null || true
  git pull origin "$BRANCH"
  git stash pop 2>/dev/null || true
else
  if [ "$INSTALL_DIR" != "$SCRIPT_DIR" ] || [ ! -f "$INSTALL_DIR/package.json" ]; then
    echo -e "${CYAN}Cloning repository to $INSTALL_DIR...${NC}"
    git clone -b "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
  fi
  cd "$INSTALL_DIR"
fi

# Säkerställ att data-mappen finns och ägs av rätt användare
mkdir -p "$INSTALL_DIR/data"
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR/data"

echo -e "${GREEN}Application at $INSTALL_DIR${NC}"

# --- 4. Install dependencies + build ---
echo -e "\n${BOLD}[4/8] Installing dependencies and building...${NC}"
# Kör npm som service-användaren (inte root) för att undvika permission-problem
sudo -u "$SERVICE_USER" bash -c "cd $INSTALL_DIR && npm install && npm run build"
echo -e "${GREEN}Build complete.${NC}"

# --- 5. Sudoers ---
echo -e "\n${BOLD}[5/8] Configuring passwordless sudo...${NC}"
SUDOERS_FILE="/etc/sudoers.d/rf-survey"
SUDOERS_CONTENT="$SERVICE_USER ALL=(ALL) NOPASSWD: /usr/bin/nmcli, /usr/sbin/iw, /usr/bin/iperf3"
if [ -f "$SUDOERS_FILE" ]; then
  echo -e "${GREEN}Sudoers rule already exists.${NC}"
else
  echo "$SUDOERS_CONTENT" > "$SUDOERS_FILE"
  chmod 0440 "$SUDOERS_FILE"
  echo -e "${GREEN}Sudoers rule installed for $SERVICE_USER.${NC}"
fi

# --- 6. pm2 service ---
echo -e "\n${BOLD}[6/8] Setting up pm2 service...${NC}"
# Stoppa och ta bort eventuell gammal process
sudo -u "$SERVICE_USER" bash -c "pm2 delete $APP_NAME 2>/dev/null || true"
# Starta med ecosystem config
sudo -u "$SERVICE_USER" bash -c "cd $INSTALL_DIR && pm2 start ecosystem.config.cjs"
sudo -u "$SERVICE_USER" bash -c "pm2 save"
# Auto-start vid boot
env PATH="$PATH" pm2 startup systemd -u "$SERVICE_USER" --hp "/home/$SERVICE_USER" 2>/dev/null || true
echo -e "${GREEN}pm2 service configured.${NC}"

# --- 7. Global CLI ---
echo -e "\n${BOLD}[7/8] Installing rf-survey command...${NC}"
# Skapa symlink direkt i /usr/local/bin (fungerar för alla användare inkl. sudo)
ln -sf "$INSTALL_DIR/bin/rf-survey" /usr/local/bin/rf-survey
chmod +x "$INSTALL_DIR/bin/rf-survey"
echo -e "${GREEN}rf-survey command available globally.${NC}"

# --- 8. Hotspot fallback ---
echo -e "\n${BOLD}[8/8] Setting up fallback hotspot...${NC}"
if [ -f "$INSTALL_DIR/system/rf-survey-hotspot-setup.sh" ]; then
  bash "$INSTALL_DIR/system/rf-survey-hotspot-setup.sh"
  echo -e "${GREEN}Fallback hotspot configured (SSID: Buster).${NC}"
else
  echo -e "${YELLOW}Hotspot setup script not found, skipping.${NC}"
fi

# --- Klar ---
echo ""
echo -e "${BOLD}╔══════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   Installation complete!              ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${CYAN}Web UI:${NC}     http://$(hostname -I | awk '{print $1}'):3000"
echo -e "  ${CYAN}Status:${NC}     rf-survey status"
echo -e "  ${CYAN}Logs:${NC}       rf-survey logs"
echo -e "  ${CYAN}Update:${NC}     rf-survey update"
echo -e "  ${CYAN}Data dir:${NC}   $INSTALL_DIR/data/"
echo ""
echo -e "${GREEN}The app starts automatically on boot.${NC}"
echo -e "${GREEN}Fallback hotspot (Buster) activates when no WiFi is connected.${NC}"

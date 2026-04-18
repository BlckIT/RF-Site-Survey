// pm2 ecosystem config för RF-Site-Survey
// Används av rf-survey CLI för att hantera applikationen som en tjänst
const path = require('path');
const APP_DIR = path.resolve(__dirname);

module.exports = {
  apps: [{
    name: 'rf-site-survey',
    script: 'node_modules/.bin/next',
    args: 'start',
    cwd: APP_DIR,
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    watch: false,
    max_restarts: 10,
    restart_delay: 5000,
    autorestart: true,
    max_memory_restart: '512M'
  }]
}

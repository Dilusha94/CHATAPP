#!/usr/bin/env bash
# Deploy the latest code from GitHub. Usage (on the VM):  bash deploy/update.sh
set -euo pipefail
cd "$(dirname "$0")/.."
git pull --ff-only
cd server
npm ci --omit=dev
pm2 reload ecosystem.config.cjs   # users auto-reconnect and resume their session
sleep 2
curl -fsS http://127.0.0.1:3000/health && echo " <- healthy"

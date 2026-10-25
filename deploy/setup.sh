#!/usr/bin/env bash
# One-time server setup for Ubuntu 24.04 (Oracle Cloud Ampere A1).
# Usage:  sudo bash deploy/setup.sh chat.yoursite.lk
set -euo pipefail
DOMAIN="${1:?Usage: sudo bash deploy/setup.sh chat.yoursite.lk}"
APP_USER="${SUDO_USER:-ubuntu}"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
export DEBIAN_FRONTEND=noninteractive

echo "==> 1/8 System update"
apt-get update -y && apt-get upgrade -y
apt-get install -y curl git nginx redis-server iptables-persistent netfilter-persistent unattended-upgrades

echo "==> 2/8 Node.js 22 + PM2"
if ! command -v node >/dev/null || [[ "$(node -v)" != v22* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
npm install -g pm2

echo "==> 3/8 Redis (localhost only, memory only, no disk persistence)"
REDIS_CONF=/etc/redis/redis.conf
sed -i 's/^bind .*/bind 127.0.0.1 -::1/' $REDIS_CONF
sed -i 's/^# *maxmemory .*/maxmemory 2gb/; s/^maxmemory .*/maxmemory 2gb/' $REDIS_CONF
grep -q '^maxmemory ' $REDIS_CONF || echo 'maxmemory 2gb' >> $REDIS_CONF
sed -i 's/^# *maxmemory-policy .*/maxmemory-policy volatile-lru/' $REDIS_CONF
grep -q '^maxmemory-policy ' $REDIS_CONF || echo 'maxmemory-policy volatile-lru' >> $REDIS_CONF
sed -i 's/^save .*//' $REDIS_CONF && grep -q '^save ""' $REDIS_CONF || echo 'save ""' >> $REDIS_CONF
sed -i 's/^appendonly .*/appendonly no/' $REDIS_CONF
systemctl enable redis-server && systemctl restart redis-server
redis-cli ping

echo "==> 4/8 Kernel + file limits for thousands of sockets"
cat > /etc/sysctl.d/99-chat.conf <<SYS
fs.file-max = 200000
net.core.somaxconn = 8192
net.ipv4.tcp_max_syn_backlog = 8192
net.ipv4.ip_local_port_range = 10240 65000
net.ipv4.tcp_fin_timeout = 15
vm.overcommit_memory = 1
SYS
sysctl --system >/dev/null
cat > /etc/security/limits.d/99-chat.conf <<LIM
* soft nofile 65535
* hard nofile 65535
LIM

echo "==> 5/8 Firewall: open 80 + 443 (Oracle images block them by default)"
for p in 80 443; do
  iptables -C INPUT -p tcp --dport $p -m state --state NEW -j ACCEPT 2>/dev/null || \
  iptables -I INPUT 6 -p tcp --dport $p -m state --state NEW -j ACCEPT
done
netfilter-persistent save

echo "==> 6/8 Nginx"
sed -i 's/^\(\s*\)worker_connections .*/\1worker_connections 20000;/' /etc/nginx/nginx.conf
grep -q worker_rlimit_nofile /etc/nginx/nginx.conf || sed -i '/^worker_processes/a worker_rlimit_nofile 65535;' /etc/nginx/nginx.conf
sed "s/CHAT_DOMAIN/$DOMAIN/g" "$APP_DIR/deploy/nginx-chat.conf" > /etc/nginx/sites-available/chat
ln -sf /etc/nginx/sites-available/chat /etc/nginx/sites-enabled/chat
rm -f /etc/nginx/sites-enabled/default
mkdir -p /etc/ssl/cf
if [[ ! -s /etc/ssl/cf/origin.pem || ! -s /etc/ssl/cf/origin.key ]]; then
  echo "!! Cloudflare Origin certificate not found."
  echo "   Paste it into /etc/ssl/cf/origin.pem and the key into /etc/ssl/cf/origin.key,"
  echo "   then run: sudo nginx -t && sudo systemctl reload nginx"
else
  chmod 600 /etc/ssl/cf/origin.key
  nginx -t && systemctl reload nginx
fi

echo "==> 7/8 App dependencies + PM2"
cd "$APP_DIR/server"
[[ -f .env ]] || { cp .env.example .env; sed -i "s/^ADMIN_TOKEN=.*/ADMIN_TOKEN=$(openssl rand -hex 32)/; s#^REDIS_URL=.*#REDIS_URL=redis://127.0.0.1:6379#" .env; echo "!! Edit $APP_DIR/server/.env (CLIENT_ORIGIN)"; }
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"
sudo -u "$APP_USER" npm ci --omit=dev
sudo -u "$APP_USER" pm2 start ecosystem.config.cjs || sudo -u "$APP_USER" pm2 reload ecosystem.config.cjs
sudo -u "$APP_USER" pm2 save
env PATH="$PATH:/usr/bin" pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER" >/dev/null
UNIT="/etc/systemd/system/pm2-$APP_USER.service"
grep -q LimitNOFILE "$UNIT" || sed -i '/^\[Service\]/a LimitNOFILE=65535' "$UNIT"
systemctl daemon-reload
sudo -u "$APP_USER" pm2 install pm2-logrotate >/dev/null 2>&1 || true

echo "==> 8/8 Automatic security updates"
dpkg-reconfigure -f noninteractive unattended-upgrades

echo
echo "Done. Check: curl -s http://127.0.0.1:3000/health"
echo "Admin token: grep ADMIN_TOKEN $APP_DIR/server/.env"

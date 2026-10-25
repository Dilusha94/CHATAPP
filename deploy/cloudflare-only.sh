#!/usr/bin/env bash
# OPTIONAL: allow ports 80/443 only from Cloudflare, so nobody can hit the VM directly.
# Usage: sudo bash deploy/cloudflare-only.sh      (re-run every few months; Cloudflare IPs rarely change)
set -euo pipefail
for p in 80 443; do
  while iptables -C INPUT -p tcp --dport $p -m state --state NEW -j ACCEPT 2>/dev/null; do
    iptables -D INPUT -p tcp --dport $p -m state --state NEW -j ACCEPT
  done
done
iptables -N CLOUDFLARE 2>/dev/null || iptables -F CLOUDFLARE
for ip in $(curl -fsS https://www.cloudflare.com/ips-v4); do
  iptables -A CLOUDFLARE -s "$ip" -p tcp -m multiport --dports 80,443 -j ACCEPT
done
iptables -C INPUT -j CLOUDFLARE 2>/dev/null || iptables -I INPUT 6 -j CLOUDFLARE
netfilter-persistent save
echo "Ports 80/443 now accept Cloudflare only."

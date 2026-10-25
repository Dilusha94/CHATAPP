# 05 — Operations Runbook

How to run the live site day to day. Commands assume you are logged in with `ssh chat` (see doc 03 step 7).

---

## 1. Routine schedule

| When | Task | How |
|---|---|---|
| Daily | Check visitors & activity | `https://chat.yoursite.lk/admin/` → Stats (see §1.1) |
| Daily | Review reports | `https://chat.yoursite.lk/admin/` → Reports |
| Daily | Glance at UptimeRobot | app / email |
| Weekly | Server health | §3 below |
| Weekly | OS updates | `sudo apt update && sudo apt upgrade -y` (security updates already run automatically) |
| Weekly | Adsterra stats | dashboard |
| Monthly | Oracle bill = $0.00 | ☰ → Billing → Cost Analysis |
| Monthly | Update npm packages | §2.3 |
| Every 3 months | Refresh Cloudflare IP list (if you used `cloudflare-only.sh`) | `sudo bash ~/chatapp/deploy/cloudflare-only.sh` |

### 1.1 Your stats

**Admin panel → Stats** (opens first after you sign in with `ADMIN_TOKEN`):

| Number | Meaning |
|---|---|
| Visitors | unique devices that **joined the chat** that day |
| Sessions | sign-ins (one person can sign in several times a day) |
| Messages | private + group messages sent |
| Groups created | new group chats |
| Peak online | most people online at the same moment |
| Top countries | sessions per country (from Cloudflare, so it can't be faked) |

* Last 7 / 30 / 90 days as a chart and a day-by-day table. Days start at midnight in `STATS_TIMEZONE` (default `Asia/Colombo`; set it in `server/.env` to change).
* Only totals are stored in Redis (kept 90 days). No nicknames, messages or IPs. To count unique visitors, a one-way hash of the device id is kept for 2 days, then deleted.
* Totals are written every 30 s and on shutdown. Redis on the server is memory-only, so **a VM reboot erases the history** (normal restarts and deploys don't).

**Page visits (people who open the site but don't join)** are not in the panel. Turn on **Cloudflare Web Analytics** (free, no cookies, no code): Cloudflare dashboard → *Workers & Pages* → your Pages project → *Metrics* → enable *Web Analytics*. It shows page views, visitors, countries, devices and referrers (Google, Facebook…), and keeps history even if the VM reboots.

---

## 2. Deploying changes

### 2.1 Frontend (React app, pages)
```bash
# on your PC
git add . && git commit -m "..." && git push
```
Cloudflare Pages rebuilds automatically (~1 min). Check *Workers & Pages → Deployments*. Roll back: click an older deployment → **Rollback**.

### 2.2 Server (Node.js)
```bash
# on your PC
git push
# on the VM
ssh chat
cd ~/chatapp && bash deploy/update.sh
```
`update.sh` pulls, installs, reloads PM2 and checks `/health`. Online users see "Reconnecting…" for ~1 second and resume their sessions and chats (users and chats live in Redis, not in the Node process).

Roll back the server:
```bash
cd ~/chatapp
git log --oneline -5              # find the previous good commit
git checkout <commit> && cd server && npm ci --omit=dev && pm2 reload ecosystem.config.cjs
# later, return to main: git checkout main
```

### 2.3 Update dependencies (monthly)
```bash
# on your PC
cd server && npm outdated && npm update && npm test       # with the test server running (doc 02 §6)
cd ../client && npm outdated && npm update && npm run build
git commit -am "Update dependencies" && git push
# then on the VM: bash deploy/update.sh
```
For **major** version jumps (e.g. Socket.IO 4 → 5) read the changelog first and test locally.

---

## 3. Health checks

```bash
pm2 status                                # chat: online, restarts count should stay low
pm2 monit                                 # live CPU/RAM (q to quit)
curl -s http://127.0.0.1:3000/health      # {"ok":true,"online":N}
free -h                                   # RAM
df -h /                                   # disk
uptime                                    # load average (should stay < 2)
redis-cli info memory | grep used_memory_human
redis-cli dbsize                          # number of keys
redis-cli scard online:index              # online users in Redis (≈ health "online")
sudo systemctl status nginx redis-server --no-pager
```

**Normal numbers at 3,000 online:** chat process ~0.7–1.5 GB RAM, CPU 20–60% of one core, Redis < 50 MB.

---

## 4. Logs

```bash
pm2 logs chat                      # live app logs (Ctrl+C to exit)
pm2 logs chat --lines 200 --nostream
pm2 flush                          # clear logs
sudo tail -f /var/log/nginx/chat_error.log
journalctl -u redis-server -n 50
```
Nginx access logs are **off** on purpose (privacy, disk). `pm2-logrotate` stops logs filling the disk.

---

## 5. Moderation

### 5.1 Reviewing a report
1. Open `/admin/` → **Reports**. Each card shows reason, reported user (nickname, age, country, device id), reporter and the full conversation.
2. Decide:
   * Clear violation → **Ban 24h** or **Ban 7 days**
   * Not a violation → **Dismiss**
3. Banned users online right now are disconnected instantly and see the ban screen with your reason and the end time.

### 5.2 Suggested ban policy
| Violation | Ban |
|---|---|
| Spam / advertising / links | 24 h, repeat 7 days |
| Harassment, insults | 24 h, repeat 7 days |
| Sexual messages to people who didn't ask, scams | 7 days |
| Minor (under 18) on the site | 30 days (720 h), reason "Under 18. This site is for adults only." |
| Predatory behaviour towards a minor | 30 days and keep a record outside the system; if there is a real threat, report it to the police (Sri Lanka: 119 / CID cyber crimes unit) |

### 5.3 Other admin actions
* **Online users** tab → filter by nickname → **Kick** (logs them out, deletes data, no ban) or **Ban 24h**
* **Ban tools** tab → ban or unban any device id manually (e.g. after a ban appeal email)

### 5.4 Bans are by device id, not IP
* A user who clears browser data gets a new device id. That is the trade-off for never banning innocent people sharing a mobile IP.
* If one person keeps coming back: add their typical nickname words to `BAD_NICK_WORDS` in `server/src/validate.js`, and their spam phrases/links are already filtered.
* Reports are deleted automatically after 7 days.

### 5.5 Without the admin panel (terminal)
```bash
TOKEN=$(grep ADMIN_TOKEN ~/chatapp/server/.env | cut -d= -f2)
curl -s -H "x-admin-token: $TOKEN" http://127.0.0.1:3000/admin/api/stats
curl -s -H "x-admin-token: $TOKEN" http://127.0.0.1:3000/admin/api/reports | head -c 2000
curl -s -X POST -H "x-admin-token: $TOKEN" -H 'content-type: application/json' \
     -d '{"deviceId":"DEVICE_ID","reason":"Spam","hours":24}' http://127.0.0.1:3000/admin/api/ban
curl -s -X POST -H "x-admin-token: $TOKEN" -H 'content-type: application/json' \
     -d '{"deviceId":"DEVICE_ID"}' http://127.0.0.1:3000/admin/api/unban
```

### 5.6 Change the admin token
```bash
nano ~/chatapp/server/.env            # ADMIN_TOKEN=<openssl rand -hex 32>
cd ~/chatapp/server && pm2 reload ecosystem.config.cjs --update-env
```

---

## 6. Troubleshooting

| Symptom | Check | Fix |
|---|---|---|
| Site shows "Connecting…" forever | `curl https://chat.yoursite.lk/health` | see rows below |
| Cloudflare **521** | `systemctl status nginx`; `sudo iptables -L INPUT -n --line-numbers` | `sudo systemctl restart nginx`; ports 80/443 must be ACCEPT above REJECT; Oracle Security List rules |
| Cloudflare **502** | `pm2 status`, `pm2 logs chat` | `pm2 restart chat`; fix the error shown in logs |
| Cloudflare **525/526** | cert files | re-paste Origin cert/key, SSL mode Full (strict) |
| Browser console: **CORS error** | `CLIENT_ORIGIN` in `.env` | must exactly match `https://yoursite.lk` (no trailing slash), then `cd ~/chatapp/server && pm2 reload ecosystem.config.cjs --update-env` |
| Users disconnect every ~100 s | Cloudflare proxy timeout | ping interval is 25 s (fine); check Bot Fight Mode is off, WebSockets on |
| `pm2 logs` shows Redis `ECONNREFUSED` | `systemctl status redis-server` | `sudo systemctl restart redis-server` |
| `pm2 logs` says "REDIS_URL=memory is for local testing only" (app keeps restarting) | `grep REDIS_URL ~/chatapp/server/.env` | set `REDIS_URL=redis://127.0.0.1:6379` in `server/.env`, then `cd ~/chatapp/server && pm2 reload ecosystem.config.cjs --update-env` |
| High RAM / restarts | `pm2 status` restart count, `pm2 monit` | normal limit 3 GB auto-restart; investigate logs; check for unusual traffic in Cloudflare Analytics |
| Everybody logged out at once | VM rebooted (Redis is RAM only) | expected after reboot; `uptime` shows it |
| Flags all show the same country | not behind Cloudflare proxy | DNS record must be **Proxied** (orange) |
| VM unreachable via SSH | Oracle console → instance state | Start it; or use *Console connection* in Oracle |
| New site build fails | Cloudflare Pages → deployment log | run `npm run build` locally, fix, push |

### Restart everything
```bash
sudo systemctl restart redis-server nginx
pm2 restart chat
```
(Restarting Redis logs everyone out.)

### After a VM reboot
Everything starts automatically (systemd + PM2 startup). Check with `pm2 status` and `curl http://127.0.0.1:3000/health`.

---

## 7. Security checklist

- ⬜ SSH only with key (Oracle default; password login disabled)
- ⬜ `.env` never in Git
- ⬜ Redis bound to 127.0.0.1 only (`redis-cli config get bind`)
- ⬜ Node listens on 127.0.0.1 only (only Nginx is public)
- ⬜ Admin panel behind Cloudflare Access (email one-time code) + token, and VM reachable only through Cloudflare (doc 03 steps 15–16)
- ⬜ Unattended security upgrades on (`systemctl status unattended-upgrades`)
- ⬜ Optional: `cloudflare-only.sh` applied
- ⬜ Optional: `sudo apt install fail2ban` (extra SSH protection)
- ⬜ Messages rendered as plain text by React (no HTML injection possible)

---

## 8. Scaling beyond 3,000

| Online users | What to do |
|---|---|
| up to ~8–10k | Nothing. The single process + 12 GB VM is fine. Watch CPU in `pm2 monit` |
| CPU of chat process near 100% at peaks | Switch `io` to `uWebSockets.js` adapter (Socket.IO supports `io.attachApp`), or move to a bigger paid VM |
| > 15k | Multiple Node processes/servers: add `@socket.io/redis-adapter`, move the in-memory `users` Map to Redis reads, sticky sessions in Nginx (`ip_hash` or cookie) |

Before scaling, check where time goes: `pm2 monit` (CPU), `redis-cli --latency` (Redis), Cloudflare Analytics (traffic spikes, attacks).

---

## 9. If Oracle reclaims or deletes the VM

Because nothing is stored long-term, recovery is quick:
1. Create a new A1 VM (doc 03 step 4), attach the **reserved IP** (step 5). DNS doesn't change.
2. `git clone` + Origin cert + `sudo bash deploy/setup.sh chat.yoursite.lk` (steps 10.1–10.4).
3. Copy your old `ADMIN_TOKEN` (or create a new one).

Keep a copy of: Origin cert + key (password manager), the server `.env`, your SSH private key.

---

## 10. Go-live / weekly checklist (copy into your notes)

- ⬜ `curl https://chat.yoursite.lk/health` → ok
- ⬜ Two-browser chat test works
- ⬜ Reports queue empty or handled
- ⬜ `pm2 status` → online, restarts not climbing
- ⬜ `free -h` → plenty of free RAM
- ⬜ `df -h /` → < 70% used
- ⬜ Oracle cost = $0.00
- ⬜ Adsterra earnings checked

# ChatNow — free anonymous 1-to-1 chat (Chatiw-style, fixed and modernised)

A fast, free, anonymous chat site monetised with Adsterra. Built to handle **3,000+ people online at the same time** on **free hosting** (Oracle Cloud Always Free + Cloudflare).

> "ChatNow", `yoursite.lk` and `chat.yoursite.lk` are placeholders. Replace them with your real name and domain everywhere.

## Documents (read in this order)

| # | File | What it covers |
|---|------|----------------|
| 1 | [docs/01-IMPLEMENTATION-PLAN.md](docs/01-IMPLEMENTATION-PLAN.md) | Every phase and every small task, from zero to launch, with checkboxes |
| 2 | [docs/02-LOCAL-DEVELOPMENT.md](docs/02-LOCAL-DEVELOPMENT.md) | Run and test the app on your own PC, how the code works |
| 3 | [docs/03-DEPLOYMENT-GUIDE.md](docs/03-DEPLOYMENT-GUIDE.md) | A–Z: GitHub → Oracle VM → Redis/Node/Nginx → Cloudflare → live site, every command |
| 4 | [docs/04-ADSTERRA-AND-SEO.md](docs/04-ADSTERRA-AND-SEO.md) | Ads setup and placement, SEO, getting traffic |
| 5 | [docs/05-OPERATIONS-RUNBOOK.md](docs/05-OPERATIONS-RUNBOOK.md) | Daily running: updates, moderation, monitoring, troubleshooting, scaling |

## Architecture

```
                 ┌──────────────────────────── Cloudflare (free) ────────────────────────────┐
 Browser ──────► │  yoursite.lk  → Cloudflare Pages (React SPA, landing, rules, SEO pages)    │
 (phone / PC)    │  chat.yoursite.lk → proxied WebSocket (SSL, DDoS protection, hides IP)    │
                 └───────────────────────────────────────┬───────────────────────────────────┘
                                                         │ HTTPS / WSS (Origin certificate)
                                     ┌───────────────────▼─────────────────────┐
                                     │ Oracle Cloud Always Free Ampere A1 VM    │
                                     │ 2 OCPU · 12 GB RAM · Ubuntu 24.04 ARM    │
                                     │                                          │
                                     │  Nginx :443 ──► Node.js + Socket.IO :3000│
                                     │                    (PM2, 1 process)      │
                                     │                         │                │
                                     │                 Redis :6379 (RAM only)   │
                                     └──────────────────────────────────────────┘
```

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React 19 + Vite + Tailwind CSS 4, Zustand, TanStack Virtual | Small, fast SPA; 3,000-row user list stays smooth on cheap phones |
| Realtime | Node.js 22 + Socket.IO 4 | Rooms, acks, auto-reconnect, session recovery built in |
| Database | Redis (in-memory, no disk) | Everything is temporary; TTLs give auto-expiry for free |
| Server host | Oracle Cloud Always Free (Ampere A1) | 2 OCPU / 12 GB RAM free forever |
| Frontend host + DNS + SSL | Cloudflare Pages + Cloudflare DNS (free) | Global CDN, free SSL, WebSocket proxy, DDoS protection |
| Process manager | PM2 | Auto-restart, boot startup, log rotation |

## How the Chatiw problems are fixed

| Chatiw problem | Fix in this project |
|---|---|
| Chat history disappears when you go back | Single-page app; every conversation is kept in the client store **and** on the server (last 200 messages per pair) until logout/idle. Reopening a chat reloads it. Browser Back closes the chat instead of leaving. |
| Search inaccurate | Search runs on the server against the **live** online user list in memory: exact, instant, never stale. |
| Active users vanish from the list | Presence = the socket connection. Network drops get a 2-minute grace period and automatic session resume. Multiple tabs share one user. |
| Unfair bans | **No IP bans** (Sri Lankan mobile networks share IPs). Rate-limit first (slow down → 60s mute), bans are per device, time-limited, and the ban screen shows the **exact reason and end time**. Every ban comes from a human reviewing a saved report. |

## Data rules (as you specified)

* **Logout → hard delete**: profile, nickname, every conversation the user was in, block list. Gone from Redis immediately.
* **Idle 5 minutes → automatic logout + hard delete**. Only real activity (typing, sending, clicking, scrolling) counts; background heartbeats do not.
* **Closed tab / lost connection → deleted after 2 minutes** unless they come back.
* **Only exception**: a conversation someone **reported** is kept for 7 days for moderator review, then auto-deleted.
* **Moderation records (1 year)**: every sign-in (time, IP, device ID, nickname, gender, age, country, browser), every report (without messages) and every ban/unban are kept for **365 days** (`HISTORY_KEEP_DAYS`), then deleted automatically. Messages are never stored there. Admins see this as *Previous activity* on reports and *History* on online users, to spot people who keep returning under new names, genders or countries (VPN). Storage: PostgreSQL when `DATABASE_URL` is set (e.g. aaPanel), otherwise the built-in PGlite database in `server/data/history` (see `server/src/history.js`). The privacy page and FAQ say this.
* **Group chats** follow the same rules: logging out or going idle removes you from every group, and a group (with all its messages) is hard-deleted the moment its last member leaves.

## Group chats

* Anyone can create a group (max **10 people**; up to 2 groups as admin and 5 groups joined per person, see `groupMax*` in `server/src/config.js`).
* **Invite**: in a group, tap **Invite** to copy the link (`https://yoursite.lk/?g=XXXXXXXXXX`) or send it straight to someone online. In a chat the link shows as a **Join group** card. Someone who opens the link before signing in joins the group right after they pick a nickname.
* The link filter still removes every other link; only your own group invite links are allowed (their domain must be in `CLIENT_ORIGIN`).
* Anyone can **leave**. The admin (creator) can **remove** people; a removed device can't rejoin that group. If the admin leaves, the longest-standing member becomes admin.
* Members can **report** someone in a group; the group conversation is saved for moderator review (7 days), like private-chat reports.

## Folder structure

```
chatapp/
├── README.md
├── .gitignore
├── docs/                      ← the guides
├── server/                    ← Node.js + Socket.IO + Redis
│   ├── src/
│   │   ├── index.js           ← HTTP server, Socket.IO setup, health check
│   │   ├── config.js          ← every tunable setting (idle time, limits…)
│   │   ├── store.js           ← all Redis reads/writes, hard-delete logic
│   │   ├── socket.js          ← realtime events (join, chat, search, report, groups…)
│   │   ├── groups.js          ← group chats: create/join/leave/kick, invite links, hard delete
│   │   ├── history.js         ← 1-year moderation records (sign-ins, reports, bans) in PostgreSQL / PGlite
│   │   ├── stats.js           ← daily totals for the admin Stats tab
│   │   ├── ads.js             ← ad switches (admin → Ads tab), pushed live to browsers
│   │   ├── validate.js        ← input validation, 18+ check, link filter, rate limiter
│   │   ├── badwords.js        ← blocked words for nicknames and group names (edit the lists here)
│   │   └── admin.js           ← admin REST API (reports, ban, kick)
│   ├── public/index.html      ← admin panel (https://chat.yoursite.lk/admin/)
│   ├── scripts/name-filter-test.js ← bad-name filter tests (no server needed)
│   ├── scripts/smoke-test.js  ← 18 automatic feature tests
│   ├── scripts/group-test.js  ← 18 group chat tests (run by npm test after the smoke test)
│   ├── scripts/load-test.js   ← simulates thousands of users
│   ├── ecosystem.config.cjs   ← PM2 config
│   └── .env.example
├── client/                    ← React frontend (Cloudflare Pages)
│   ├── src/
│   │   ├── App.jsx            ← layout, idle warning, ban screen
│   │   ├── lib/               ← socket, store, chat logic, countries, sound
│   │   └── components/        ← JoinScreen, Header, UserList, ChatPanel, GroupPanel, MessageText, Views, AdBanner
│   ├── public/                ← rules, privacy, safety, contact pages, robots, sitemap
│   └── .env.example
└── deploy/
    ├── setup.sh               ← one-command server setup
    ├── update.sh              ← one-command deploy of new code
    ├── nginx-chat.conf        ← Nginx with WebSocket support
    └── cloudflare-only.sh     ← optional: only Cloudflare can reach the VM
```

## Quick start (local)

No Redis or Docker needed: `server/.env.example` sets `REDIS_URL=memory`, an in-memory store for local testing (data is lost on restart). Production always uses real Redis.

```bash
# terminal 1 – server
cd server && cp .env.example .env && npm install && npm run dev

# terminal 2 – client
cd client && cp .env.example .env && npm install && npm run dev
# open http://localhost:5173 in two different browsers
```

To test against real Redis locally, see [docs/02-LOCAL-DEVELOPMENT.md](docs/02-LOCAL-DEVELOPMENT.md) §3.

## Tested results

* `npm test` (server): 35/35 checks pass. Smoke test (17): 18+ gate, duplicate nicknames, delivery, link filter, history kept, search, rate limit, block, report, resume after reconnect, logout hard delete, idle auto-logout hard delete. Group test (18): create, invite links allowed / other links removed, 10-person limit, delivery, history access, admin-only remove, removed can't rejoin, admin hand-over, logout leaves groups, last member leaving hard-deletes the group.
* Load test: **3,000 concurrent users, ~300 messages/second, p95 latency ≈ 50 ms, ~700 MB RAM**, 0 failed connections (single process, same machine as the load generator). The Oracle VM has 12 GB.

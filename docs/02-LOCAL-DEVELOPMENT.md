# 02 — Local Development

Run the whole app on your own PC, test it, and understand where everything lives.

---

## 1. Install prerequisites (Windows)

```powershell
# Node.js 22 LTS – download from https://nodejs.org (LTS), then check:
node -v        # v22.x
npm -v

# Git – https://git-scm.com
git --version
```

That's all. Redis/Docker are **optional** locally (see §3).

---

## 2. Get the code into your GitHub repo

```bash
# unzip chatapp.zip, then:
cd chatapp
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_GITHUB/chatapp.git
git push -u origin main
```

---

## 3. Redis (optional locally)

**Default: nothing to install.** `server/.env.example` contains `REDIS_URL=memory`, which runs a small in-memory stand-in for Redis inside the server process (`server/src/memory-redis.js`). Data is lost every time the server restarts, which is fine for testing. The server refuses to start in memory mode when `NODE_ENV=production`, so it can never run on the live server.

### Optional: test with real Redis

Use this to test exactly like production. Set `REDIS_URL=redis://127.0.0.1:6379` in `server/.env`, then start Redis with Docker Desktop (https://www.docker.com/products/docker-desktop):

```bash
docker run -d --name redis -p 6379:6379 --restart unless-stopped redis:7-alpine redis-server --save "" --appendonly no
docker exec -it redis redis-cli ping        # → PONG
```

> No Docker? Use WSL2: `wsl --install`, then inside Ubuntu: `sudo apt install redis-server && sudo service redis-server start`.

Useful later (real Redis only):
```bash
docker start redis                          # after a PC restart
docker exec -it redis redis-cli keys '*'    # see what is stored
docker exec -it redis redis-cli flushall    # wipe everything (dev only!)
```

---

## 4. Start the server

```bash
cd server
cp .env.example .env          # Windows CMD: copy .env.example .env
npm install
npm run dev                   # auto-restarts when you edit files
```

You should see: `chat server on :3000 (restored 0 users)` (in memory mode, also a `[store] REDIS_URL=memory` warning; that's expected).

Check: open http://localhost:3000/health → `{"ok":true,"online":0}`

### `server/.env` explained

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | 3000 | Node listens on 127.0.0.1 only (Nginx is the public door) |
| `REDIS_URL` | memory | `memory` = in-memory test store (local only). `redis://127.0.0.1:6379` = real Redis (required in production) |
| `CLIENT_ORIGIN` | http://localhost:5173 | Allowed frontend(s), comma separated |
| `ADMIN_TOKEN` | change-me | Password for `/admin/`. Use `openssl rand -hex 32` in production |
| `IDLE_SECONDS` | 300 | Idle time before auto logout + delete |
| `DISCONNECT_GRACE_SECONDS` | 120 | How long a closed tab / lost connection is kept |
| `BLOCK_LINKS` | true | Replace links with `[link removed]` |

---

## 5. Start the client

```bash
cd client
cp .env.example .env
npm install
npm run dev
```

Open http://localhost:5173

**Test with two people:** open one normal window and one **incognito/private** window (or a different browser). Each window is a different user. Two tabs in the same window share one user on purpose.

### `client/.env` explained

| Variable | Meaning |
|---|---|
| `VITE_SERVER_URL` | Chat server URL. Local: `http://localhost:3000`; live: `https://chat.yoursite.lk` |
| `VITE_SITE_NAME` | Name in the header |
| Ads | Not here: banners, direct link, popunder and social bar are switched on in the admin panel → **Ads** tab (doc 04) |

### Test on your phone (same Wi-Fi)

```bash
# client
npm run dev -- --host            # shows http://192.168.x.x:5173
```
Set `VITE_SERVER_URL=http://192.168.x.x:3000` in `client/.env`, add `http://192.168.x.x:5173` to `CLIENT_ORIGIN` in `server/.env`, and in `server/src/index.js` temporarily change `server.listen(config.port, '127.0.0.1'` to `'0.0.0.0'`. **Change it back before deploying.**

---

## 6. Run the automated tests

The smoke test uses short timers so the idle test finishes in seconds. Stop `npm run dev` first (the test server uses port 3000). It works in both modes: with `REDIS_URL=memory` it inspects stored keys through a test-only `/dev/redis/...` endpoint that exists only in memory mode.

**Windows PowerShell (memory mode, nothing installed):**

Terminal 1, the test server:
```powershell
cd server
$env:IDLE_SECONDS=4; $env:SWEEP_INTERVAL_MS=1000; $env:DISCONNECT_GRACE_SECONDS=2; node --env-file=.env src/index.js
```

Terminal 2:
```powershell
cd server
npm test
```

macOS/Linux/Git Bash, terminal 1: `IDLE_SECONDS=4 SWEEP_INTERVAL_MS=1000 DISCONNECT_GRACE_SECONDS=2 node --env-file=.env src/index.js`

Expected:
```
Testing http://127.0.0.1:3000 using in-memory store

PASS  under-18 rejected
PASS  missing 18+ confirm rejected
PASS  join ok
PASS  duplicate nickname rejected
PASS  message delivered
PASS  link removed
PASS  history kept on server (back button bug)
PASS  search by nick
PASS  search excludes self / wrong gender
PASS  search by age range
PASS  rate limit kicks in (no ban)
PASS  block works
PASS  report saved
PASS  resume after reconnect keeps session
PASS  logout hard-deletes user + chats
PASS  idle auto-logout fires
PASS  idle user hard-deleted

ALL PASSED

Group chat tests

PASS  group name too short rejected
PASS  create group (creator is admin)
PASS  own invite link allowed in chat
PASS  other links still removed
PASS  invite card info (name + size)
PASS  9 more people join (10 total)
PASS  11th person rejected (group full)
PASS  group message delivered to members
PASS  non-member cannot read history
PASS  member can read history
PASS  non-admin cannot remove people
PASS  admin removes a member
PASS  removed person cannot rejoin
PASS  free seat can be taken again
PASS  admin leaves -> longest member becomes admin
PASS  logout removes you from your groups
PASS  last person leaves -> group deleted
PASS  group data hard-deleted

ALL GROUP TESTS PASSED
```

If your normal dev server is already using port 3000, start the test server on another port and point the tests at it:
```powershell
# terminal 1
$env:PORT=3100; $env:IDLE_SECONDS=4; $env:SWEEP_INTERVAL_MS=1000; $env:DISCONNECT_GRACE_SECONDS=2; node --env-file=.env src/index.js
# terminal 2
$env:URL='http://127.0.0.1:3100'; npm test
```

Restart the test server between runs. In memory mode that also gives you a fresh store. With real Redis, also run `docker exec -it redis redis-cli flushall` first.

### Local load test

```bash
# normal server running (npm run dev), then:
cd server
N=1000 DURATION=30 npm run load          # PowerShell: $env:N=1000; $env:DURATION=30; npm run load
```
Output every second: `joined`, `failed`, `sent`, `received`, latency `p50/p95/p99`. On Windows you may hit open-file limits above ~1,000. Do the real 3,000 test against the live server (doc 03 step 14).

---

## 7. How the code works (map)

### Server

| File | Responsibility |
|---|---|
| `src/index.js` | Express + Socket.IO server, `/health`, `/admin`, graceful shutdown, restore after restart |
| `src/config.js` | All numbers: idle time, grace, limits, report TTL |
| `src/store.js` | Every Redis command. `purgeUser()` = the hard delete |
| `src/socket.js` | Every realtime event + idle sweeper + batched list updates |
| `src/validate.js` | Join validation (18+), text cleaning, link filter, sliding-window rate limiter |
| `src/admin.js` | Admin REST API |
| `public/index.html` | Admin panel UI |

### Socket events

| Client → server | Payload | Reply |
|---|---|---|
| `session:join` | `{nick, gender:'m'/'f', age, country, state, deviceId, ageConfirmed:true}` | `{ok, user, token, list, count}` or `{ok:false, error}` / `{banned}` |
| `session:resume` | `{userId, token}` | `{ok, user, list, count, partners}` |
| `msg:send` | `{to, text, cid}` | `{ok, msg}` |
| `chat:history` | `{with}` | `{ok, messages}` |
| `typing` | `{to}` | — |
| `search` | `{nick, gender, ageMin, ageMax, country}` | `{ok, results}` |
| `profile:update` | `{age, state, visible}` | `{ok, user}` |
| `block` / `unblock` | `{id}` | `{ok}` |
| `report` | `{id, reason}` | `{ok}` |
| `activity` | — | — |
| `session:logout` | — | `{ok}` |

| Server → client | Payload |
|---|---|
| `count` | number online (landing page) |
| `users:diff` | `{add:[users], remove:[ids], count}` every ≤1 s |
| `msg:new` | message + `fromUser` |
| `typing` | `{from}` |
| `partner:left` | `{id}` |
| `warn` | `{message}` (rate limit) |
| `session:ended` | `{reason: idle / logout / kicked / banned / disconnected, ban?}` |

### Client

| File | Responsibility |
|---|---|
| `lib/socket.js` | Socket connection, `call()` helper with timeout, device id, saved session |
| `lib/store.js` | Global state (Zustand): me, users, chats, active chat, view… |
| `lib/chat.js` | All actions: join, open chat, send, search, block, report, logout, activity tracking |
| `components/JoinScreen.jsx` | Landing + join form |
| `components/Header.jsx` | Top bar + mobile bottom nav |
| `components/UserList.jsx` | Virtualised online list |
| `components/ChatPanel.jsx` | Conversation + report dialog |
| `components/Views.jsx` | Home, Inbox, Chat history, Search, Profile |
| `components/AdBanner.jsx` | Adsterra banners (each in its own iframe) |
| `App.jsx` | Layout, idle warning, ban screen, toasts, Back-button handling |

### Common customisations

| Want to… | Edit |
|---|---|
| Change idle time | `IDLE_SECONDS` in `server/.env` **and** `IDLE_MS` in `client/src/lib/chat.js` |
| Change colours | `@theme` block in `client/src/index.css` |
| Allow links | `BLOCK_LINKS=false` |
| Change message rate limit | `msgLimit` in `server/src/config.js` |
| Keep more history per chat | `maxHistory` in `config.js` (and `.slice(-200)` in `lib/chat.js`) |
| Add countries on top of the list | first codes in `CODES` + `TOP` in `client/src/lib/countries.js` |

---

## 8. Build the client for production (check before pushing)

```bash
cd client
npm run build          # creates client/dist
npm run preview        # serves dist on http://localhost:4173
```
If `npm run build` fails, Cloudflare Pages will fail too. Always build locally first.

## 9. Daily Git workflow

```bash
git add .
git commit -m "Describe the change"
git push            # Cloudflare Pages rebuilds the frontend automatically
# then on the server (doc 05): bash deploy/update.sh
```

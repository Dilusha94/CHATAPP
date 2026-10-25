# 01 — Implementation Plan (zero → live)

Every phase, every small task, in order. Tick the boxes as you go.

* **✅ = already done in the starter code** in this package (you only need to review, customise and test it).
* **⬜ = you do it**.

Estimated total: **3–5 weeks** part-time (1–2 weeks if you only customise the provided code).

---

## Phase 0 — Decisions & accounts (Day 1)

### 0.1 Decide the basics
- ⬜ Choose the site name (replace "ChatNow" everywhere)
- ⬜ Choose the domain, e.g. `yoursite.lk` (or `.com` for a global audience)
- ⬜ Decide the main audience (Sri Lanka first, then global). Pick the Oracle region from this:
  - Sri Lanka / India → **Mumbai** or **Hyderabad**, or **Singapore**
  - USA → **Ashburn** or **Phoenix**
- ⬜ Decide the support email (e.g. `support@yoursite.lk`)

### 0.2 Create accounts (all free)
- ⬜ GitHub account → create a **private** repository `chatapp`
- ⬜ Oracle Cloud account (needs a card for verification, not charged)
- ⬜ Cloudflare account
- ⬜ Adsterra **publisher** account (apply after the site is live, see Phase 9)
- ⬜ UptimeRobot account (free uptime monitoring)
- ⬜ Google Search Console + Bing Webmaster Tools (after launch)

### 0.3 Install on your PC
- ⬜ Node.js 22 LTS
- ⬜ Git
- ⬜ VS Code
- ⬜ Docker Desktop (to run Redis locally), or WSL2 Ubuntu
- ⬜ An SSH client (Windows 10/11 has `ssh` built in)

**Done when:** you can run `node -v` (v22.x), `git --version`, `docker ps`.

---

## Phase 1 — Project setup (Day 1–2)

### 1.1 Repository
- ✅ Monorepo layout: `server/`, `client/`, `deploy/`, `docs/`
- ✅ `.gitignore` (node_modules, dist, .env)
- ⬜ Copy this package into your repo folder, `git init`, first commit, push to GitHub

### 1.2 Server project
- ✅ `server/package.json` (ESM, Node ≥ 20) with `express`, `socket.io`, `ioredis`
- ✅ `server/.env.example` with every setting
- ✅ `npm run dev` (auto-reload), `npm start`, `npm test`, `npm run load`

### 1.3 Client project
- ✅ Vite + React + Tailwind 4 setup
- ✅ `client/.env.example` (server URL, site name, Adsterra keys)
- ✅ Brand colours: red `#E74C3C` / `#C0392B`, pink female rows, blue male rows, green online badge
- ⬜ Replace logo/favicon (`client/public/favicon.svg`, `Logo` in `components/ui.jsx`)
- ⬜ Set `VITE_SITE_NAME` in `client/.env`

**Done when:** `npm run dev` works in both folders (see doc 02).

---

## Phase 2 — Backend core (Week 1)

### 2.1 Redis data model (`server/src/store.js`)
- ✅ `user:{id}` HASH: nick, gender, age, country, state, visible, deviceId, token. **TTL 300 s**
- ✅ `online:index` SET: ids of online users
- ✅ `nick:{lowercase}` STRING: reserves a nickname (unique among online users)
- ✅ `chat:{idA}:{idB}` LIST: last 200 messages of a pair (JSON)
- ✅ `partners:{id}` SET: who this user chatted with (used for hard delete)
- ✅ `blocks:{id}` SET: who this user blocked
- ✅ `ban:{deviceId}` STRING: ban reason, TTL = ban length
- ✅ `report:{id}` STRING + `reports:index` ZSET: reported chats, TTL 7 days
- ✅ In-memory mirror of online users (`users` Map) for instant list + search

### 2.2 Session lifecycle
- ✅ `session:join`: validate input, 18+ check, ban check, reserve nickname, create user, return token
- ✅ Country taken from Cloudflare's `CF-IPCountry` header (stops fake flags); falls back to the user's choice locally
- ✅ `session:resume`: after a network drop or page refresh, re-attach with userId + token
- ✅ Multiple tabs → one user (Socket.IO room `u:{id}`)
- ✅ `disconnect`: 2-minute grace period, then hard delete
- ✅ `session:logout`: **hard delete** (profile, nickname, all chats, partners, blocks)
- ✅ Idle sweeper every 10 s: **5 min without real activity → logout + hard delete**
- ✅ `activity` event from client on real input only (heartbeats don't count)
- ✅ Startup restore: after `pm2 reload`, users in Redis get 2 minutes to reconnect

### 2.3 Messaging
- ✅ `msg:send` with acknowledgement, client message id (`cid`) for optimistic UI
- ✅ Max 500 characters, control characters stripped, links replaced with `[link removed]`
- ✅ Delivered to every tab of the receiver and the sender's other tabs
- ✅ `chat:history`: returns the saved conversation (fixes "history disappears")
- ✅ `typing` indicator
- ✅ Block checks in both directions

### 2.4 User list & search
- ✅ Initial full list on join/resume
- ✅ Batched diffs every 1 s (`users:diff` with add/remove/count), never the full list again
- ✅ `search`: nickname contains, gender, age range, country, live users only, max 200 results
- ✅ Hidden users (visibility setting) are excluded from list and search

### 2.5 Rate limits (no IP bans)
- ✅ 5 messages / 3 s
- ✅ 10 searches / 10 s
- ✅ 15 *new* people messaged / minute (anti-spam bots)
- ✅ 5 strikes in a minute → 60 s mute with a message (not a ban)

### 2.6 Admin API (`server/src/admin.js`)
- ✅ Protected by `ADMIN_TOKEN` header (timing-safe compare)
- ✅ `GET /admin/api/stats`, `/users`, `/reports`
- ✅ `POST /admin/api/ban` (device, reason, hours), `/unban`, `/kick`
- ✅ `DELETE /admin/api/reports/:id` (dismiss)
- ✅ Admin panel page at `/admin/`

### 2.7 Your tasks
- ⬜ Read through `config.js` and adjust limits if you want
- ⬜ Add words to `BAD_NICK_WORDS` in `validate.js`
- ⬜ Run `npm test`. All 17 checks must pass (doc 02 shows how)

**Done when:** `npm test` prints `ALL PASSED`.

---

## Phase 3 — Frontend core (Week 1–2)

### 3.1 Join screen (`JoinScreen.jsx`)
- ✅ Nickname, gender, age (18–99 only), country (flag), Sri Lanka province
- ✅ Mandatory "I am 18 or older" checkbox
- ✅ Live online count, feature cards, rules box, ad slots
- ⬜ Edit the landing text for your audience (consider adding Sinhala lines)

### 3.2 Main layout
- ✅ Red header: sound toggle, dark mode, Chat history, Inbox (unread badge), Search, Profile, Logout
- ✅ Left sidebar: ONLINE count, filter chips (All / Women / Men / My country), virtualised list
- ✅ Same-country users sorted first (like Chatiw)
- ✅ Mobile: full-width views, bottom navigation (Online / Inbox / Search / Profile)

### 3.3 Chat panel (`ChatPanel.jsx`)
- ✅ Header with avatar, flag, age, country, province, typing… / left status
- ✅ Bubbles, grouping, time, sending/failed states
- ✅ Emoji picker, 500-char limit, Enter to send
- ✅ Block and Report (reason picker)
- ✅ Browser Back button closes the chat instead of leaving the site

### 3.4 Other views (`Views.jsx`)
- ✅ Home tips, Inbox (unread only), Chat history (all conversations this session)
- ✅ Search with gender toggle, age range, country
- ✅ Profile: age, province, visibility

### 3.5 Session UX (`lib/chat.js`, `App.jsx`)
- ✅ Session saved in `localStorage` → page refresh resumes the same session
- ✅ "Reconnecting…" badge on network drop, automatic resume
- ✅ Idle warning at 4:00 with an "I'm here" button, countdown
- ✅ Clear messages on logout / idle / kick
- ✅ Ban screen with **exact reason and end time**
- ✅ Notification sound (toggle) for messages in chats that aren't open

**Done when:** two browsers can join, chat, go back and forth without losing history, search each other, block, report, log out.

---

## Phase 4 — Polish & extra features (Week 2–3)

- ⬜ Add Sinhala (and Tamil) UI text. Simple approach: a `lang.js` dictionary + a toggle in the header
- ⬜ Change the welcome text on the Home view
- ⬜ Tab title shows unread count: `(3) ChatNow`. Add in `App.jsx` with `useEffect` on unread count
- ⬜ Browser notifications (ask permission after first message) (optional)
- ⬜ PWA manifest so people can "Add to Home screen" (optional)
- ⬜ Check all screens in dark mode
- ⬜ Check on a cheap Android phone over 4G (Dialog/Mobitel/Hutch)

---

## Phase 5 — Safety & moderation (Week 3) — **do not skip**

Anonymous stranger chat attracts minors, scammers and spam bots. This protects users, your Adsterra account and your hosting.

- ✅ 18+ gate (age dropdown starts at 18 + confirmation checkbox; server rejects < 18)
- ✅ Report button → conversation snapshot kept 7 days → admin review
- ✅ Report reason "Appears to be under 18". **Act on these first.**
- ✅ Link filter (spam / phishing)
- ✅ Nickname word filter
- ✅ Rate limiting → mute, never IP ban
- ✅ Bans per device, time-limited, reason shown
- ✅ Rules, Privacy, Safety tips, Contact pages
- ⬜ Replace `support@yoursite.lk` in `client/public/contact.html` with your real email
- ⬜ Decide a ban policy, e.g.: 1st offence 24 h, 2nd 7 days, minors/explicit predators: 30 days (720 h)
- ⬜ Check the reports queue at least once a day (doc 05)
- ⬜ Protect `/admin` with Cloudflare Access (free, email one-time code; doc 03 step 15) **and** allow only Cloudflare to reach the VM (doc 03 step 16)

---

## Phase 6 — Testing (Week 3)

### 6.1 Automated
- ✅ `npm test`: 17 feature checks
- ✅ `npm run load`: N simulated users with realistic message rate

### 6.2 Manual checklist (two browsers + one phone)
- ⬜ Join with age 17: impossible (dropdown starts at 18; server rejects)
- ⬜ Same nickname twice: second one rejected
- ⬜ Message both ways; open another chat; come back: history still there
- ⬜ Refresh the page: same session, chats still there
- ⬜ Turn phone Wi-Fi off 30 s, then on: "Reconnecting…" then resumes
- ⬜ Leave a tab untouched 5 min: warning at 4:00, logged out at 5:00, chats gone
- ⬜ Logout: the other side sees "left the chat"; your nickname is free again
- ⬜ Block: the blocked person gets "User is unavailable"
- ⬜ Report: appears in `/admin/` with the messages
- ⬜ Ban from admin: user sees ban screen with reason + end time; a friend on the same Wi-Fi can still join
- ⬜ Send 10 messages fast: "Slow down", then muted 60 s
- ⬜ Paste a link: shows `[link removed]`
- ⬜ Search by part of a nickname, gender, age, country: correct results

### 6.3 After deployment
- ⬜ Load test the live server with 3,000 users (doc 03 step 14)

---

## Phase 7 — Infrastructure (Week 4) → doc 03

- ⬜ Oracle VM `VM.Standard.A1.Flex`, 2 OCPU / 12 GB, Ubuntu 24.04 aarch64
- ⬜ Reserved public IP
- ⬜ Security List: ingress TCP 80, 443
- ⬜ Upgrade Oracle account to Pay-As-You-Go + $1 budget alert (stops idle reclaim)
- ⬜ Domain → Cloudflare nameservers
- ⬜ DNS: `chat` A record → VM IP (proxied)
- ⬜ Cloudflare SSL **Full (strict)** + Origin certificate on the VM
- ⬜ Run `deploy/setup.sh`
- ⬜ Cloudflare Pages project for `client/`, custom domain `yoursite.lk` + `www`

---

## Phase 8 — Deployment & go-live (Week 4) → doc 03

- ⬜ Server `.env` filled (CLIENT_ORIGIN, ADMIN_TOKEN)
- ⬜ Client env vars in Cloudflare Pages (VITE_SERVER_URL…)
- ⬜ `https://chat.yoursite.lk/health` → `{"ok":true}`
- ⬜ `https://yoursite.lk` loads, joins, chats
- ⬜ Admin panel works
- ⬜ UptimeRobot monitor on `/health`
- ⬜ Go-live checklist in doc 05 completed

---

## Phase 9 — Monetisation & growth (Week 4–5) → doc 04

- ⬜ Apply to Adsterra with the live site
- ⬜ Social Bar + banners (300×250, 728×90, 320×50) + optional popunder (1 per session)
- ⬜ Keys into Cloudflare Pages env vars → redeploy
- ⬜ Google Search Console + sitemap
- ⬜ SEO landing pages (e.g. "Sri Lanka chat", "Colombo chat", "free chat no registration")
- ⬜ Share in Facebook groups / TikTok / YouTube Shorts

---

## Phase 10 — After launch (ongoing) → doc 05

- ⬜ Daily: reports queue
- ⬜ Weekly: `sudo apt upgrade`, check RAM/CPU, check Adsterra stats
- ⬜ Monthly: review ban policy, add filter words, check Oracle bill is $0.00

## Phase 11 — Future ideas (only when there is revenue)

- ⬜ Image sharing (needs storage + moderation, so moderation work increases)
- ⬜ Video chat (WebRTC + TURN server; TURN bandwidth costs money)
- ⬜ Group rooms
- ⬜ Second server + `@socket.io/redis-adapter` when you pass ~10–15k concurrent users (doc 05)

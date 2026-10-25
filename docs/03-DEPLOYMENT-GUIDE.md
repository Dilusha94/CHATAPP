# 03 — Deployment Guide (A–Z, from code to live site)

Final result:

| URL | Served by |
|---|---|
| `https://yoursite.lk` (+ `www`) | Cloudflare Pages: React app, rules/privacy/safety pages |
| `https://chat.yoursite.lk` | Oracle VM: Socket.IO chat server (via Cloudflare proxy) |
| `https://chat.yoursite.lk/admin/` | Admin panel (protected) |
| `https://chat.yoursite.lk/health` | Health check |

Replace `yoursite.lk`, `chat.yoursite.lk`, `YOUR_GITHUB`, `<VM_IP>` with your real values everywhere.

Time needed: **2–4 hours** the first time (most of it waiting for DNS).

---

## Step 1 — Push the code to GitHub

On your PC (see doc 02 §2). Make sure `.env` files are **not** committed:

```bash
git status            # .env must NOT appear
git push
```

---

## Step 2 — Oracle Cloud account

1. Sign up at https://www.oracle.com/cloud/free/
2. **Home region**: choose carefully, **it can never be changed**. For Sri Lanka: *India West (Mumbai)*, *India South (Hyderabad)* or *Singapore*.
3. Card verification (a small temporary hold, refunded).
4. **Upgrade to Pay As You Go** (strongly recommended): ☰ → *Billing & Cost Management* → *Upgrade and Manage Payment*.
   * Always Free resources stay free.
   * Oracle can reclaim **idle** free-tier-only instances; PAYG accounts are not subject to this.
5. **Budget alert** so you are warned if anything ever costs money:
   ☰ → *Billing & Cost Management* → *Budgets* → *Create Budget* → amount **1 USD**, alert at **1%** of actual spend → your email.

---

## Step 3 — Create an SSH key on your PC

```bash
# Windows PowerShell / macOS / Linux
ssh-keygen -t ed25519 -f ~/.ssh/oracle_chat -C "oracle-chat"
# press Enter twice (or set a passphrase)

# show the PUBLIC key (you paste this into Oracle)
cat ~/.ssh/oracle_chat.pub                 # PowerShell: Get-Content $HOME\.ssh\oracle_chat.pub
```

Never share `oracle_chat` (without `.pub`); it is your private key.

---

## Step 4 — Create the VM

☰ → *Compute* → *Instances* → **Create instance**

| Setting | Value |
|---|---|
| Name | `chat-server` |
| Placement | any Availability Domain (try another if capacity error) |
| Image | **Canonical Ubuntu 24.04** (click *Change image*; pick the aarch64 build) |
| Shape | *Change shape* → **Ampere** → `VM.Standard.A1.Flex` → **2 OCPU, 12 GB memory** |
| Networking | *Create new virtual cloud network* + *Create new public subnet* (defaults) |
| Public IPv4 | **Assign a public IPv4 address** ✔ |
| SSH keys | *Paste public keys* → paste `oracle_chat.pub` |
| Boot volume | 50 GB (free tier allows up to 200 GB total) |

Click **Create**. Wait until the state is **Running**. Copy the **Public IP address**.

> **"Out of host capacity"?** Free Arm capacity is often full. Try another Availability Domain, retry at different hours (early morning works well), or try again over a few days. PAYG accounts get capacity much more easily.

> Create **only one** A1 VM with 2 OCPU/12 GB. Your free allowance is 1,500 OCPU-hours + 9,000 GB-hours per month = exactly this, 24/7.

---

## Step 5 — Make the IP permanent (reserved IP)

The default IP is "ephemeral": it survives reboots but is lost if the VM is ever recreated.

1. ☰ → *Networking* → *IP Management* → *Reserved Public IPs* → **Reserve public IP address** → name `chat-ip` → Reserve.
2. *Compute* → *Instances* → `chat-server` → *Attached VNICs* → click the VNIC → *IPv4 Addresses* → ⋮ on the private IP → **Edit**.
3. Public IP type: *No public IP* → **Update** (removes the ephemeral one).
4. Edit again → *Reserved public IP* → select `chat-ip` → **Update**.
5. Use this reserved IP from now on as `<VM_IP>`.

---

## Step 6 — Open ports 80 and 443 in Oracle

☰ → *Networking* → *Virtual Cloud Networks* → your VCN → *Security Lists* → *Default Security List* → **Add Ingress Rules**:

| Source CIDR | IP Protocol | Destination Port |
|---|---|---|
| `0.0.0.0/0` | TCP | `80` |
| `0.0.0.0/0` | TCP | `443` |

(Port 22 for SSH is already open by default.) The Ubuntu firewall inside the VM is opened later by `setup.sh`.

---

## Step 7 — Log in to the VM

```bash
ssh -i ~/.ssh/oracle_chat ubuntu@<VM_IP>
```

Type `yes` the first time. You are now on the server (`ubuntu@chat-server:~$`).

Optional shortcut. Add this to `~/.ssh/config` on your PC:
```
Host chat
    HostName <VM_IP>
    User ubuntu
    IdentityFile ~/.ssh/oracle_chat
```
Then just `ssh chat`.

Check the machine:
```bash
nproc          # 2
free -h        # ~11Gi total
uname -m       # aarch64
```

---

## Step 8 — Move your domain to Cloudflare DNS

1. https://dash.cloudflare.com → **Add a site** → `yoursite.lk` → **Free** plan.
2. Cloudflare scans existing records. Keep them, especially **MX / TXT / mail** records if your email is hosted elsewhere (e.g. LankaHost), or email stops working.
3. Cloudflare shows **2 nameservers** (e.g. `ana.ns.cloudflare.com`, `bob.ns.cloudflare.com`).
4. Change the nameservers at your registrar:
   * `.lk` domain: log in to your LK domain agent's client area (e.g. LankaHost) → domain → *Nameservers*. If there is no option, open a support ticket asking them to set these two nameservers.
   * `.com` etc.: the registrar's DNS/nameserver settings.
5. Wait until Cloudflare shows the site as **Active** (minutes to 24 h; `.lk` can be slower).

Check from your PC:
```bash
nslookup -type=NS yoursite.lk
```

---

## Step 9 — Cloudflare settings

### 9.1 DNS record for the chat server
*DNS* → *Records* → **Add record**:

| Type | Name | IPv4 | Proxy |
|---|---|---|---|
| A | `chat` | `<VM_IP>` | **Proxied** (orange cloud) |

(The root `yoursite.lk` and `www` are added automatically by Cloudflare Pages in step 12.)

### 9.2 SSL/TLS
* *SSL/TLS* → *Overview* → **Full (strict)**
* *SSL/TLS* → *Edge Certificates* → **Always Use HTTPS: On**, **Minimum TLS: 1.2**

### 9.3 Network / security
* *Network* → **WebSockets: On** (default on)
* *Security* → *Bots* → **Bot Fight Mode: Off** (it can challenge Socket.IO connections and break the chat)
* *Security* → *Settings* → Security level **Medium**

### 9.4 Create the Origin certificate (for Nginx on the VM)
*SSL/TLS* → *Origin Server* → **Create Certificate**
* Key type: RSA (2048)
* Hostnames: `yoursite.lk`, `*.yoursite.lk`
* Validity: 15 years → **Create**

Keep this page open. You need both boxes in the next step (**Origin Certificate** and **Private Key**). The private key is shown only once.

---

## Step 10 — Install the server (on the VM)

### 10.1 Let the VM read your private GitHub repo (deploy key)
```bash
ssh-keygen -t ed25519 -f ~/.ssh/github_deploy -N "" -C "chat-server"
cat ~/.ssh/github_deploy.pub
```
GitHub → your repo → *Settings* → *Deploy keys* → **Add deploy key** → paste → **leave "Allow write access" off** → Add.

```bash
cat >> ~/.ssh/config <<'EOF'
Host github.com
    IdentityFile ~/.ssh/github_deploy
    IdentitiesOnly yes
EOF
ssh -T git@github.com          # type yes → "Hi YOUR_GITHUB/chatapp! You've successfully authenticated"
git clone git@github.com:YOUR_GITHUB/chatapp.git ~/chatapp
```

### 10.2 Paste the Cloudflare Origin certificate
```bash
sudo mkdir -p /etc/ssl/cf
sudo nano /etc/ssl/cf/origin.pem      # paste "Origin Certificate" → Ctrl+O, Enter, Ctrl+X
sudo nano /etc/ssl/cf/origin.key      # paste "Private Key"        → Ctrl+O, Enter, Ctrl+X
sudo chmod 600 /etc/ssl/cf/origin.key
```

### 10.3 Run the setup script (installs everything)
```bash
cd ~/chatapp
sudo bash deploy/setup.sh chat.yoursite.lk
```

It does, in order:
1. `apt upgrade`, installs Nginx, Redis, Git, firewall tools, automatic security updates
2. Node.js 22 + PM2
3. Redis: localhost only, max 2 GB, **no disk persistence** (privacy)
4. Kernel/file limits for tens of thousands of connections
5. Opens ports 80/443 in the Ubuntu firewall (iptables, saved permanently)
6. Nginx site with WebSocket proxy + your Origin certificate
7. `npm ci`, creates `server/.env` with a random `ADMIN_TOKEN` and `REDIS_URL=redis://127.0.0.1:6379`, starts the app with PM2, enables start on boot, log rotation
8. Unattended security upgrades

### 10.4 Configure the server `.env`
```bash
nano ~/chatapp/server/.env
```
```ini
PORT=3000
REDIS_URL=redis://127.0.0.1:6379
CLIENT_ORIGIN=https://yoursite.lk,https://www.yoursite.lk
ADMIN_TOKEN=<already generated, keep it>
IDLE_SECONDS=300
DISCONNECT_GRACE_SECONDS=120
BLOCK_LINKS=true
```
> **`REDIS_URL` must be `redis://127.0.0.1:6379` on the server.** `.env.example` defaults to `REDIS_URL=memory` for local testing (setup.sh replaces it automatically). Never use `memory` on the server: the app refuses to start with it in production.

Save, then:
```bash
cd ~/chatapp/server
pm2 reload ecosystem.config.cjs
pm2 status                     # chat → online
grep ADMIN_TOKEN .env          # copy this into your password manager
```

### 10.5 Verify on the VM
```bash
curl -s http://127.0.0.1:3000/health          # {"ok":true,"online":0}
sudo nginx -t                                  # syntax is ok
systemctl is-active nginx redis-server         # active active
redis-cli ping                                 # PONG
ulimit -n; cat /proc/$(pgrep -f 'src/index.js' | head -1)/limits | grep "open files"   # 65535
```

---

## Step 10A — (Optional) aaPanel + PostgreSQL

[aaPanel](https://www.aapanel.com) is a free web control panel for the VM. Here it is used to install and
manage a **PostgreSQL** database (also free), plus file manager, cron jobs and database backups in a browser.

> **What the app stores here:** the 1-year moderation records (every sign-in with IP, device, nickname,
> gender, age, country; reports; bans). Messages are never stored. **Without this step** the app keeps the
> same records in its built-in database file `~/chatapp/server/data/history`, so aaPanel is optional; use it
> if you want PostgreSQL, a browser UI and automatic database backups.

**Three rules that keep the chat working with aaPanel:**
1. Do this **after Step 10** (`setup.sh` already installed Nginx, Redis and the app).
2. **Never install Nginx, Apache, OpenResty or Redis from aaPanel.** Ours already use ports 80, 443 and 6379; a second copy breaks the site. From aaPanel install **only PostgreSQL**.
3. **Never open the aaPanel port to the internet.** You reach it through an SSH tunnel from your PC (step A3).

### A1. Install aaPanel (about 5 minutes)
SSH into the VM (Step 7). Copy the **current** install command from https://www.aapanel.com/new/download.html
(it changes with new versions). At the time of writing it was:
```bash
URL=https://www.aapanel.com/script/install_7.0_en.sh && if [ -f /usr/bin/curl ];then curl -ksSO "$URL" ;else wget --no-check-certificate -O install_7.0_en.sh "$URL";fi;sudo bash install_7.0_en.sh aapanel
```
Answer `y` when asked. At the end it prints the **panel address** (with a port number and a secret
"security entrance" path), a **username** and a **password**. Save all of them in your password manager.
Lost them later? On the VM run `sudo bt` and choose the option that shows the default login info.

### A2. Check the chat still works
The installer can change firewall rules, so check right away:
```bash
curl -s http://127.0.0.1:3000/health            # {"ok":true,...}
systemctl is-active nginx redis-server           # active active
sudo iptables -L INPUT -n --line-numbers | grep -E "dpt:(80|443)|CLOUDFLARE"   # 80/443 (or the CLOUDFLARE chain) still ACCEPT
```
Then open `https://chat.yoursite.lk/health` from your PC. If it fails, re-open the ports:
`sudo bash ~/chatapp/deploy/setup.sh chat.yoursite.lk` is safe to run again, or, if you did Step 16,
`sudo bash ~/chatapp/deploy/cloudflare-only.sh`.

### A3. Open the panel safely (SSH tunnel)
**Do not** add the aaPanel port to the Oracle security list (Step 6). Instead, on your PC:
```bash
# replace PANEL_PORT with the port from A1 (e.g. 7800 or a random 5-digit number)
ssh -i ~/.ssh/oracle_chat -N -L 8888:127.0.0.1:PANEL_PORT ubuntu@<VM_IP>
```
Leave that window open and browse to `https://127.0.0.1:8888/<security-entrance>` (the path from A1).
Accept the certificate warning (it's the panel's own certificate, the connection goes through SSH).
Close the window when done; the panel is then unreachable from outside.

### A4. First login
1. Log in with the username/password from A1.
2. A **"Recommended software" / one-click LNMP** window appears: **close it without installing anything**.
3. *Settings* → change the username and password, and turn on **two-factor authentication (Google Authenticator)**.
4. *Settings* → keep **"Panel SSL"** on and leave the security entrance enabled.

### A5. Install PostgreSQL
1. *App Store* → search **PostgreSQL** → install the latest stable version (e.g. 16). It takes a few minutes on the ARM VM.
2. *Databases* → **PgSQL** tab → **Add database**:
   * Database name: `chatapp` · Username: `chatapp` · Password: click *generate* (long random)
   * Access: **local server / 127.0.0.1 only** (never "everyone")
3. Check it only listens locally:
   ```bash
   sudo ss -ltnp | grep 5432        # must show 127.0.0.1:5432, NOT 0.0.0.0:5432
   ```
   Never open port 5432 in the Oracle security list.
4. Point the app at it in `~/chatapp/server/.env` and restart:
   ```ini
   DATABASE_URL=postgres://chatapp:THE_PASSWORD@127.0.0.1:5432/chatapp
   HISTORY_KEEP_DAYS=365
   ```
   ```bash
   cd ~/chatapp/server && pm2 reload ecosystem.config.cjs --update-env
   pm2 logs chat --lines 20          # look for: [history] postgres, keeping 365 days
   ```
   The tables are created automatically on start. Records already in the built-in file are **not** copied over.

### A6. Backups
*Cron* → **Add task** → type *Backup database* → PgSQL `chatapp` → **daily**, keep 7 copies.
These backups stay on the same VM; for real safety also copy them off the server now and then
(e.g. download from aaPanel's file manager, or Oracle Object Storage, which has a free tier).

### About the stored data
* The privacy page and FAQ already tell users what is kept (sign-in records incl. IP, reports, bans), why
  (abuse prevention) and for how long (1 year). If you change `HISTORY_KEEP_DAYS`, update those texts too
  (`client/public/privacy.html`, `client/index.html`, `JoinScreen.jsx`). This is required by Sri Lanka's
  Personal Data Protection Act (2022) and the EU GDPR (for EU visitors).
* Old records are deleted automatically every 6 hours (anything older than `HISTORY_KEEP_DAYS`).
* The real visitor IP comes from Cloudflare's `CF-Connecting-IP` header, which Nginx passes on as `X-Real-IP`.
* If someone asks to have their data deleted: in aaPanel → *Databases* → PgSQL → open `chatapp` and run
  `DELETE FROM sessions WHERE device_id = '...';` (find the device id in the admin panel).

Resource use: aaPanel + PostgreSQL need roughly 0.5–1 GB RAM; the VM has 12 GB, so the chat is not affected.

---

## Step 11 — Verify from the internet

From your PC:
```bash
curl https://chat.yoursite.lk/health
# {"ok":true,"online":0}
```

| Result | Fix |
|---|---|
| `521` | Nginx not reachable: check step 6 (Security List) and `sudo iptables -L INPUT -n --line-numbers` shows ACCEPT for 80/443 **above** the REJECT line |
| `525/526` | SSL problem: Origin cert/key pasted wrong, or SSL mode not *Full (strict)* |
| `502` | Node not running: `pm2 logs chat` |
| DNS error | Domain not Active on Cloudflare yet (step 8) |

---

## Step 12 — Deploy the frontend to Cloudflare Pages

1. Cloudflare → *Workers & Pages* → **Create** → *Pages* → **Connect to Git** → authorise GitHub → choose `chatapp`.
2. Build settings:

| Setting | Value |
|---|---|
| Framework preset | **None** (or Vite) |
| Build command | `npm run build` |
| Build output directory | `dist` |
| **Root directory** | `client` |

3. **Environment variables** (Production):

| Name | Value |
|---|---|
| `NODE_VERSION` | `22` |
| `VITE_SERVER_URL` | `https://chat.yoursite.lk` |
| `VITE_SITE_NAME` | `ChatNow` (your name) |
| (ads) | none: switch ads on later in the admin panel → **Ads** tab (doc 04), no redeploy needed |

4. **Save and Deploy**. You get `https://chatapp-xxx.pages.dev`.
5. *Custom domains* → **Set up a custom domain** → `yoursite.lk` → Activate. Repeat for `www.yoursite.lk`.
6. (Optional) Redirect `www` → root: *Rules* → *Redirect Rules* → create: hostname equals `www.yoursite.lk` → dynamic redirect to `concat("https://yoursite.lk", http.request.uri.path)`, 301.

From now on, **every `git push` to `main` rebuilds the frontend automatically** (about 1 minute).

> Changing a `VITE_…` variable needs a new build: *Deployments* → ⋮ on the latest → **Retry deployment**.

---

## Step 13 — End-to-end test of the live site

- ⬜ `https://yoursite.lk` loads, shows the live online count
- ⬜ Join in browser A (normal) and browser B (incognito or phone on 4G)
- ⬜ The flag is your real country (taken from Cloudflare, not the dropdown)
- ⬜ Chat both ways, switch chats, refresh: history is kept
- ⬜ Search, block, report all work
- ⬜ `https://chat.yoursite.lk/admin/` → paste ADMIN_TOKEN → the report is listed
- ⬜ Logout → the other side sees "left"
- ⬜ Work through the full manual checklist in doc 01, Phase 6.2

---

## Step 14 — Load test the live server (3,000 users)

Run the load generator from **another machine** than the server. A good free option is one of your two free **AMD micro** VMs:

1. Create instance → shape **VM.Standard.E2.1.Micro** (Always Free), Ubuntu 24.04, same SSH key.
2. On it:
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash - && sudo apt install -y nodejs git
ulimit -n 65535
git clone https://github.com/YOUR_GITHUB/chatapp.git   # or copy server/scripts + package.json
cd chatapp/server && npm install
URL=https://chat.yoursite.lk N=1500 DURATION=120 npm run load
```
The micro VM is very weak (1/8 CPU), so run **1,500 from it and 1,500 from your PC** at the same time for 3,000 total. Latency measured on a weak client looks worse than real users experience.

Watch the server while it runs:
```bash
ssh chat
pm2 monit                          # CPU / RAM of the chat process
htop                               # whole machine
```
**Pass criteria:** `failed=0`, p95 latency < 300 ms, chat process RAM < 2 GB, CPU < 70%.

Afterwards the load users log out automatically. Delete the micro VM if you don't need it.

---

## Step 15 — Protect the admin panel (Cloudflare Access, free)

The admin page already needs the token. Cloudflare Access adds a second lock: before the page even
loads, Cloudflare asks for a **one-time code sent to your email**. Strangers never reach your server.

1. Cloudflare dashboard → **Zero Trust** (first time: choose a team name, e.g. `chatnow`, plan **Free**, $0; a card may be asked for but is not charged).
2. *Settings* → *Authentication* → *Login methods*: make sure **One-time PIN** is listed (it is by default).
3. *Access* → *Applications* → **Add an application** → **Self-hosted**.
4. *Application name* `Chat admin`. *Session duration* **24 hours** (you'll be asked for a new code once a day).
5. *Application domain*: subdomain `chat`, domain `yoursite.lk`, path `admin`. Click **Add domain** and add a second row with path `admin/*`, so the panel **and** its API are covered.
6. *Policies* → **Add a policy**: name `Owner`, Action **Allow**, *Include* → **Emails** → your email address. (Add a second email here later if you get a co-moderator.)
7. Leave the rest as default → **Save**.
8. **Do Step 16 now.** Access only protects traffic that goes through Cloudflare; without Step 16 someone who finds the VM's IP could skip it.

**Check it works** (use a private/incognito window):
* `https://chat.yoursite.lk/admin/` → Cloudflare login page → enter your email → type the code from your inbox → the admin panel opens → sign in with the token.
* `https://chat.yoursite.lk/admin/api/stats` → also shows the Cloudflare login page (**not** `{"error":"unauthorized"}`). If you see the JSON error, the `admin/*` path from step 5 is missing.
* The chat itself (`https://yoursite.lk`) still works normally; Access only covers `/admin`.

Lost access to your email? Log in to Cloudflare (with your Cloudflare password) and edit the policy's email in *Access* → *Applications*.

---

## Step 16 — Only allow Cloudflare to reach the VM (required if you use Step 15)

Hides the server from direct attacks and stops anyone skipping Cloudflare Access; anyone hitting `<VM_IP>` directly is dropped:
```bash
cd ~/chatapp && sudo bash deploy/cloudflare-only.sh
```
If you later turn off the orange cloud in Cloudflare, the site will stop working. Re-run the script every few months.

---

## Step 17 — Monitoring (UptimeRobot, free)

1. https://uptimerobot.com → **Add New Monitor**
2. Type **HTTP(s) – Keyword**, URL `https://chat.yoursite.lk/health`, keyword `"ok":true`, interval 5 min.
3. Add a second monitor for `https://yoursite.lk`.
4. Alert contact: your email (and the mobile app for push).

---

## Step 18 — Go live

- ⬜ All of step 13 passes on phone (4G) and PC
- ⬜ Load test passed (step 14)
- ⬜ Admin protected (step 15)
- ⬜ UptimeRobot green (step 17)
- ⬜ Oracle budget alert set, account on PAYG
- ⬜ `support@` email in `contact.html` is real
- ⬜ Adsterra applied (doc 04)
- ⬜ Sitemap submitted in Google Search Console (doc 04)

🎉 The site is live. Daily running is in **doc 05**.

---

## Appendix A — Manual setup (what `setup.sh` does, if you prefer step by step)

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git nginx redis-server iptables-persistent netfilter-persistent

# Node 22 + PM2
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2

# Redis: local only, RAM only
sudo nano /etc/redis/redis.conf
#   bind 127.0.0.1 -::1
#   maxmemory 2gb
#   maxmemory-policy volatile-lru
#   save ""
#   appendonly no
sudo systemctl restart redis-server

# Firewall (Oracle Ubuntu images block everything except 22)
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save

# Nginx
sudo sed "s/CHAT_DOMAIN/chat.yoursite.lk/g" ~/chatapp/deploy/nginx-chat.conf | sudo tee /etc/nginx/sites-available/chat
sudo ln -s /etc/nginx/sites-available/chat /etc/nginx/sites-enabled/chat
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# App
cd ~/chatapp/server
cp .env.example .env && nano .env
npm ci --omit=dev
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup            # run the command it prints
pm2 install pm2-logrotate
```

## Appendix B — Cost summary

| Item | Cost |
|---|---|
| Oracle A1 VM 2 OCPU / 12 GB, 50 GB disk, 10 TB/month egress | $0 (Always Free) |
| Cloudflare DNS, SSL, proxy, Pages, Access (≤50 users) | $0 |
| UptimeRobot | $0 |
| aaPanel (free edition) + PostgreSQL (optional, Step 10A) | $0 |
| Domain | your registrar's yearly fee |

Keep the Oracle budget alert on. If you ever see a charge, check you have only one A1 VM and that total block storage is ≤ 200 GB.

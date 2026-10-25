# 04 — Adsterra Monetisation & SEO

Revenue = **visitors × time on site × ad quality**. A chat site earns because people stay long, so never let ads hurt the chat experience. Annoyed users don't come back.

---

## Part A — Adsterra

### A1. Apply (after the site is live)
1. https://adsterra.com → **Sign up as Publisher**.
2. *Websites* → **Add website** → `https://yoursite.lk`.
   * Category: choose honestly (e.g. *Social Networks / Chat / Dating*). Don't pick an adult category unless the site allows adult content (it shouldn't).
   * The site must be live with real pages. The Rules / Privacy / Safety / Contact pages help approval.
3. Wait for approval (usually 1–3 days).
4. Payout method: Adsterra supports options like Paxum, WebMoney, bank wire and crypto. Check what currently works for Sri Lanka and the minimum payout.

### A2. Create ad units
In the Adsterra dashboard → *Websites* → your site → **Add ad unit**. Create the ones you want:

| Unit | Where it appears in this app | When |
|---|---|---|
| **Banner 320×50** | Landing page (×3), every 2 chats in Inbox / All chats, every 5 people in Online now, top of every chat, under views on mobile | always |
| **Banner 300×250** | Under the sign-in card, Home view | always |
| **Banner 728×90** | Landing page under the FAQ (desktop only) | always |
| **Direct Link** | Opens in a new tab on every Nth message a user sends (default 20) | signed-in users |
| **Popunder** | Loaded N minutes after sign-in (default 3); Adsterra opens it on the user's next click | signed-in users |
| **Social Bar** | Floating notification-style ad | signed-in users |

### A3. Switch ads on from the admin panel (no redeploy)
All ads are **off** until you switch them on. Admin panel (`https://chat.yoursite.lk/admin/`) → **Ads** tab:

1. Turn on the type you want and paste its code. You can paste the **whole code Adsterra shows**; the key
   (banners) or the script URL (popunder, social bar) is picked out automatically. Only `https` scripts are accepted.
   * Banners: one key per size (sizes left empty are simply not shown). *Ad domain* is the domain in the banner
     code's `//DOMAIN/KEY/invoke.js` (usually `www.highperformanceformat.com`).
   * Direct link: the URL and "every Nth message".
   * Popunder: the script and "minutes after sign-in".
   * Social bar: the script.
2. **Save changes.** Everyone on the site gets the change within a second, including people already chatting.
3. Turning a type **off** stops it immediately for banners and the direct link. A popunder/social bar that
   already ran in someone's browser disappears on their next page load.

Settings are saved in `server/data/ads.json` on the VM (survives restarts and reboots). Code:
`server/src/ads.js` (settings + validation), `client/src/components/AdBanner.jsx`, `client/src/lib/directLink.js`,
`client/src/lib/adScripts.js` (popunder + social bar).

Tip: start with banners only, add the social bar when you have steady traffic, and the popunder/direct link last;
they earn the most but annoy users the most. Watch the Stats tab after each change.

### A6. Placement rules (keep users = keep revenue)
* ✅ Landing page, Home view, sidebar, between views: fine
* ❌ **Never** inside the message list or covering the message input
* ❌ Never more than **one popunder per session**. Set frequency capping in the Adsterra unit settings
* ❌ No ads that auto-play sound
* Check the site on a cheap Android phone after adding ads. If the chat feels slow, remove the heaviest unit

### A7. Track performance
* Adsterra dashboard: impressions, CPM, revenue per unit, per country
* Turn off units with very low CPM that annoy users
* Sri Lankan traffic usually has a low CPM; US/UK/AU traffic pays much more. That's why the global SEO pages (Part B) matter

---

## Part B — SEO & growth

### B1. Basic setup (day 1 after launch)
1. **Replace `yoursite.lk` with your real domain** in: `client/index.html` (canonical, Open Graph, structured data), `client/public/robots.txt`, `client/public/sitemap.xml`, and the 4 info pages (`rules.html`, `safety.html`, `privacy.html`, `contact.html`). Search the `client/` folder for `yoursite.lk` to find every place.
2. **Google Search Console** → *Add property* → *Domain* → `yoursite.lk` → verify with the TXT record (add it in Cloudflare DNS).
3. *Sitemaps* → submit `https://yoursite.lk/sitemap.xml`.
4. Same in **Bing Webmaster Tools** (it can import from Search Console).
5. Check the link preview: paste your URL into https://developers.facebook.com/tools/debug/ and https://cards-dev.twitter.com/validator (or just send it to yourself on WhatsApp).
6. Check structured data: https://search.google.com/test/rich-results → should find **FAQ**, **WebSite** and **WebApplication**.

### B2. What is already built in
| Item | Where |
|---|---|
| Title + description | `client/index.html` (and each info page) |
| Canonical URL (avoids duplicate pages) | `client/index.html`, info pages |
| Link previews (WhatsApp, Facebook, X, Telegram) | Open Graph + Twitter tags in `client/index.html`; image `client/public/og-image.png` (1200×630) |
| Structured data (WebSite, WebApplication, FAQPage) | JSON-LD in `client/index.html` |
| Visible FAQ on the landing page | `FAQ` list in `client/src/components/JoinScreen.jsx` (**keep its text identical to the FAQPage data in `index.html`**, Google checks they match) |
| Home-screen icons + install | `site.webmanifest`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png` |
| Sitemap with dates | `client/public/sitemap.xml` (update `lastmod` when you change a page) |
| Chat server hidden from Google | `server/src/index.js`: `robots.txt` disallow + `X-Robots-Tag: noindex` on `chat.yoursite.lk`; admin page has `noindex` |

Adjust the title and description to your main keywords if needed.

### B3. Landing pages (biggest SEO win)
Create one static HTML page per search phrase in `client/public/`, copying the style of `rules.html`. Each page: 300–600 words of **useful, original** text + a big "Start chatting" button to `/`.

| File | Target phrase |
|---|---|
| `sri-lanka-chat.html` | sri lanka chat, srilanka chat room, lanka chat |
| `sinhala-chat.html` | sinhala chat, sinhala chat room (write part of it in Sinhala) |
| `colombo-chat.html` | colombo chat |
| `free-chat-no-registration.html` | free chat no registration |
| `chat-with-strangers.html` | chat with strangers |
| `anonymous-chat.html` | anonymous chat |
| `usa-chat.html`, `uk-chat.html` | higher-paying ad traffic |

After adding pages:
* add each URL to `sitemap.xml`
* link them from the footer of `JoinScreen.jsx` or a "Chat rooms" section
* `git push` → live in a minute

### B4. Speed (also an SEO factor)
* Already done: one self-hosted variable font (Plus Jakarta Sans, served from your own domain, no Google Fonts request), hashed asset files cached for 1 year (`_headers`), Cloudflare CDN
* Test on https://pagespeed.web.dev after adding ads; aim for 80+ on mobile

### B5. Traffic ideas
* Facebook groups and pages for Sri Lankan chat/friendship (follow each group's rules)
* TikTok / YouTube Shorts: short clips like "meet people from 50 countries in 1 minute"
* Ask users to share: a "Share this site" button with a WhatsApp share link: `https://wa.me/?text=Free%20chat%20https%3A%2F%2Fyoursite.lk`
* Never buy bot traffic; Adsterra detects it and bans the account

### B6. What to measure
* Cloudflare *Analytics* (free): visitors, countries
* Admin panel: online count at different times of day
* Adsterra: revenue per 1,000 visitors (RPM)

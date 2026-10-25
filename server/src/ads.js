// Ad settings, controlled from the admin panel (Ads tab) and pushed live to every browser.
// Saved in server/data/ads.json, so they survive restarts and VM reboots. Everything starts OFF.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'ads.json');

const DEFAULTS = {
  banners:    { enabled: false, domain: 'www.highperformanceformat.com', keys: { '300x250': '', '728x90': '', '320x50': '' } },
  directLink: { enabled: false, url: '', every: 20 },      // opened on every Nth message a user sends
  popunder:   { enabled: false, src: '', delayMinutes: 3 }, // script loaded N minutes after sign-in
  socialBar:  { enabled: false, src: '' },                  // script loaded right after sign-in
};

let io = null;
export const setAdsIo = server => { io = server; };

const KEY_RE = /^[a-f0-9]{16,64}$/i;
const clean = s => String(s ?? '').trim().slice(0, 500);

/** Accepts a URL or the whole <script …src="…"></script> tag Adsterra gives you; returns an https URL or '' */
export function scriptUrl(input) {
  let s = clean(input);
  const m = s.match(/src\s*=\s*["']([^"']+)["']/i);
  if (m) s = m[1];
  if (s.startsWith('//')) s = 'https:' + s;
  try { const u = new URL(s); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; }
}

/** Accepts a banner key or the whole Adsterra banner code; returns the key or '' */
export function bannerKey(input) {
  const s = clean(input);
  const m = s.match(/['"]key['"]\s*:\s*['"]([a-f0-9]+)['"]/i) || s.match(/\/([a-f0-9]{16,64})\/invoke\.js/i);
  const k = m ? m[1] : s;
  return KEY_RE.test(k) ? k : '';
}

function load() {
  try {
    const saved = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return merge(structuredClone(DEFAULTS), saved);
  } catch { return structuredClone(DEFAULTS); }
}
const merge = (base, over) => {
  for (const k of Object.keys(base)) {
    if (over?.[k] === undefined) continue;
    base[k] = base[k] && typeof base[k] === 'object' && !Array.isArray(base[k]) ? merge(base[k], over[k]) : over[k];
  }
  return base;
};

let settings = load();
export const getAds = () => settings;

/** Validates a full settings object from the admin panel; returns { settings } or { error } */
export function updateAds(input = {}) {
  const b = input.banners || {}, d = input.directLink || {}, p = input.popunder || {}, s = input.socialBar || {};
  const next = {
    banners: {
      enabled: !!b.enabled,
      domain: /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(clean(b.domain)) ? clean(b.domain) : DEFAULTS.banners.domain,
      keys: Object.fromEntries(Object.keys(DEFAULTS.banners.keys).map(size => [size, bannerKey(b.keys?.[size])])),
    },
    directLink: { enabled: !!d.enabled, url: '', every: Math.min(500, Math.max(1, Math.round(Number(d.every) || 20))) },
    popunder: { enabled: !!p.enabled, src: scriptUrl(p.src), delayMinutes: Math.min(120, Math.max(0, Number(p.delayMinutes) || 0)) },
    socialBar: { enabled: !!s.enabled, src: scriptUrl(s.src) },
  };
  const link = clean(d.url);
  try { if (link) { const u = new URL(link); if (u.protocol === 'https:' || u.protocol === 'http:') next.directLink.url = u.href; } } catch {}

  if (next.banners.enabled && !Object.values(next.banners.keys).some(Boolean)) return { error: 'Banners: add at least one valid banner key (or paste the banner code).' };
  if (next.directLink.enabled && !next.directLink.url) return { error: 'Direct link: add a valid https link.' };
  if (next.popunder.enabled && !next.popunder.src) return { error: 'Popunder: paste the script tag or its https URL.' };
  if (next.socialBar.enabled && !next.socialBar.src) return { error: 'Social bar: paste the script tag or its https URL.' };

  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(next, null, 2));
  settings = next;
  io?.emit('ads', settings); // everyone online gets the change right away
  return { settings };
}

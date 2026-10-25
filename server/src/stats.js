// Daily totals for the owner (admin panel → Stats). Only counts are kept, never
// who did what: no nicknames, no messages, no IPs.
//   stats:<day>            hash  sessions, visitors, messages, groupMessages, groupsCreated, peakOnline
//   stats:<day>:countries  hash  country code -> sessions
//   stats:<day>:devices    set   one-way hashes of device ids, ONLY to count unique visitors;
//                                expires after 2 days
// Counters are buffered in memory and written every 30 s, so Redis load stays tiny.
import crypto from 'node:crypto';
import { config } from './config.js';
import { redis } from './store.js';

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: config.statsTimeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
export const today = (d = new Date()) => dayFmt.format(d); // YYYY-MM-DD
const K = { day: d => `stats:${d}`, countries: d => `stats:${d}:countries`, devices: d => `stats:${d}:devices` };
const KEEP = config.statsKeepDays * 86400;
// Salted with the (secret) admin token so stored values can't be matched back to a device id,
// yet stay stable across restarts so a visitor isn't counted twice in one day
const SALT = crypto.createHash('sha256').update(`visitors:${config.adminToken}`).digest('hex');
const hashDevice = id => crypto.createHash('sha256').update(SALT + id).digest('hex').slice(0, 20);

let buf = { counts: {}, countries: {}, devices: new Set(), peak: 0 };
let bufDay = today();

function roll() {
  const d = today();
  if (d !== bufDay) { flush().catch(console.error); bufDay = d; }
}
const inc = (field, n = 1) => { roll(); buf.counts[field] = (buf.counts[field] || 0) + n; };

/** Someone signed in with a nickname (a new session) */
export function session(user) {
  inc('sessions');
  buf.countries[user.country] = (buf.countries[user.country] || 0) + 1;
  buf.devices.add(hashDevice(user.deviceId));
}
export const message = () => inc('messages');
export const groupMessage = () => inc('groupMessages');
export const groupCreated = () => inc('groupsCreated');
export function online(n) { roll(); if (n > buf.peak) buf.peak = n; }

export async function flush() {
  const day = bufDay;
  const b = buf;
  buf = { counts: {}, countries: {}, devices: new Set(), peak: 0 };
  const m = redis.multi();
  for (const [f, n] of Object.entries(b.counts)) m.hincrby(K.day(day), f, n);
  for (const [c, n] of Object.entries(b.countries)) m.hincrby(K.countries(day), c, n);
  if (b.devices.size) m.sadd(K.devices(day), ...b.devices).expire(K.devices(day), 2 * 86400);
  m.expire(K.day(day), KEEP).expire(K.countries(day), KEEP);
  await m.exec();
  const visitors = await redis.scard(K.devices(day));
  const peak = Number((await redis.hget(K.day(day), 'peakOnline')) || 0);
  const write = redis.multi();
  if (visitors) write.hset(K.day(day), { visitors });
  if (b.peak > peak) write.hset(K.day(day), { peakOnline: b.peak });
  write.expire(K.day(day), KEEP);
  await write.exec();
}

const FIELDS = ['visitors', 'sessions', 'messages', 'groupMessages', 'groupsCreated', 'peakOnline'];

/** Last `days` days, oldest first (missing days are zeros), plus top countries over the range */
export async function daily(days = 30) {
  await flush();
  const out = [];
  const countries = {};
  const now = Date.now();
  for (let i = days - 1; i >= 0; i--) {
    const d = today(new Date(now - i * 86400000));
    if (out.at(-1)?.date === d) continue; // DST / time-zone edge
    const [h, c] = await Promise.all([redis.hgetall(K.day(d)), redis.hgetall(K.countries(d))]);
    out.push({ date: d, ...Object.fromEntries(FIELDS.map(f => [f, Number(h[f] || 0)])) });
    for (const [code, n] of Object.entries(c)) countries[code] = (countries[code] || 0) + Number(n);
  }
  const top = Object.entries(countries).sort((a, b) => b[1] - a[1]);
  return { timeZone: config.statsTimeZone, days: out, countries: top };
}

setInterval(() => flush().catch(console.error), 30000).unref();

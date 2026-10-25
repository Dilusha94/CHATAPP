// Moderation history, kept for config.historyKeepDays (default 1 year) and then deleted:
//   sessions     every sign-in: device, IP, nickname, gender, age, country, browser, start/end
//   reports_log  who reported whom, when and why (the conversation itself stays in Redis for 7 days)
//   bans_log     bans and unbans made in the admin panel
// Chat messages are NEVER stored here.
//
// Storage: PostgreSQL when DATABASE_URL is a postgres:// URL (e.g. aaPanel), otherwise PGlite
// (real PostgreSQL running inside Node, saved to server/data/history). Same SQL either way.
// Every write is fire-and-forget: if the database is down, chat keeps working.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id          bigserial PRIMARY KEY,
  user_id     text NOT NULL,
  device_id   text NOT NULL,
  ip          text,
  country     text,
  nick        text,
  gender      text,
  age         int,
  state       text,
  user_agent  text,
  started_at  timestamptz NOT NULL DEFAULT now(),
  ended_at    timestamptz,
  end_reason  text
);
CREATE INDEX IF NOT EXISTS sessions_device_idx ON sessions (device_id, started_at DESC);
CREATE INDEX IF NOT EXISTS sessions_ip_idx ON sessions (ip, started_at DESC);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_started_idx ON sessions (started_at);

CREATE TABLE IF NOT EXISTS reports_log (
  id               bigserial PRIMARY KEY,
  reporter_device  text,
  reporter_nick    text,
  reported_device  text NOT NULL,
  reported_nick    text,
  reported_ip      text,
  reason           text,
  in_group         text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reports_reported_idx ON reports_log (reported_device, created_at DESC);
CREATE INDEX IF NOT EXISTS reports_created_idx ON reports_log (created_at);

CREATE TABLE IF NOT EXISTS bans_log (
  id          bigserial PRIMARY KEY,
  device_id   text NOT NULL,
  action      text NOT NULL,          -- 'ban' | 'unban'
  reason      text,
  hours       real,
  nick        text,
  ip          text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bans_device_idx ON bans_log (device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bans_created_idx ON bans_log (created_at);
`;

let db = null;        // { query(sql, params) -> { rows } }
let ready = null;     // Promise of db
export let backend = 'none';

async function open() {
  const url = config.databaseUrl;
  if (/^postgres(ql)?:\/\//i.test(url)) {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({ connectionString: url, max: 5 });
    pool.on('error', e => console.error('[history] postgres:', e.message));
    backend = 'postgres';
    return { query: (sql, p) => pool.query(sql, p), exec: sql => pool.query(sql), close: () => pool.end() };
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const dir = url === 'memory' ? undefined
    : path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'history');
  if (dir) fs.mkdirSync(path.dirname(dir), { recursive: true });
  const lite = await PGlite.create(dir);
  backend = dir ? 'pglite' : 'pglite-memory';
  return { query: (sql, p) => lite.query(sql, p), exec: sql => lite.exec(sql), close: () => lite.close() };
}

export function initHistory() {
  ready ??= (async () => {
    db = await open();
    await db.exec(SCHEMA);
    await cleanup();
    setInterval(() => cleanup().catch(e => console.error('[history] cleanup:', e.message)), 6 * 3600 * 1000).unref();
    console.log(`[history] ${backend}, keeping ${config.historyKeepDays} days`);
    return db;
  })().catch(e => { console.error('[history] disabled:', e?.message || e); ready = null; db = null; });
  return ready;
}

/** Fire-and-forget write; never throws into the chat code */
function write(sql, params) {
  (async () => { await (ready || initHistory()); if (db) await db.query(sql, params); })()
    .catch(e => console.error('[history] write:', e.message));
}

export async function cleanup() {
  if (!db) return;
  const days = String(config.historyKeepDays);
  for (const [table, col] of [['sessions', 'started_at'], ['reports_log', 'created_at'], ['bans_log', 'created_at']]) {
    await db.query(`DELETE FROM ${table} WHERE ${col} < now() - ($1 || ' days')::interval`, [days]);
  }
}

const clip = (s, n) => (s == null ? null : String(s).slice(0, n));

export function sessionStarted(u) {
  write(`INSERT INTO sessions (user_id, device_id, ip, country, nick, gender, age, state, user_agent)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [u.id, u.deviceId, clip(u.ip, 64), u.country, u.nick, u.gender, u.age, clip(u.state, 40), clip(u.ua, 300)]);
}

export function sessionEnded(userId, reason) {
  write(`UPDATE sessions SET ended_at = now(), end_reason = $2 WHERE user_id = $1 AND ended_at IS NULL`, [userId, clip(reason, 20)]);
}

export function reported({ reporter, reported: r, reason, group }) {
  write(`INSERT INTO reports_log (reporter_device, reporter_nick, reported_device, reported_nick, reported_ip, reason, in_group)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [reporter.deviceId, reporter.nick, r.deviceId, r.nick, clip(r.ip, 64), clip(reason, 200), group ? clip(group.name, 30) : null]);
}

export function banned(deviceId, action, { reason = null, hours = null, nick = null, ip = null } = {}) {
  write(`INSERT INTO bans_log (device_id, action, reason, hours, nick, ip) VALUES ($1,$2,$3,$4,$5,$6)`,
    [deviceId, action, clip(reason, 200), hours, nick, clip(ip, 64)]);
}

/** Last known nick/IP for a device (for the ban log when the person is offline) */
export async function lastSeen(deviceId) {
  if (!(await (ready || initHistory()))) return null;
  const { rows } = await db.query(`SELECT nick, ip FROM sessions WHERE device_id = $1 ORDER BY started_at DESC LIMIT 1`, [deviceId]);
  return rows[0] || null;
}

/**
 * Everything known about a device and/or IP within the retention period.
 * Sessions of the device itself, plus other devices seen on the same IP(s).
 */
export async function lookup({ deviceId = '', ip = '' } = {}) {
  if (!(await (ready || initHistory()))) return { available: false };
  const dev = String(deviceId).slice(0, 64), addr = String(ip).slice(0, 64);
  const [own, shared, reports, bans] = await Promise.all([
    db.query(`SELECT nick, gender, age, country, state, ip, user_agent, started_at, ended_at, end_reason
              FROM sessions WHERE device_id = $1 ORDER BY started_at DESC LIMIT 200`, [dev]),
    // other devices that used any of this device's IPs (or the given IP)
    db.query(`SELECT device_id, ip, count(*)::int AS sessions, array_agg(DISTINCT nick) AS nicks, max(started_at) AS last_seen
              FROM sessions
              WHERE device_id <> $1 AND ip IS NOT NULL
                AND ip IN (SELECT ip FROM sessions WHERE device_id = $1 AND ip IS NOT NULL UNION SELECT NULLIF($2, ''))
              GROUP BY device_id, ip ORDER BY last_seen DESC LIMIT 50`, [dev, addr]),
    db.query(`SELECT reporter_nick, reported_nick, reason, in_group, created_at FROM reports_log
              WHERE reported_device = $1 ORDER BY created_at DESC LIMIT 50`, [dev]),
    db.query(`SELECT action, reason, hours, nick, created_at FROM bans_log
              WHERE device_id = $1 ORDER BY created_at DESC LIMIT 50`, [dev]),
  ]);
  const s = own.rows;
  const distinct = key => [...new Set(s.map(r => r[key]).filter(v => v != null && v !== ''))];
  return {
    available: true,
    keepDays: config.historyKeepDays,
    summary: {
      sessions: s.length,
      firstSeen: s.at(-1)?.started_at || null,
      nicks: distinct('nick'), genders: distinct('gender'), ages: distinct('age'),
      countries: distinct('country'), ips: distinct('ip'),
      reports: reports.rows.length, bans: bans.rows.filter(b => b.action === 'ban').length,
      otherDevicesOnSameIp: new Set(shared.rows.map(r => r.device_id)).size,
    },
    sessions: s, sharedIp: shared.rows, reports: reports.rows, bans: bans.rows,
  };
}

/** Raw query, for tests and maintenance scripts */
export async function query(sql, params) {
  if (!(await (ready || initHistory()))) throw new Error('history database not available');
  return db.query(sql, params);
}

export async function closeHistory() { try { await db?.close(); } catch {} }

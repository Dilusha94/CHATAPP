// Moderation history tests: 1) retention clean-up (no server needed), 2) end-to-end against the test server.
// Run as part of `npm test` (after smoke-test.js / group-test.js).
import { io } from 'socket.io-client';
process.env.DATABASE_URL = 'memory';      // the unit part uses its own in-memory database
process.env.HISTORY_KEEP_DAYS = '365';
const history = await import('../src/history.js');

const URL = process.env.URL || 'http://127.0.0.1:3000';
const TOKEN = process.env.ADMIN_TOKEN || 'change-me';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
const check = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) fails++; };

console.log('\nHistory tests\n');

// ---------- 1. retention ----------
await history.initHistory();
await history.query(`INSERT INTO sessions (user_id, device_id, ip, nick, started_at) VALUES
  ('old', 'dev-old', '9.9.9.9', 'Ancient', now() - interval '400 days'),
  ('new', 'dev-new', '9.9.9.9', 'Recent',  now() - interval '30 days')`);
await history.query(`INSERT INTO bans_log (device_id, action, created_at) VALUES ('dev-old', 'ban', now() - interval '366 days')`);
await history.cleanup();
const left = (await history.query(`SELECT nick FROM sessions`)).rows.map(r => r.nick);
check('records older than 1 year are deleted', left.length === 1 && left[0] === 'Recent');
check('old bans are deleted too', (await history.query(`SELECT count(*)::int AS n FROM bans_log`)).rows[0].n === 0);
await history.closeHistory();

// ---------- 2. end to end ----------
const call = (s, ev, p) => new Promise(r => s.emit(ev, p, r));
// The server reads the visitor IP and country from the headers Nginx/Cloudflare set in production
const connect = (ip, country) => new Promise(r => {
  const s = io(URL, { transports: ['websocket'], forceNew: true, extraHeaders: { 'x-real-ip': ip, 'cf-ipcountry': country } });
  s.on('connect', () => r(s));
});
const admin = (path, opts = {}) => fetch(`${URL}/admin/api${path}`, { ...opts, headers: { 'content-type': 'application/json', 'x-admin-token': TOKEN, ...opts.headers } });
const tag = Date.now().toString(36).slice(-5);
const dev = `hist-dev-${tag}`, other = `hist-oth-${tag}`;
const join = (s, nick, gender, age, deviceId) => call(s, 'session:join', { nick, gender, age, country: 'LK', deviceId, ageConfirmed: true, privacyAccepted: true });

// one person, three visits: new name, gender, country and IP each time
let s = await connect('203.0.113.7', 'LK');
check('visit 1 joins', (await join(s, `Kasun${tag}`, 'm', 25, dev)).ok);
await call(s, 'session:logout'); s.disconnect();
s = await connect('198.51.100.20', 'GB');
check('visit 2 joins', (await join(s, `Nimali${tag}`, 'f', 22, dev)).ok);
await call(s, 'session:logout'); s.disconnect();
const bad = await connect('203.0.113.7', 'US');
const jb = await join(bad, `Ruwan${tag}`, 'm', 30, dev);
check('visit 3 joins (country from Cloudflare header)', jb.ok && jb.user.country === 'US');

// someone else on the same (shared) IP reports them
const rep = await connect('203.0.113.7', 'LK');
await join(rep, `Sunil${tag}`, 'm', 28, other);
await call(rep, 'msg:send', { to: jb.user.id, text: 'hello' });
check('report filed', (await call(rep, 'report', { id: jb.user.id, reason: 'Harassment or abuse' })).ok);
await sleep(400);

check('history needs the admin token', (await fetch(`${URL}/admin/api/history?device=${dev}`)).status === 401);
const reports = await (await admin('/reports')).json();
const mine = reports.find(r => r.reported.deviceId === dev);
check('report shows the reported IP', mine?.reported.ip === '203.0.113.7');

const h = await (await admin(`/history?device=${dev}&ip=203.0.113.7`)).json();
const sm = h.summary || {};
check('history is available', h.available === true);
check('3 sign-ins on record', sm.sessions === 3 && h.sessions[0].nick === `Ruwan${tag}`);
check('all 3 nicknames listed', sm.nicks?.length === 3);
check('gender change detected', sm.genders?.length === 2);
check('3 countries (VPN hint)', sm.countries?.length === 3);
check('2 IPs', sm.ips?.length === 2);
check('ended visits have logout reason', h.sessions.filter(x => x.end_reason === 'logout').length === 2);
check('report counted', sm.reports === 1 && h.reports[0].reason === 'Harassment or abuse');
check('other device on same IP found', sm.otherDevicesOnSameIp === 1 && h.sharedIp[0].nicks.includes(`Sunil${tag}`));

await admin('/ban', { method: 'POST', body: JSON.stringify({ deviceId: dev, reason: 'Harassment', hours: 24 }) });
await admin('/unban', { method: 'POST', body: JSON.stringify({ deviceId: dev }) });
await sleep(300);
const h2 = await (await admin(`/history?device=${dev}`)).json();
check('ban and unban logged', h2.bans.length === 2 && h2.bans.some(b => b.action === 'ban' && b.reason === 'Harassment'));
check('ban ended the session', h2.sessions[0].end_reason === 'banned');

for (const x of [bad, rep]) { if (x.connected) await call(x, 'session:logout'); x.disconnect(); }
console.log(fails ? `\n${fails} FAILED` : '\nALL HISTORY TESTS PASSED');
process.exit(fails ? 1 : 0);

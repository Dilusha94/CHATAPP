// Image sharing + credits tests. Run against a running test server started like the other tests, plus
//   AD_MIN_SECONDS=1 AD_CAP_IP=1000 IMAGE_SWEEP_MS=1000 ADMIN_TOKEN=test UPLOAD_DIR=<dir> REPORTED_DIR=<dir2>
// and run this script with the same UPLOAD_DIR / REPORTED_DIR / ADMIN_TOKEN in its environment.
import { io } from 'socket.io-client';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
const URL = process.env.URL || 'http://127.0.0.1:3000';
const CLIENT = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const ADMIN = process.env.ADMIN_TOKEN || 'test';
const UPLOADS = process.env.UPLOAD_DIR, REPORTED = process.env.REPORTED_DIR;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const call = (s, ev, p) => new Promise(r => s.emit(ev, p, r));
const connect = () => new Promise(r => { const s = io(URL, { transports: ['websocket'] }); s.on('connect', () => r(s)); });
const next = (s, ev, pred = () => true) => new Promise(r => { const h = d => { if (pred(d)) { s.off(ev, h); r(d); } }; s.on(ev, h); });
let fails = 0;
const check = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) fails++; };

const img = (w, h, fmt = 'jpeg') => sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 60, b: 40 } } })[fmt]().toBuffer();
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const hdr = u => ({ 'x-user-id': u.user.id, 'x-token': u.token });
const upload = (u, body, headers = hdr(u)) => fetch(`${URL}/upload`, { method: 'POST', headers: { 'content-type': 'application/octet-stream', ...headers }, body });
const post = (u, p, body = {}) => fetch(`${URL}/api/ads/${p}`, { method: 'POST', headers: { 'content-type': 'application/json', ...hdr(u) }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, ...(await r.json()) }));
const admin = p => fetch(`${URL}/admin/api${p}`, { headers: { 'x-admin-token': ADMIN } });

console.log('\nImage sharing + credit tests\n');
const tag = Date.now() % 100000;
const join = async (n, i, device = `img-device-${n}-${Date.now()}`) => {
  const s = await connect();
  const r = await call(s, 'session:join', { nick: `Img${n}x${tag}`, gender: i ? 'f' : 'm', age: 25, country: 'LK', deviceId: device, ageConfirmed: true, privacyAccepted: true });
  setInterval(() => s.emit('activity'), 1000); // stay active even when the server uses short idle timers
  return { s, user: r.user, token: r.token, credits: r.credits };
};
const logout = async u => { u.s.emit('session:logout', {}, () => {}); await sleep(400); };
/** one full rewarded-ad cycle: start, wait the minimum time, claim */
const earn = async u => { const st = await post(u, 'start'); if (!st.ok) return st; await sleep(st.seconds * 1000 + 150); return post(u, 'verify-reward', { nonce: st.nonce }); };

const a = await join('A', 0), b = await join('B', 1), c = await join('C', 0);
check('new users start with 0 credits', a.credits === 0);

// ---- credit gate ----
const PHOTO = await img(3000, 2000);
check('upload refused with 0 credits (402)', (await upload(a, PHOTO)).status === 402);
check('wrong token rejected (401)', (await upload(a, PHOTO, { 'x-user-id': a.user.id, 'x-token': 'nope' })).status === 401);

const st = await post(a, 'start');
check('ad session starts (server tells the countdown)', st.ok && st.seconds === 1 && /^[a-f0-9]{24}$/.test(st.nonce));
const early = await post(a, 'verify-reward', { nonce: st.nonce });
check('claim before the timer ends is refused', early.status === 400 && early.wait >= 0);
check('wrong nonce refused', (await post(a, 'verify-reward', { nonce: 'f'.repeat(24) })).status === 400);
await sleep(1200);
const [r1, r2] = await Promise.all([post(a, 'verify-reward', { nonce: st.nonce }), post(a, 'verify-reward', { nonce: st.nonce })]);
check('claim after the timer: +2 credits, exactly once (parallel double-claim)', [r1, r2].filter(r => r.ok).length === 1 && [r1, r2].find(r => r.ok).credits === 2);
check('replaying a claimed nonce refused', (await post(a, 'verify-reward', { nonce: st.nonce })).status === 400);
check('claim without logging in refused', (await fetch(`${URL}/api/ads/verify-reward`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status === 401);

// ---- compression ----
check('SVG / script rejected (415)', (await upload(a, SVG)).status === 415);
check('fake JPEG that does not decode rejected (415)', (await upload(a, Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]))).status === 415);
check('oversized rejected (413)', (await upload(a, Buffer.alloc(3 * 1024 * 1024, 0xff))).status === 413);

const res = await upload(a, PHOTO);
const up = await res.json();
check('valid photo uploaded as .webp', res.ok && /^[a-f0-9]{24}\.webp$/.test(up.file));
const url = `${URL}/uploads/${a.user.id}/${up.file}`;
const got = await fetch(url);
const stored = Buffer.from(await got.arrayBuffer());
const meta = await sharp(stored).metadata();
check('served as image/webp with nosniff', got.ok && got.headers.get('content-type') === 'image/webp' && got.headers.get('x-content-type-options') === 'nosniff');
check('3000x2000 photo stored as WebP at 1280x853', meta.format === 'webp' && meta.width === 1280 && meta.height === 853);
check('stored file is smaller than the original', stored.length < PHOTO.length);
const small = await (await upload(a, await img(200, 100, 'png'))).json();
const smallMeta = await sharp(Buffer.from(await (await fetch(`${URL}/uploads/${a.user.id}/${small.file}`)).arrayBuffer())).metadata();
check('small image is not enlarged', smallMeta.width === 200 && smallMeta.height === 100);
check('path traversal blocked', (await fetch(`${URL}/uploads/${a.user.id}/..%2F..%2Fpackage.json`)).status === 404);

// ---- CORS ----
const preflight = path => fetch(`${URL}${path}`, { method: 'OPTIONS', headers: { origin: CLIENT, 'access-control-request-method': 'POST', 'access-control-request-headers': 'x-user-id,x-token,content-type' } });
const p1 = await preflight('/upload'), p2 = await preflight('/api/ads/start');
check('CORS preflight allowed for the client origin (upload + ads)', [p1, p2].every(p => p.status === 204 && p.headers.get('access-control-allow-origin') === CLIENT));
const evil = await fetch(`${URL}/upload`, { method: 'OPTIONS', headers: { origin: 'https://evil.example.com' } });
check('CORS not granted to other origins', !evil.headers.get('access-control-allow-origin'));

// ---- sending costs a credit (A earned 2) ----
const arrived = next(b.s, 'msg:new');
const sent = await call(a.s, 'msg:send', { to: b.user.id, text: '', image: up.file, cid: 'i1' });
const m = await arrived;
check('image message delivered (no text needed), costs 1 credit', sent.ok && m.image === up.file && m.text === '' && sent.credits === 1);
check('empty message without image still rejected', !(await call(a.s, 'msg:send', { to: b.user.id, text: '  ', cid: 'i2' })).ok);
check('cannot send someone else\'s image', !(await call(b.s, 'msg:send', { to: a.user.id, text: '', image: up.file, cid: 'i3' })).ok);
check('fake file name rejected', !(await call(a.s, 'msg:send', { to: b.user.id, text: '', image: '../../etc/passwd', cid: 'i4' })).ok);
check('plain text costs nothing', (await call(a.s, 'msg:send', { to: b.user.id, text: 'hi', cid: 'i5' })).credits === 1);
const hist = await call(b.s, 'chat:history', { with: a.user.id });
check('image kept in chat history', hist.messages.some(x => x.image === up.file));

// group (A has 1 credit left)
const g = await call(a.s, 'group:create', { name: 'Photo club' });
await call(c.s, 'group:join', { gid: g.group.id });
const gres = await (await upload(a, await img(800, 600))).json();
const garrived = next(c.s, 'group:msg', d => d.msg.image);
const gsent = await call(a.s, 'group:send', { gid: g.group.id, text: 'look', image: gres.file, cid: 'g1' });
check('image sent in a group, costs 1 credit', gsent.ok && (await garrived).msg.image === gres.file && gsent.credits === 0);
await sleep(3100); // message rate limit window
const nocred = await call(a.s, 'group:send', { gid: g.group.id, text: '', image: gres.file, cid: 'g2' });
check('no credits left: image send refused (no_credits)', !nocred.ok && nocred.error === 'no_credits');
check('no credits left: upload refused again', (await upload(a, PHOTO)).status === 402);

// ---- a report keeps the pictures for the moderators ----
await earn(b);
const bu = await (await upload(b, await img(640, 480))).json();
const bm = await call(b.s, 'msg:send', { to: a.user.id, text: 'pic', image: bu.file, cid: 'b1' });
check('B sends A a picture', bm.ok);
check('report filed', (await call(a.s, 'report', { id: b.user.id, reason: 'Sexual content' })).ok);
const reports = await (await admin('/reports')).json();
const mine = reports.find(r => r.reporter.id === a.user.id && r.reported.id === b.user.id);
const evidence = mine ? mine.messages.filter(x => x.image) : [];
check('report contains both pictures of the chat', evidence.length === 2);
const evUrl = x => `/reports/${mine.id}/image/${x.from}_${x.image}`;
check('moderator can view reported images (admin token)', (await admin(evUrl(evidence[0]))).ok);
check('reported images are NOT public (no admin token => 401)', (await fetch(`${URL}/admin/api${evUrl(evidence[0])}`)).status === 401);
if (REPORTED) check('copied into the reported-images folder', fs.readdirSync(path.join(REPORTED, mine.id)).length === 2);

// ---- 24-hour cleanup job ----
if (UPLOADS) {
  const f = path.join(UPLOADS, a.user.id, up.file);
  const old = new Date(Date.now() - 25 * 3600 * 1000);
  fs.utimesSync(f, old, old);
  await sleep(2500); // the cleanup job runs every second in the test server
  check('image older than 24 h deleted by the cleanup job', (await fetch(url)).status === 404 && !fs.existsSync(f));
  check('newer image is kept', (await fetch(`${URL}/uploads/${a.user.id}/${gres.file}`)).ok);
  check('old image still kept in the report copy', (await admin(evUrl(evidence.find(x => x.image === up.file) || evidence[0]))).ok);
}

// ---- deletion with the user ----
await logout(a);
check('images deleted when the user logs out', (await fetch(`${URL}/uploads/${a.user.id}/${gres.file}`)).status === 404);
check('...but the reported copies remain for moderators', (await admin(evUrl(evidence[0]))).ok && (await admin(evUrl(evidence[1]))).ok);
await fetch(`${URL}/admin/api/reports/${mine.id}`, { method: 'DELETE', headers: { 'x-admin-token': ADMIN } });
check('dismissing the report deletes its pictures', (await admin(evUrl(evidence[0]))).status === 404);
if (REPORTED) {
  // 7-day purge: a report folder older than the report TTL is removed by the cleanup job
  const dir = path.join(REPORTED, 'a'.repeat(16));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'x'), 'x');
  const old8 = new Date(Date.now() - 8 * 86400 * 1000);
  fs.utimesSync(dir, old8, old8);
  await sleep(2500);
  check('reported images older than 7 days are purged', !fs.existsSync(dir));
}

// ---- daily limit: 5 rewarded views per device, counted per device (not per user) ----
const dev = `img-cap-device-${Date.now()}`;
const d = await join('D', 0, dev);
let ok = 0, last;
for (let i = 0; i < 6; i++) { last = await earn(d); if (last.ok) ok++; }
check('daily cap: 5 rewarded views allowed, the 6th refused (429)', ok === 5 && last.status === 429 && last.limit === true);
await logout(d);
const d2 = await join('D2', 1, dev);
check('log out and back in on the same device: still capped', (await post(d2, 'start')).status === 429);
const other = await join('E', 1, `img-cap-other-${Date.now()}`);
check('a different device is not affected', (await earn(other)).ok);

for (const u of [b, c, d2, other]) u.s.emit('session:logout', {}, () => {});
await sleep(300);
console.log(fails ? `\n${fails} FAILED` : '\nAll image + credit tests passed');
process.exit(fails ? 1 : 0);

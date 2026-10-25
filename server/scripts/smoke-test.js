// Run with the server started using IDLE_SECONDS=4 SWEEP_INTERVAL_MS=1000 DISCONNECT_GRACE_SECONDS=2
import { io } from 'socket.io-client';
import Redis from 'ioredis';
const URL = process.env.URL || 'http://127.0.0.1:3000';
const memoryMode = (await fetch(`${URL}/dev/redis/dbsize`).catch(() => null))?.ok;
const real = memoryMode ? null : new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');
const viaHttp = cmd => async arg => (await (await fetch(`${URL}/dev/redis/${cmd}${arg ? '?arg=' + encodeURIComponent(arg) : ''}`)).json()).result;
const redis = memoryMode ? { keys: viaHttp('keys'), scard: viaHttp('scard'), zcard: viaHttp('zcard') } : real;
console.log(`Testing ${URL} using ${memoryMode ? 'in-memory store' : 'Redis'}\n`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const call = (s, ev, p) => new Promise(r => s.emit(ev, p, r));
const connect = () => new Promise(r => { const s = io(URL, { transports: ['websocket'] }); s.on('connect', () => r(s)); });
let fails = 0;
const check = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) fails++; };
const join = (s, nick, extra = {}) => call(s, 'session:join', { nick, gender: 'm', age: 25, country: 'LK', deviceId: 'dev-' + nick.toLowerCase().padEnd(8, 'x'), ageConfirmed: true, privacyAccepted: true, ...extra });

const a = await connect(), b = await connect();
check('under-18 rejected', /18/.test((await join(a, 'Sunil', { age: 16 })).error));
check('missing 18+ confirm rejected', !(await join(a, 'Kid2', { ageConfirmed: false })).ok);
check('privacy policy must be accepted', /privacy policy/.test((await join(a, 'Nopriv', { privacyAccepted: false })).error));
check('bad-word nickname rejected', /isn’t allowed/.test((await join(a, 'B1g_Ass')).error));
const ja = await join(a, 'Alice', { gender: 'f' });
const jb = await join(b, 'Bob');
check('join ok', ja.ok && jb.ok);
const c = await connect();
check('duplicate nickname rejected', !(await join(c, 'alice')).ok);

const got = new Promise(r => b.once('msg:new', r));
const sent = await call(a, 'msg:send', { to: jb.user.id, text: 'hello visit www.spam.com', cid: 'c1' });
const recv = await got;
check('message delivered', sent.ok && recv.text.startsWith('hello'));
check('link removed', recv.text.includes('[link removed]'));

const hist = await call(b, 'chat:history', { with: ja.user.id });
check('history kept on server (back button bug)', hist.messages.length === 1);

const s1 = await call(a, 'search', { nick: 'bo' });
const s2 = await call(a, 'search', { gender: 'f' });
const s3 = await call(a, 'search', { ageMin: 30 });
check('search by nick', s1.results.length === 1 && s1.results[0].nick === 'Bob');
check('search excludes self / wrong gender', s2.results.length === 0);
check('search by age range', s3.results.length === 0);

let limited = 0;
for (let i = 0; i < 8; i++) { const r = await call(a, 'msg:send', { to: jb.user.id, text: 'x' + i }); if (!r.ok) limited++; }
check('rate limit kicks in (no ban)', limited >= 3);

await call(b, 'block', { id: ja.user.id });
await sleep(3100);
const blocked = await call(a, 'msg:send', { to: jb.user.id, text: 'hi again' });
check('block works', !blocked.ok);

const rep = await call(b, 'report', { id: ja.user.id, reason: 'spam' });
check('report saved', rep.ok && (await redis.zcard('reports:index')) >= 1);

// resume after network drop
const tokenB = jb.token;
b.disconnect();
await sleep(500);
const b2 = await connect();
const res = await call(b2, 'session:resume', { userId: jb.user.id, token: tokenB });
check('resume after reconnect keeps session', res.ok && res.partners.includes(ja.user.id));

// logout = hard delete
const left = new Promise(r => b2.once('partner:left', r));
await call(a, 'session:logout');
await left;
const keys = await redis.keys(`*${ja.user.id}*`);
check('logout hard-deletes user + chats', keys.length === 0);

// idle auto logout
const ended = new Promise(r => b2.once('session:ended', r));
const e = await ended;
check('idle auto-logout fires', e.reason === 'idle');
await sleep(300);
check('idle user hard-deleted', (await redis.keys(`*${jb.user.id}*`)).length === 0 && (await redis.scard('online:index')) === 0);

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);

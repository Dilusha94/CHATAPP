// Group chat tests. Run after smoke-test.js against the same test server
// (IDLE_SECONDS=4 …), so every step here is quick.
import { io } from 'socket.io-client';
import Redis from 'ioredis';
const URL = process.env.URL || 'http://127.0.0.1:3000';
const CLIENT = process.env.CLIENT_ORIGIN || 'http://localhost:5173'; // must be in the server's CLIENT_ORIGIN
const memoryMode = (await fetch(`${URL}/dev/redis/dbsize`).catch(() => null))?.ok;
const viaHttp = cmd => async arg => (await (await fetch(`${URL}/dev/redis/${cmd}${arg ? '?arg=' + encodeURIComponent(arg) : ''}`)).json()).result;
const redis = memoryMode ? { keys: viaHttp('keys') } : new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const call = (s, ev, p) => new Promise(r => s.emit(ev, p, r));
const connect = () => new Promise(r => { const s = io(URL, { transports: ['websocket'] }); s.on('connect', () => r(s)); });
const next = (s, ev, pred = () => true) => new Promise(r => { const h = d => { if (pred(d)) { s.off(ev, h); r(d); } }; s.on(ev, h); });
let fails = 0;
const check = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) fails++; };

console.log('\nGroup chat tests\n');
// 11 people: u[0] creates the group, u[1..9] fill it to 10, u[10] is the 11th
const u = [], me = [];
for (let i = 0; i < 11; i++) {
  const s = await connect();
  const r = await call(s, 'session:join', { nick: `Grp${i}x${Date.now() % 10000}`, gender: i % 2 ? 'f' : 'm', age: 25, country: 'LK', deviceId: `grp-device-${i}-${Date.now()}`, ageConfirmed: true, privacyAccepted: true });
  u.push(s); me.push(r.user);
}

check('group name too short rejected', !(await call(u[0], 'group:create', { name: 'ab' })).ok);
check('bad-word group name rejected', /isn’t allowed/.test((await call(u[0], 'group:create', { name: 'F_u_c_k club' })).error));
const created = await call(u[0], 'group:create', { name: 'Weekend Plans' });
const gid = created.group?.id;
check('create group (creator is admin)', created.ok && created.group.admin === me[0].id && /^[A-Za-z0-9]{10}$/.test(gid));

// invite links: our own is allowed in private chat, any other link is still removed
const got = next(u[2], 'msg:new');
await call(u[1], 'msg:send', { to: me[2].id, text: `join us ${CLIENT}/?g=${gid}` });
check('own invite link allowed in chat', (await got).text.includes(`${CLIENT}/?g=${gid}`));
const got2 = next(u[2], 'msg:new');
await call(u[1], 'msg:send', { to: me[2].id, text: `https://evil.example.com/?g=${gid}` });
check('other links still removed', (await got2).text.includes('[link removed]'));

const info = await call(u[5], 'group:info', { gid });
check('invite card info (name + size)', info.ok && info.info.name === 'Weekend Plans' && info.info.count === 1 && info.info.max === 10);

let joinedOk = true;
for (let i = 1; i <= 9; i++) joinedOk = (await call(u[i], 'group:join', { gid })).ok && joinedOk;
check('9 more people join (10 total)', joinedOk && (await call(u[0], 'group:info', { gid })).info.count === 10);
const full = await call(u[10], 'group:join', { gid });
check('11th person rejected (group full)', !full.ok && /full/i.test(full.error));

const recv = next(u[5], 'group:msg', d => d.msg.from === me[0].id);
const sent = await call(u[0], 'group:send', { gid, text: 'Hi everyone', cid: 'g1' });
const m = await recv;
check('group message delivered to members', sent.ok && m.gid === gid && m.msg.text === 'Hi everyone' && m.msg.fromUser.nick === me[0].nick);
check('non-member cannot read history', !(await call(u[10], 'group:history', { gid })).ok);
const hist = await call(u[3], 'group:history', { gid });
check('member can read history', hist.ok && hist.messages.some(x => x.text === 'Hi everyone'));

check('non-admin cannot remove people', !(await call(u[1], 'group:kick', { gid, id: me[2].id })).ok);
const removed = next(u[2], 'group:removed');
const kick = await call(u[0], 'group:kick', { gid, id: me[2].id });
check('admin removes a member', kick.ok && (await removed).gid === gid);
check('removed person cannot rejoin', !(await call(u[2], 'group:join', { gid })).ok);
check('free seat can be taken again', (await call(u[10], 'group:join', { gid })).ok);

const adminChange = next(u[3], 'group:update', d => d.group.admin !== me[0].id);
await call(u[0], 'group:leave', { gid });
check('admin leaves -> longest member becomes admin', (await adminChange).group.admin === me[1].id);

const logoutUpdate = next(u[3], 'group:update', d => !d.group.members.some(x => x.id === me[4].id));
await call(u[4], 'session:logout');
check('logout removes you from your groups', !!(await logoutUpdate));

for (const i of [1, 3, 5, 6, 7, 8, 9, 10]) await call(u[i], 'group:leave', { gid });
await sleep(200);
check('last person leaves -> group deleted', !(await call(u[3], 'group:info', { gid })).ok);
check('group data hard-deleted', (await redis.keys(`*${gid}*`)).length === 0);

for (const s of u) { if (s.connected) await call(s, 'session:logout'); s.disconnect(); }
console.log(fails ? `\n${fails} FAILED` : '\nALL GROUP TESTS PASSED');
process.exit(fails ? 1 : 0);

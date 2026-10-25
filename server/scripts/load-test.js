// Simulates N concurrent users. Usage: URL=https://chat.yoursite.lk N=3000 DURATION=60 node scripts/load-test.js
// Run it from a DIFFERENT machine than the server for realistic numbers.
import { io } from 'socket.io-client';
const URL = process.env.URL || 'http://127.0.0.1:3000';
const N = Number(process.env.N || 3000);
const DURATION = Number(process.env.DURATION || 60) * 1000;
const call = (s, ev, p) => new Promise(r => s.timeout(10000).emit(ev, p, (err, res) => r(err ? { ok: false, error: 'timeout' } : res)));

const clients = [];
let joined = 0, sent = 0, received = 0, failed = 0;
const lat = [];

for (let i = 0; i < N; i++) {
  const s = io(URL, { transports: ['websocket'], reconnection: false, forceNew: true });
  s.on('msg:new', m => { received++; if (m.cid) lat.push(Date.now() - Number(m.cid)); });
  s.on('connect', async () => {
    const r = await call(s, 'session:join', { nick: `load${i}`, gender: i % 2 ? 'm' : 'f', age: 18 + (i % 50), country: 'LK', deviceId: `loadtest-${i}`, ageConfirmed: true, privacyAccepted: true });
    if (r.ok) { s.data = r.user; joined++; } else failed++;
  });
  s.on('connect_error', () => failed++);
  clients.push(s);
  if (i % 200 === 0) await new Promise(r => setTimeout(r, 100)); // ramp up
}

const start = Date.now();
const timer = setInterval(() => {
  // ~1 message per user every 10 seconds = 300 msg/s at 3000 users
  const batch = Math.ceil(joined / 10);
  for (let k = 0; k < batch; k++) {
    const a = clients[Math.floor(Math.random() * N)], b = clients[Math.floor(Math.random() * N)];
    if (!a.data || !b.data || a === b) continue;
    sent++;
    a.emit('msg:send', { to: b.data.id, text: 'load test message', cid: String(Date.now()) });
  }
  lat.sort((x, y) => x - y);
  const p = q => lat.length ? lat[Math.floor(lat.length * q)] : 0;
  console.log(`t=${Math.round((Date.now() - start) / 1000)}s joined=${joined} failed=${failed} sent=${sent} received=${received} p50=${p(0.5)}ms p95=${p(0.95)}ms p99=${p(0.99)}ms`);
  lat.length = 0;
  if (Date.now() - start > DURATION) {
    clearInterval(timer);
    for (const c of clients) { c.emit('session:logout'); c.close(); }
    setTimeout(() => process.exit(0), 2000);
  }
}, 1000);

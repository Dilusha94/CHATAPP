import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { config } from './config.js';
import { redis, users, usingMemory } from './store.js';
import { setupSocket, restoreFromRedis } from './socket.js';
import { admin } from './admin.js';
import { flush as flushStats } from './stats.js';
import { initHistory, closeHistory } from './history.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

// The chat server (chat.yoursite.lk) is not a website: keep it out of search results
app.use((_req, res, next) => { res.set('X-Robots-Tag', 'noindex, nofollow'); next(); });
app.get('/robots.txt', (_req, res) => res.type('text/plain').send('User-agent: *\nDisallow: /\n'));

app.get('/health', async (_req, res) => {
  try { await redis.ping(); res.json({ ok: true, online: users.size }); }
  catch { res.status(500).json({ ok: false }); }
});
app.use('/admin/api', admin);
// Test-only: lets the smoke test inspect stored keys when there is no real Redis
if (usingMemory) {
  const allowed = new Set(['keys', 'scard', 'zcard', 'flushall', 'dbsize']);
  app.get('/dev/redis/:cmd', async (req, res) => {
    if (!allowed.has(req.params.cmd)) return res.status(400).json({ error: 'not allowed' });
    res.json({ result: await redis[req.params.cmd](...(req.query.arg ? [String(req.query.arg)] : [])) });
  });
}
app.use('/admin', express.static(path.join(__dirname, '..', 'public')));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: config.clientOrigin, credentials: true },
  transports: ['websocket', 'polling'],
  pingInterval: 25000,
  pingTimeout: 20000,
  maxHttpBufferSize: 10_000,            // 10 KB per packet is plenty for text chat
  perMessageDeflate: false,             // saves a lot of CPU/RAM at 3k sockets
  connectionStateRecovery: { maxDisconnectionDuration: 2 * 60 * 1000 },
});

setupSocket(io);
await initHistory();

const restored = await restoreFromRedis();
server.listen(config.port, '127.0.0.1', () => {
  console.log(`chat server on :${config.port} (restored ${restored} users)`);
});

const shutdown = async () => { await flushStats().catch(() => {}); await closeHistory(); io.close(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 5000); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

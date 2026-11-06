// Image credits earned by watching a rewarded ad. 1 credit = 1 picture.
//
//   POST /api/ads/start          -> { ok, nonce, seconds, viewsLeft }   the ad starts; the server notes the time
//   POST /api/ads/verify-reward  { nonce } -> { ok, credits, viewsLeft } only after `seconds` really passed
//
// The server cannot see inside the ad network, so what it proves is time: the claim is refused unless the
// minimum time passed since /start (server clock), each start can be claimed once, and every device and
// IP has a daily limit. Both limits are counted per day (UTC) in Redis, not on the user, because users
// are deleted on logout and could otherwise log out and in again for unlimited views.
import express from 'express';
import crypto from 'node:crypto';
import { config } from './config.js';
import { redis, K } from './store.js';
import { cors, authUser } from './images.js';
import { creditGateOn } from './ads.js';

export const credits = express.Router();

let io = null;
export const setCreditsIo = server => { io = server; };

const today = () => new Date().toISOString().slice(0, 10);

/** Spend 1 credit. The check and the subtraction happen in one synchronous step, so two fast sends
 *  can never both use the last credit. */
export async function spendCredit(u) {
  if (u.credits < 1) return false;
  u.credits -= 1;
  await redis.hincrby(K.user(u.id), 'credits', -1).catch(() => {});
  return true;
}

export async function refundCredit(u) {
  u.credits += 1;
  await redis.hincrby(K.user(u.id), 'credits', 1).catch(() => {});
}

async function viewsLeft(u) {
  const h = await redis.hgetall(K.adViews(today()));
  const dev = Number(h[`d:${u.deviceId}`]) || 0;
  const ip = Number(h[`i:${u.ip}`]) || 0;
  return Math.max(0, Math.min(config.adCapDevice - dev, config.adCapIp - ip));
}

const LIMIT_MSG = 'Daily limit reached. Come back tomorrow for more image credits.';

credits.use(cors); // answers the browser preflight for every route below
credits.use(express.json({ limit: '1kb' }));

credits.post('/start', async (req, res) => {
  try {
    const u = authUser(req);
    if (!u) return res.status(401).json({ ok: false, error: 'not_joined' });
    if (!creditGateOn()) return res.status(400).json({ ok: false, error: 'Images are free right now. No ad needed.' });
    const left = await viewsLeft(u);
    if (left < 1) return res.status(429).json({ ok: false, error: LIMIT_MSG, limit: true });
    const nonce = crypto.randomBytes(12).toString('hex');
    await redis.set(K.adSession(u.id), JSON.stringify({ nonce, t: Date.now() }), 'EX', config.adSessionSeconds);
    res.json({ ok: true, nonce, seconds: config.adMinSeconds, viewsLeft: left });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

credits.post('/verify-reward', async (req, res) => {
  try {
    const u = authUser(req);
    if (!u) return res.status(401).json({ ok: false, error: 'not_joined' });
    const nonce = String(req.body?.nonce || '');
    const raw = await redis.get(K.adSession(u.id));
    const session = raw ? JSON.parse(raw) : null;
    if (!session || !nonce || session.nonce !== nonce) {
      return res.status(400).json({ ok: false, error: 'This ad session expired. Please start again.' });
    }
    const wait = config.adMinSeconds * 1000 - (Date.now() - session.t);
    if (wait > 0) return res.status(400).json({ ok: false, error: 'Please keep the ad open until the timer ends.', wait: Math.ceil(wait / 1000) });

    // One claim per start: whoever deletes the session first wins (a second, parallel claim gets 0)
    if ((await redis.del(K.adSession(u.id))) !== 1) return res.status(400).json({ ok: false, error: 'This reward was already claimed.' });

    const key = K.adViews(today());
    const dev = await redis.hincrby(key, `d:${u.deviceId}`, 1);
    const ip = await redis.hincrby(key, `i:${u.ip}`, 1);
    await redis.expire(key, 2 * 86400);
    if (dev > config.adCapDevice || ip > config.adCapIp) {
      await redis.hincrby(key, `d:${u.deviceId}`, -1);
      await redis.hincrby(key, `i:${u.ip}`, -1);
      return res.status(429).json({ ok: false, error: LIMIT_MSG, limit: true });
    }

    u.credits += config.adRewardCredits;
    await redis.hincrby(K.user(u.id), 'credits', config.adRewardCredits);
    io?.to(`u:${u.id}`).emit('credits', { credits: u.credits }); // my other tabs
    res.json({ ok: true, credits: u.credits, added: config.adRewardCredits, viewsLeft: await viewsLeft(u) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// eslint-disable-next-line no-unused-vars
credits.use((err, _req, res, _next) => res.status(400).json({ ok: false, error: 'Bad request' }));

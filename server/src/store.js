// Redis data layer. Redis is the source of truth; `users` is an in-memory
// mirror of online users so the list and search are instant.
import Redis from 'ioredis';
import crypto from 'node:crypto';
import { config } from './config.js';
import { MemoryRedis } from './memory-redis.js';

export const usingMemory = config.redisUrl === 'memory';
if (usingMemory && process.env.NODE_ENV === 'production') {
  console.error('REDIS_URL=memory is for local testing only. Set REDIS_URL=redis://127.0.0.1:6379 in server/.env');
  process.exit(1);
}
export const redis = usingMemory
  ? new MemoryRedis()
  : new Redis(config.redisUrl, { maxRetriesPerRequest: 2 });
if (usingMemory) console.warn('[store] REDIS_URL=memory: in-memory test mode. Data is lost on restart. Never use in production.');

export const K = {
  user: id => `user:${id}`,
  online: 'online:index',
  nick: n => `nick:${n.toLowerCase()}`,
  chat: (a, b) => (a < b ? `chat:${a}:${b}` : `chat:${b}:${a}`),
  partners: id => `partners:${id}`,
  blocks: id => `blocks:${id}`,
  ban: device => `ban:${device}`,
  report: id => `report:${id}`,
  reports: 'reports:index',
};

/** id -> { id, nick, gender, age, country, state, visible, deviceId, token, ip, ua, lastActive } */
export const users = new Map();

export const newId = () => crypto.randomBytes(8).toString('hex');
export const newToken = () => crypto.randomBytes(24).toString('hex');

/** Public fields only — never send token/deviceId to other users */
export const publicUser = u => ({
  id: u.id, nick: u.nick, gender: u.gender, age: u.age, country: u.country, state: u.state,
});

export async function createUser(u) {
  // Reserve nickname atomically (unique among online users)
  const ok = await redis.set(K.nick(u.nick), u.id, 'EX', config.idleSeconds + 60, 'NX');
  if (!ok) return false;
  const now = Date.now();
  const full = { ...u, lastActive: now };
  await redis.multi()
    .hset(K.user(u.id), {
      nick: u.nick, gender: u.gender, age: u.age, country: u.country, state: u.state,
      visible: u.visible ? 1 : 0, deviceId: u.deviceId, token: u.token, ip: u.ip || '', ua: u.ua || '',
    })
    .expire(K.user(u.id), config.idleSeconds)
    .sadd(K.online, u.id)
    .exec();
  users.set(u.id, full);
  return full;
}

export async function loadUser(id) {
  const h = await redis.hgetall(K.user(id));
  if (!h || !h.nick) return null;
  return {
    id, nick: h.nick, gender: h.gender, age: Number(h.age), country: h.country, state: h.state,
    visible: h.visible === '1', deviceId: h.deviceId, token: h.token, ip: h.ip || '', ua: h.ua || '', lastActive: Date.now(),
  };
}

/** Real activity: refresh the idle timer (memory + Redis TTL). */
export function touch(id) {
  const u = users.get(id);
  if (!u) return;
  const now = Date.now();
  // Only hit Redis at most every 15s per user — keeps Redis load tiny at 3k users
  if (now - (u._lastRedisTouch || 0) > 15000) {
    u._lastRedisTouch = now;
    redis.multi()
      .expire(K.user(id), config.idleSeconds)
      .expire(K.nick(u.nick), config.idleSeconds + 60)
      .exec().catch(() => {});
  }
  u.lastActive = now;
}

export async function updateProfile(id, patch) {
  const u = users.get(id);
  if (!u) return null;
  Object.assign(u, patch);
  await redis.hset(K.user(id), {
    age: u.age, state: u.state, visible: u.visible ? 1 : 0,
  });
  return u;
}

export async function saveMessage(msg) {
  const key = K.chat(msg.from, msg.to);
  await redis.multi()
    .rpush(key, JSON.stringify(msg))
    .ltrim(key, -config.maxHistory, -1)
    .expire(key, config.orphanTtlSeconds)
    .sadd(K.partners(msg.from), msg.to)
    .sadd(K.partners(msg.to), msg.from)
    .expire(K.partners(msg.from), config.orphanTtlSeconds)
    .expire(K.partners(msg.to), config.orphanTtlSeconds)
    .exec();
}

export async function getHistory(a, b) {
  const rows = await redis.lrange(K.chat(a, b), 0, -1);
  return rows.map(r => JSON.parse(r));
}

export async function getPartners(id) {
  return redis.smembers(K.partners(id));
}

export async function isBlocked(by, target) {
  return (await redis.sismember(K.blocks(by), target)) === 1;
}

export async function block(by, target) {
  await redis.multi().sadd(K.blocks(by), target).expire(K.blocks(by), config.orphanTtlSeconds).exec();
}

export async function unblock(by, target) {
  await redis.srem(K.blocks(by), target);
}

/**
 * HARD DELETE everything about a user: profile, nickname, every
 * conversation they were part of, their partner index and block list.
 * Returns the partner ids so callers can notify them.
 */
export async function purgeUser(id) {
  const u = users.get(id) || (await loadUser(id));
  const partners = await getPartners(id);
  const m = redis.multi();
  for (const p of partners) {
    m.del(K.chat(id, p));
    m.srem(K.partners(p), id);
  }
  m.del(K.user(id), K.partners(id), K.blocks(id));
  m.srem(K.online, id);
  if (u) {
    // only remove the nickname if it still belongs to this user
    const owner = await redis.get(K.nick(u.nick));
    if (owner === id) m.del(K.nick(u.nick));
  }
  await m.exec();
  users.delete(id);
  return partners;
}

// ---------- bans (by device id, never by IP) ----------
export async function getBan(deviceId) {
  if (!deviceId) return null;
  const v = await redis.get(K.ban(deviceId));
  if (!v) return null;
  const ttl = await redis.ttl(K.ban(deviceId));
  return { ...JSON.parse(v), until: ttl > 0 ? Date.now() + ttl * 1000 : null };
}

export async function setBan(deviceId, reason, hours) {
  const seconds = Math.max(1, Math.round(hours * 3600));
  await redis.set(K.ban(deviceId), JSON.stringify({ reason, at: Date.now() }), 'EX', seconds);
}

export async function removeBan(deviceId) {
  await redis.del(K.ban(deviceId));
}

// ---------- reports (the only thing kept after logout, 7 days) ----------
export async function saveReport(report) {
  const id = newId();
  const data = { id, ...report, ts: Date.now() };
  await redis.multi()
    .set(K.report(id), JSON.stringify(data), 'EX', config.reportTtlSeconds)
    .zadd(K.reports, data.ts, id)
    .exec();
  return id;
}

export async function listReports(limit = 100) {
  const ids = await redis.zrevrange(K.reports, 0, limit - 1);
  if (!ids.length) return [];
  const rows = await redis.mget(ids.map(K.report));
  const out = [];
  const expired = [];
  rows.forEach((r, i) => (r ? out.push(JSON.parse(r)) : expired.push(ids[i])));
  if (expired.length) await redis.zrem(K.reports, ...expired);
  return out;
}

export async function deleteReport(id) {
  await redis.multi().del(K.report(id)).zrem(K.reports, id).exec();
}

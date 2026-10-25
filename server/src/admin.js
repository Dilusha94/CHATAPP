import express from 'express';
import crypto from 'node:crypto';
import { config } from './config.js';
import * as db from './store.js';
import { users, publicUser } from './store.js';
import { endSession } from './socket.js';
import * as stats from './stats.js';
import * as history from './history.js';
import { getAds, updateAds } from './ads.js';

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

export const admin = express.Router();
admin.use(express.json());
admin.use((req, res, next) => {
  if (!config.adminToken || !safeEqual(req.get('x-admin-token') || '', config.adminToken)) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
});

// Ad switches (Ads tab). Changes reach everyone online immediately.
admin.get('/ads', (_req, res) => res.json(getAds()));
admin.put('/ads', (req, res) => {
  const r = updateAds(req.body || {});
  if (r.error) return res.status(400).json({ error: r.error });
  res.json(r.settings);
});

admin.get('/stats', (_req, res) => {
  const mem = process.memoryUsage();
  res.json({ online: users.size, rssMB: Math.round(mem.rss / 1048576), uptimeSec: Math.round(process.uptime()) });
});

// Daily totals for the Stats tab: ?days=30 (max 90)
admin.get('/daily', async (req, res) => {
  const days = Math.min(90, Math.max(1, Number(req.query.days) || 30));
  res.json(await stats.daily(days));
});

// Everything known about a device / IP for the last year (sign-ins, names, countries, reports, bans)
admin.get('/history', async (req, res) => {
  const deviceId = String(req.query.device || ''), ip = String(req.query.ip || '');
  if (!deviceId && !ip) return res.status(400).json({ error: 'device or ip required' });
  res.json(await history.lookup({ deviceId, ip }));
});

admin.get('/users', (req, res) => {
  const q = String(req.query.q || '').toLowerCase();
  const out = [];
  for (const u of users.values()) {
    if (q && !u.nick.toLowerCase().includes(q)) continue;
    out.push({ ...publicUser(u), deviceId: u.deviceId, ip: u.ip, visible: u.visible, idleSec: Math.round((Date.now() - u.lastActive) / 1000) });
    if (out.length >= 200) break;
  }
  res.json(out);
});

admin.get('/reports', async (_req, res) => res.json(await db.listReports()));
admin.delete('/reports/:id', async (req, res) => { await db.deleteReport(req.params.id); res.json({ ok: true }); });

// body: { deviceId, reason, hours }
admin.post('/ban', async (req, res) => {
  const { deviceId, reason = 'Violation of rules', hours = 24 } = req.body || {};
  if (!deviceId) return res.status(400).json({ error: 'deviceId required' });
  await db.setBan(deviceId, String(reason).slice(0, 200), Number(hours) || 24);
  const online = [...users.values()].find(u => u.deviceId === deviceId);
  const seen = online || (await history.lastSeen(deviceId).catch(() => null)) || {};
  history.banned(deviceId, 'ban', { reason: String(reason).slice(0, 200), hours: Number(hours) || 24, nick: seen.nick, ip: seen.ip });
  for (const u of [...users.values()]) {
    if (u.deviceId === deviceId) await endSession(u.id, 'banned', { ban: await db.getBan(deviceId) });
  }
  res.json({ ok: true });
});

admin.post('/unban', async (req, res) => {
  const deviceId = String(req.body?.deviceId || '');
  if (!deviceId) return res.status(400).json({ error: 'deviceId required' });
  await db.removeBan(deviceId);
  history.banned(deviceId, 'unban');
  res.json({ ok: true });
});

admin.post('/kick', async (req, res) => {
  const id = String(req.body?.userId || '');
  if (!users.has(id)) return res.status(404).json({ error: 'not online' });
  await endSession(id, 'kicked');
  res.json({ ok: true });
});

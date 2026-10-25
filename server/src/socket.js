import { config } from './config.js';
import * as db from './store.js';
import { users, publicUser } from './store.js';
import { validateJoin, cleanText, cleanGroupName, allow, GROUP_ID_RE } from './validate.js';
import * as grp from './groups.js';
import { groups } from './groups.js';
import * as stats from './stats.js';
import * as history from './history.js';
import { getAds, setAdsIo } from './ads.js';

/** Real visitor IP: Nginx copies Cloudflare's CF-Connecting-IP into X-Real-IP (Node only listens on 127.0.0.1) */
const clientIp = socket => String(socket.handshake.headers['x-real-ip'] || socket.handshake.headers['cf-connecting-ip'] || socket.handshake.address || '')
  .replace(/^::ffff:/, '').slice(0, 64);

/** Reports go to Redis (with the conversation, 7 days) and to the 1-year history (without messages) */
const fileReport = r => { history.reported(r); return db.saveReport(r); };

/** Runtime-only state per user (rate limits, grace timers). Never persisted. */
const rt = new Map();
const runtime = id => {
  if (!rt.has(id)) rt.set(id, { msg: [], search: [], newChat: [], strikes: [], mutedUntil: 0, grace: null, partners: new Set() });
  return rt.get(id);
};

let io;

// ---------- batched user-list diffs (huge bandwidth saver at 3k users) ----------
const pendingAdd = new Map();
const pendingRemove = new Set();
const queueAdd = u => { pendingRemove.delete(u.id); pendingAdd.set(u.id, publicUser(u)); };
const queueRemove = id => { pendingAdd.delete(id); pendingRemove.add(id); };

function flushDiff() {
  if (!pendingAdd.size && !pendingRemove.size) return;
  io.emit('users:diff', { add: [...pendingAdd.values()], remove: [...pendingRemove], count: users.size });
  pendingAdd.clear();
  pendingRemove.clear();
}

const room = id => `u:${id}`;

/** Logout / idle / kick / ban — always ends in a HARD DELETE. */
export async function endSession(id, reason, extra = {}) {
  const clearRuntime = () => {
    const r = rt.get(id);
    if (r?.grace) clearTimeout(r.grace);
    rt.delete(id);
  };
  clearRuntime();
  if (io) {
    io.to(room(id)).emit('session:ended', { reason, ...extra });
    io.in(room(id)).disconnectSockets(true);
  }
  history.sessionEnded(id, reason);
  await grp.leaveAllGroups(id);
  const partners = await db.purgeUser(id);
  // Events (or the disconnect handler) that ran during the purge may have recreated runtime state
  clearRuntime();
  for (const p of partners) io?.to(room(p)).emit('partner:left', { id });
  queueRemove(id);
}

function strike(id, socket) {
  const r = runtime(id);
  const now = Date.now();
  r.strikes = r.strikes.filter(t => now - t < 60000);
  r.strikes.push(now);
  if (r.strikes.length >= config.strikesBeforeMute) {
    r.mutedUntil = now + config.muteSeconds * 1000;
    r.strikes = [];
    socket.emit('warn', { message: `You are sending too fast. Muted for ${config.muteSeconds} seconds.` });
  } else {
    socket.emit('warn', { message: 'Slow down a little.' });
  }
}

async function attach(socket, user) {
  socket.data.userId = user.id;
  socket.join(room(user.id));
  for (const g of grp.groupsOf(user.id)) socket.join(grp.groupRoom(g.id));
  const r = runtime(user.id);
  if (r.grace) { clearTimeout(r.grace); r.grace = null; }
  r.partners = new Set(await db.getPartners(user.id));
}

function visibleList(exceptId) {
  const out = [];
  for (const u of users.values()) if (u.visible && u.id !== exceptId) out.push(publicUser(u));
  return out;
}

export function setupSocket(server) {
  io = server;
  grp.setGroupIo(server);
  setAdsIo(server);
  setInterval(flushDiff, config.diffFlushMs);

  // Idle sweeper: 5 min with no real activity -> logout + hard delete
  setInterval(() => {
    const cutoff = Date.now() - config.idleSeconds * 1000;
    for (const u of users.values()) if (u.lastActive < cutoff) endSession(u.id, 'idle').catch(console.error);
  }, config.sweepIntervalMs);

  io.on('connection', socket => {
    socket.emit('count', users.size); // landing page shows live count
    const cfCountry = String(socket.handshake.headers['cf-ipcountry'] || '').toUpperCase();
    // Country comes from Cloudflare (the visitor's IP), so it can't be picked or faked.
    // XX = unknown, T1 = Tor. Without Cloudflare (local dev) the browser's guess is used.
    const detected = /^[A-Z]{2}$/.test(cfCountry) && cfCountry !== 'XX' && cfCountry !== 'T1' ? cfCountry : null;
    socket.emit('geo', { country: detected });
    socket.emit('ads', getAds()); // ad switches from the admin panel (Ads tab)
    const me = () => users.get(socket.data.userId);
    const guard = (handler) => async (payload, ack = () => {}) => {
      try {
        const u = me();
        if (!u) return ack({ ok: false, error: 'not_joined' });
        await handler(u, payload || {}, typeof ack === 'function' ? ack : () => {});
      } catch (e) {
        console.error(e);
        if (typeof ack === 'function') ack({ ok: false, error: 'server_error' });
      }
    };

    // ---------- join / resume ----------
    socket.on('session:join', async (payload, ack = () => {}) => {
      try {
        if (me()) return ack({ ok: false, error: 'Already joined' });
        const v = validateJoin(payload);
        if (v.error) return ack({ ok: false, error: v.error });
        const ban = await db.getBan(v.value.deviceId);
        if (ban) return ack({ ok: false, banned: ban });
        if (detected) v.value.country = detected;
        const user = await db.createUser({ ...v.value, id: db.newId(), token: db.newToken(), ip: clientIp(socket), ua: String(socket.handshake.headers['user-agent'] || '') });
        if (!user) return ack({ ok: false, error: 'That nickname is in use right now' });
        await attach(socket, user);
        queueAdd(user);
        stats.session(user);
        history.sessionStarted(user);
        stats.online(users.size);
        ack({ ok: true, user: { ...publicUser(user), visible: user.visible }, token: user.token, list: visibleList(user.id), count: users.size });
      } catch (e) { console.error(e); ack({ ok: false, error: 'server_error' }); }
    });

    socket.on('session:resume', async ({ userId, token } = {}, ack = () => {}) => {
      try {
        let user = users.get(userId) || (await db.loadUser(String(userId || '')));
        if (!user || user.token !== token) return ack({ ok: false, error: 'expired' });
        const ban = await db.getBan(user.deviceId);
        if (ban) { await endSession(user.id, 'banned', { ban }); return ack({ ok: false, banned: ban }); }
        if (!users.has(user.id)) { users.set(user.id, user); if (user.visible) queueAdd(user); }
        await attach(socket, user);
        db.touch(user.id);
        stats.online(users.size);
        ack({ ok: true, user: { ...publicUser(user), visible: user.visible }, list: visibleList(user.id), count: users.size, partners: [...runtime(user.id).partners], groups: grp.groupsOf(user.id).map(grp.publicGroup) });
      } catch (e) { console.error(e); ack({ ok: false, error: 'server_error' }); }
    });

    socket.on('users:sync', guard(async (u, _p, ack) => ack({ ok: true, list: visibleList(u.id), count: users.size })));

    socket.on('activity', guard(async u => db.touch(u.id)));

    // ---------- messaging ----------
    socket.on('msg:send', guard(async (u, { to, text, cid }, ack) => {
      db.touch(u.id);
      const r = runtime(u.id);
      if (r.mutedUntil > Date.now()) return ack({ ok: false, error: 'muted', until: r.mutedUntil });
      if (!allow(r.msg, config.msgLimit)) { strike(u.id, socket); return ack({ ok: false, error: 'rate_limited' }); }

      const target = users.get(String(to || ''));
      if (!target || target.id === u.id) return ack({ ok: false, error: 'User is offline' });
      if (await db.isBlocked(target.id, u.id)) return ack({ ok: false, error: 'User is unavailable' });
      if (await db.isBlocked(u.id, target.id)) return ack({ ok: false, error: 'You blocked this user' });

      if (!r.partners.has(target.id)) {
        if (!allow(r.newChat, config.newChatLimit)) { strike(u.id, socket); return ack({ ok: false, error: 'Too many new chats. Wait a minute.' }); }
      }
      const clean = cleanText(text);
      if (!clean) return ack({ ok: false, error: 'empty' });

      const msg = { id: db.newId(), cid: String(cid || '').slice(0, 40), from: u.id, to: target.id, text: clean, ts: Date.now() };
      await db.saveMessage(msg);
      r.partners.add(target.id);
      runtime(target.id).partners.add(u.id);
      io.to(room(target.id)).emit('msg:new', { ...msg, fromUser: publicUser(u) });
      socket.to(room(u.id)).emit('msg:new', { ...msg, fromUser: publicUser(u) }); // my other tabs
      stats.message();
      ack({ ok: true, msg });
    }));

    socket.on('chat:history', guard(async (u, { with: other }, ack) => {
      db.touch(u.id);
      ack({ ok: true, messages: await db.getHistory(u.id, String(other || '')) });
    }));

    socket.on('typing', guard(async (u, { to }) => {
      const t = users.get(String(to || ''));
      if (!t || (await db.isBlocked(t.id, u.id))) return;
      db.touch(u.id);
      io.to(room(t.id)).emit('typing', { from: u.id });
    }));

    // ---------- search (live, exact, server-side) ----------
    socket.on('search', guard(async (u, q, ack) => {
      db.touch(u.id);
      if (!allow(runtime(u.id).search, config.searchLimit)) return ack({ ok: false, error: 'rate_limited' });
      const nick = String(q.nick || '').trim().toLowerCase();
      const gender = q.gender === 'm' || q.gender === 'f' ? q.gender : null;
      const ageMin = Math.max(18, Number(q.ageMin) || 18);
      const ageMax = Math.min(99, Number(q.ageMax) || 99);
      const country = /^[A-Z]{2}$/.test(String(q.country || '')) ? q.country : null;
      const results = [];
      for (const x of users.values()) {
        if (!x.visible || x.id === u.id) continue;
        if (gender && x.gender !== gender) continue;
        if (x.age < ageMin || x.age > ageMax) continue;
        if (country && x.country !== country) continue;
        if (nick && !x.nick.toLowerCase().includes(nick)) continue;
        results.push(publicUser(x));
        if (results.length >= 200) break;
      }
      ack({ ok: true, results });
    }));

    // ---------- profile ----------
    socket.on('profile:update', guard(async (u, p, ack) => {
      db.touch(u.id);
      const age = Number(p.age ?? u.age);
      if (!Number.isInteger(age) || age < 18 || age > 99) return ack({ ok: false, error: 'Age must be 18–99' });
      const updated = await db.updateProfile(u.id, {
        age, state: String(p.state ?? u.state).slice(0, 40), visible: p.visible === undefined ? u.visible : !!p.visible,
      });
      if (updated.visible) queueAdd(updated); else queueRemove(updated.id);
      ack({ ok: true, user: { ...publicUser(updated), visible: updated.visible } });
    }));

    // ---------- safety ----------
    socket.on('block', guard(async (u, { id }, ack) => { db.touch(u.id); await db.block(u.id, String(id)); ack({ ok: true }); }));
    socket.on('unblock', guard(async (u, { id }, ack) => { db.touch(u.id); await db.unblock(u.id, String(id)); ack({ ok: true }); }));

    socket.on('report', guard(async (u, { id, reason }, ack) => {
      db.touch(u.id);
      const target = users.get(String(id || ''));
      if (!target) return ack({ ok: false, error: 'User already left' });
      const messages = await db.getHistory(u.id, target.id);
      await fileReport({
        reason: String(reason || 'other').slice(0, 200),
        reporter: { id: u.id, nick: u.nick, deviceId: u.deviceId },
        reported: { ...publicUser(target), deviceId: target.deviceId, ip: target.ip },
        messages,
      });
      await db.block(u.id, target.id);
      ack({ ok: true });
    }));

    // ---------- groups (size and limits: groupMax* in config.js) ----------
    const memberGroup = (u, gid) => {
      const g = groups.get(String(gid || ''));
      return g && grp.isMember(g, u.id) ? g : null;
    };

    socket.on('group:create', guard(async (u, { name }, ack) => {
      db.touch(u.id);
      const clean = cleanGroupName(name);
      if (clean.error) return ack({ ok: false, error: clean.error });
      const r = await grp.createGroup(u, clean.name);
      if (r.error) return ack({ ok: false, error: r.error });
      stats.groupCreated();
      ack({ ok: true, group: grp.publicGroup(r.group), messages: await grp.groupHistory(r.group.id) });
    }));

    socket.on('group:join', guard(async (u, { gid }, ack) => {
      db.touch(u.id);
      if (!GROUP_ID_RE.test(String(gid || ''))) return ack({ ok: false, error: 'Invalid invite link' });
      const r = await grp.joinGroup(u, gid);
      if (r.error) return ack({ ok: false, error: r.error });
      ack({ ok: true, group: grp.publicGroup(r.group), messages: await grp.groupHistory(gid) });
    }));

    // Preview for invite cards: name and size only
    socket.on('group:info', guard(async (u, { gid }, ack) => {
      const g = groups.get(String(gid || ''));
      if (!g) return ack({ ok: false, error: 'This group no longer exists' });
      ack({ ok: true, info: { id: g.id, name: g.name, count: g.members.length, max: config.groupMaxMembers, member: grp.isMember(g, u.id) } });
    }));

    socket.on('group:history', guard(async (u, { gid }, ack) => {
      db.touch(u.id);
      const g = memberGroup(u, gid);
      if (!g) return ack({ ok: false, error: 'You are not in this group' });
      ack({ ok: true, messages: await grp.groupHistory(g.id) });
    }));

    socket.on('group:send', guard(async (u, { gid, text, cid }, ack) => {
      db.touch(u.id);
      const r = runtime(u.id);
      if (r.mutedUntil > Date.now()) return ack({ ok: false, error: 'muted', until: r.mutedUntil });
      if (!allow(r.msg, config.msgLimit)) { strike(u.id, socket); return ack({ ok: false, error: 'rate_limited' }); }
      const g = memberGroup(u, gid);
      if (!g) return ack({ ok: false, error: 'You are not in this group' });
      const clean = cleanText(text);
      if (!clean) return ack({ ok: false, error: 'empty' });
      const msg = { id: db.newId(), cid: String(cid || '').slice(0, 40), gid: g.id, from: u.id, fromUser: publicUser(u), text: clean, ts: Date.now() };
      await grp.saveGroupMessage(g, msg);
      socket.to(grp.groupRoom(g.id)).emit('group:msg', { gid: g.id, msg }); // everyone else + my other tabs
      stats.groupMessage();
      ack({ ok: true, msg });
    }));

    socket.on('group:leave', guard(async (u, { gid }, ack) => {
      db.touch(u.id);
      const g = memberGroup(u, gid);
      if (!g) return ack({ ok: true });
      await grp.removeMember(g, u.id, 'left');
      ack({ ok: true });
    }));

    socket.on('group:kick', guard(async (u, { gid, id }, ack) => {
      db.touch(u.id);
      const g = memberGroup(u, gid);
      if (!g) return ack({ ok: false, error: 'You are not in this group' });
      if (g.admin !== u.id) return ack({ ok: false, error: 'Only the admin can remove people' });
      const target = String(id || '');
      if (target === u.id || !grp.isMember(g, target)) return ack({ ok: false, error: 'Not a member' });
      await grp.removeMember(g, target, 'kicked');
      ack({ ok: true });
    }));

    socket.on('group:report', guard(async (u, { gid, id, reason }, ack) => {
      db.touch(u.id);
      const g = memberGroup(u, gid);
      const target = users.get(String(id || ''));
      if (!g || !target || target.id === u.id) return ack({ ok: false, error: 'User already left' });
      await fileReport({
        reason: String(reason || 'other').slice(0, 200),
        reporter: { id: u.id, nick: u.nick, deviceId: u.deviceId },
        reported: { ...publicUser(target), deviceId: target.deviceId, ip: target.ip },
        group: { id: g.id, name: g.name },
        messages: (await grp.groupHistory(g.id)).filter(m => m.type !== 'system'),
      });
      ack({ ok: true });
    }));

    // ---------- logout ----------
    socket.on('session:logout', guard(async (u, _p, ack) => {
      ack({ ok: true });
      await endSession(u.id, 'logout');
    }));

    socket.on('disconnect', async () => {
      const id = socket.data.userId;
      if (!id || !users.has(id)) return;
      const left = await io.in(room(id)).fetchSockets();
      if (left.length) return; // other tabs still open
      const r = runtime(id);
      if (r.grace) clearTimeout(r.grace);
      // Network blip / app in background: keep the user for a grace period
      r.grace = setTimeout(() => endSession(id, 'disconnected').catch(console.error), config.disconnectGraceSeconds * 1000);
    });
  });
}

/** After a server restart: restore users from Redis so they can resume. */
export async function restoreFromRedis() {
  const ids = await db.redis.smembers(db.K.online);
  let restored = 0;
  for (const id of ids) {
    const u = await db.loadUser(id);
    if (!u) { await db.purgeUser(id); continue; }
    users.set(id, u);
    restored++;
    runtime(id).grace = setTimeout(() => endSession(id, 'disconnected').catch(console.error), config.disconnectGraceSeconds * 1000);
  }
  await grp.restoreGroups();
  return restored;
}

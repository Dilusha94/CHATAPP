// All socket <-> state wiring lives here. Components only call these functions.
import { socket, call, getDeviceId, session } from './socket.js';
import { set, get, notify, upsertChat, upsertGroup } from './store.js';
import { ding } from './sound.js';
import { watchAdScripts, markLogin, clearLogin } from './adScripts.js';

const IDLE_MS = 5 * 60 * 1000;

const toMap = list => Object.fromEntries(list.map(u => [u.id, u]));

// ---------- group invite links: https://yoursite.lk/?g=XXXXXXXXXX ----------
const GID_RE = /^[A-Za-z0-9]{10}$/;
export const inviteLink = gid => `${location.origin}/?g=${gid}`;
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const INVITE_RE = new RegExp(escapeRe(location.origin) + '/\\?g=([A-Za-z0-9]{10})(?![A-Za-z0-9])');
/** Group id inside a chat message, if it contains one of our invite links */
export const inviteIdIn = text => String(text || '').match(INVITE_RE)?.[1] || null;
/** Accepts a full invite link, "?g=…" or just the 10-character code */
export const parseInvite = text => {
  const t = String(text || '').trim();
  return GID_RE.test(t) ? t : t.match(/[?&]g=([A-Za-z0-9]{10})(?![A-Za-z0-9])/)?.[1] || null;
};

/** Opened via an invite link: remember the group, clean the address bar */
function readInviteFromUrl() {
  const gid = new URLSearchParams(location.search).get('g');
  if (gid && GID_RE.test(gid)) set({ pendingGroup: gid });
  if (location.search) history.replaceState(null, '', location.pathname);
}

function enterGroups(list = []) {
  const groups = {};
  for (const g of list) groups[g.id] = { ...(get().groups[g.id] || { messages: [], unread: 0, loaded: false }), group: g };
  set({ groups });
}

/** After sign-in / resume: join the group from the invite link, if any */
function consumePendingGroup() {
  const gid = get().pendingGroup;
  if (!gid) return;
  set({ pendingGroup: null });
  joinGroup(gid);
}

function enterReady(res) {
  const chats = { ...get().chats };
  for (const pid of res.partners || []) {
    if (!chats[pid]) chats[pid] = { user: null, messages: [], unread: 0, loaded: false, left: false };
  }
  const users = toMap(res.list || []);
  for (const pid of Object.keys(chats)) chats[pid] = { ...chats[pid], user: users[pid] || chats[pid].user };
  markLogin(false); // after a page refresh the 3-minute popunder timer keeps counting from the original sign-in
  set({ status: 'ready', me: res.user, users, count: res.count, chats, lastActivity: Date.now() });
  enterGroups(res.groups);
  consumePendingGroup();
}

export function init() {
  readInviteFromUrl();
  socket.on('connect', async () => {
    set({ connected: true });
    const s = session.get();
    if (!s) return set({ status: get().status === 'banned' ? 'banned' : 'join' });
    const res = await call('session:resume', s);
    if (res.ok) return enterReady(res);
    session.clear();
    clearLogin();
    if (res.banned) return set({ status: 'banned', banned: res.banned });
    set({ status: 'join', me: null, chats: {}, active: null, groups: {}, activeGroup: null });
    if (get().me) notify('Your session ended. Please join again.', 'warn');
  });

  socket.on('disconnect', () => set({ connected: false }));
  socket.on('count', count => set({ count }));
  socket.on('ads', ads => set({ ads }));
  watchAdScripts();
  socket.on('geo', ({ country }) => set({ geoCountry: country || null }));

  socket.on('users:diff', ({ add, remove, count }) => {
    const me = get().me;
    const users = { ...get().users };
    for (const id of remove) delete users[id];
    for (const u of add) if (u.id !== me?.id) users[u.id] = u;
    const chats = get().chats;
    let changed = false;
    const next = { ...chats };
    for (const u of add) if (next[u.id]) { next[u.id] = { ...next[u.id], user: u }; changed = true; }
    set({ users, count, ...(changed ? { chats: next } : {}) });
  });

  socket.on('msg:new', m => {
    const me = get().me;
    const mine = m.from === me?.id;
    const pid = mine ? m.to : m.from;
    const isOpen = get().active === pid && !document.hidden;
    upsertChat(pid, c => {
      if (c.messages.some(x => x.id === m.id)) return {};
      return {
        user: mine ? c.user : (m.fromUser || c.user),
        messages: [...c.messages, { ...m, status: 'sent' }].slice(-200),
        unread: mine || isOpen ? c.unread : c.unread + 1,
        left: false,
      };
    });
    if (!mine) {
      const t = { ...get().typing }; delete t[pid]; set({ typing: t });
      if (get().sound && !isOpen) ding();
    }
  });

  socket.on('typing', ({ from }) => {
    set({ typing: { ...get().typing, [from]: Date.now() } });
    setTimeout(() => {
      const t = get().typing;
      if (t[from] && Date.now() - t[from] >= 3000) { const n = { ...t }; delete n[from]; set({ typing: n }); }
    }, 3100);
  });

  socket.on('partner:left', ({ id }) => {
    if (get().chats[id]) upsertChat(id, () => ({ left: true }));
  });

  socket.on('warn', ({ message }) => notify(message, 'warn'));

  // ---------- groups ----------
  socket.on('group:msg', ({ gid, msg }) => {
    if (!get().groups[gid]) return;
    const mine = msg.from === get().me?.id;
    const isOpen = get().activeGroup === gid && !document.hidden;
    upsertGroup(gid, g => {
      if (g.messages.some(x => x.id === msg.id)) return {};
      return { messages: [...g.messages, { ...msg, status: 'sent' }].slice(-200), unread: mine || isOpen || msg.type === 'system' ? g.unread : g.unread + 1 };
    });
    if (!mine && msg.type !== 'system' && get().sound && !isOpen) ding();
  });
  socket.on('group:update', ({ group }) => {
    if (get().groups[group.id]) upsertGroup(group.id, () => ({ group }));
  });
  socket.on('group:removed', ({ gid, name }) => {
    dropGroup(gid);
    notify(`You were removed from "${name}".`, 'warn');
  });

  socket.on('session:ended', ({ reason, ban }) => {
    session.clear();
    clearLogin();
    const text = {
      idle: 'You were logged out after 5 minutes of inactivity. Your chats were deleted.',
      logout: 'You logged out. All your chats were deleted.',
      kicked: 'You were removed by a moderator.',
      disconnected: 'Your session expired.',
      banned: 'You were banned.',
    }[reason] || 'Session ended.';
    if (reason === 'banned') set({ status: 'banned', banned: ban || { reason: 'Rule violation' } });
    else set({ status: 'join', me: null, chats: {}, active: null, users: {}, view: 'home', groups: {}, activeGroup: null });
    notify(text, reason === 'logout' ? 'info' : 'warn');
    // reconnect a fresh socket so the user can join again
    setTimeout(() => { if (!socket.connected) socket.connect(); }, 300);
  });

  // Real user activity keeps the session alive (heartbeats alone don't)
  let lastSent = 0;
  const onActivity = () => {
    const now = Date.now();
    set({ lastActivity: now });
    if (now - lastSent > 30000 && get().status === 'ready') { lastSent = now; socket.emit('activity'); }
  };
  ['pointerdown', 'keydown', 'touchstart', 'wheel'].forEach(e => window.addEventListener(e, onActivity, { passive: true }));

  socket.connect();
}

export async function join(form) {
  const res = await call('session:join', { ...form, deviceId: getDeviceId() });
  if (!res.ok) {
    if (res.banned) set({ status: 'banned', banned: res.banned });
    return res.error || 'Could not join';
  }
  session.set({ userId: res.user.id, token: res.token });
  markLogin(true);
  enterReady(res);
  return null;
}

export async function openChat(user) {
  const pid = user.id;
  upsertChat(pid, c => ({ user: user.nick ? user : c.user, unread: 0 }));
  set({ active: pid, activeGroup: null });
  const c = get().chats[pid];
  if (!c.loaded) {
    const res = await call('chat:history', { with: pid });
    if (res.ok) {
      upsertChat(pid, cur => {
        const ids = new Set(res.messages.map(m => m.id));
        const pending = cur.messages.filter(m => !ids.has(m.id) && m.status !== 'sent');
        return { messages: [...res.messages.map(m => ({ ...m, status: 'sent' })), ...pending], loaded: true };
      });
    }
  }
}

export const closeChat = () => set({ active: null });

/** Private message to anyone (the open chat, or an invite sent from a group) */
async function sendTo(pid, text) {
  const me = get().me;
  const cid = Math.random().toString(36).slice(2);
  const temp = { id: 'tmp-' + cid, cid, from: me.id, to: pid, text: text.trim(), ts: Date.now(), status: 'sending' };
  upsertChat(pid, c => ({ messages: [...c.messages, temp] }));
  const res = await call('msg:send', { to: pid, text, cid });
  upsertChat(pid, c => ({
    messages: c.messages.map(m => (m.cid === cid && m.status === 'sending'
      ? (res.ok ? { ...res.msg, status: 'sent' } : { ...m, status: 'failed', error: res.error })
      : m)),
  }));
  return res;
}

const sendError = res => notify(res.error === 'rate_limited' ? 'Slow down a little.' : res.error, 'warn');

export async function send(text) {
  const pid = get().active;
  if (!pid || !text.trim()) return;
  const res = await sendTo(pid, text);
  if (!res.ok) sendError(res);
}

let typingSent = 0;
export function typing() {
  const pid = get().active;
  if (pid && Date.now() - typingSent > 2000) { typingSent = Date.now(); socket.emit('typing', { to: pid }); }
}

export async function search(q) { return call('search', q); }

export async function updateProfile(p) {
  const res = await call('profile:update', p);
  if (res.ok) { set({ me: res.user }); notify('Profile updated'); }
  else notify(res.error, 'error');
}

export async function blockUser(id) {
  const res = await call('block', { id });
  if (res.ok) {
    const chats = { ...get().chats }; delete chats[id];
    set({ chats, active: get().active === id ? null : get().active });
    notify('User blocked');
  }
}

export async function reportUser(id, reason) {
  const res = await call('report', { id, reason });
  if (res.ok) {
    const chats = { ...get().chats }; delete chats[id];
    set({ chats, active: null });
    notify('Thanks. A moderator will review this chat.');
  } else notify(res.error, 'error');
}

export async function logout() {
  await call('session:logout');
}

export function toggleSound() {
  const sound = !get().sound;
  localStorage.setItem('sound', sound ? 'on' : 'off');
  set({ sound });
}

export const stillHere = () => { set({ lastActivity: Date.now() }); socket.emit('activity'); };
export { IDLE_MS };

// ---------- group chats ----------
function dropGroup(gid) {
  const groups = { ...get().groups };
  delete groups[gid];
  set({ groups, activeGroup: get().activeGroup === gid ? null : get().activeGroup });
}

function addGroup(res) {
  upsertGroup(res.group.id, () => ({ group: res.group, messages: (res.messages || []).map(m => ({ ...m, status: 'sent' })), loaded: true, unread: 0 }));
  set({ view: 'groups', active: null, activeGroup: res.group.id });
}

/** Returns an error message, or null when the group was created */
export async function createGroup(name) {
  const res = await call('group:create', { name });
  if (!res.ok) return res.error;
  addGroup(res);
  return null;
}

export async function joinGroup(gid) {
  if (get().groups[gid]) return openGroup(gid);
  const res = await call('group:join', { gid });
  if (!res.ok) return notify(res.error, 'warn');
  addGroup(res);
  notify(`You joined "${res.group.name}"`);
}

export async function openGroup(gid) {
  upsertGroup(gid, () => ({ unread: 0 }));
  set({ active: null, activeGroup: gid, view: 'groups' });
  if (!get().groups[gid].loaded) {
    const res = await call('group:history', { gid });
    if (res.ok) upsertGroup(gid, () => ({ messages: res.messages.map(m => ({ ...m, status: 'sent' })), loaded: true }));
  }
}

export const closeGroup = () => set({ activeGroup: null });

export async function sendGroup(text) {
  const gid = get().activeGroup;
  const me = get().me;
  if (!gid || !text.trim()) return;
  const cid = Math.random().toString(36).slice(2);
  const temp = { id: 'tmp-' + cid, cid, gid, from: me.id, fromUser: me, text: text.trim(), ts: Date.now(), status: 'sending' };
  upsertGroup(gid, g => ({ messages: [...g.messages, temp] }));
  const res = await call('group:send', { gid, text, cid });
  upsertGroup(gid, g => ({
    messages: g.messages.map(m => (m.cid === cid && m.status === 'sending'
      ? (res.ok ? { ...res.msg, status: 'sent' } : { ...m, status: 'failed', error: res.error })
      : m)),
  }));
  if (!res.ok) sendError(res);
}

export async function leaveGroup(gid) {
  await call('group:leave', { gid });
  dropGroup(gid);
}

export async function kickMember(gid, id) {
  const res = await call('group:kick', { gid, id });
  if (!res.ok) notify(res.error, 'error');
}

export async function reportGroupMember(gid, id, reason) {
  const res = await call('group:report', { gid, id, reason });
  notify(res.ok ? 'Thanks. A moderator will review this group chat.' : res.error, res.ok ? 'info' : 'error');
}

export const groupInfo = gid => call('group:info', { gid });

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export async function copyInvite(gid) {
  const ok = await copyText(inviteLink(gid));
  notify(ok ? 'Invite link copied. Paste it to anyone you want to invite.' : 'Could not copy. Select the link and copy it.', ok ? 'info' : 'warn');
  return ok;
}

/** Sends the invite link as a private message; it shows up as a "Join group" card. */
export async function inviteUser(gid, user) {
  const name = get().groups[gid]?.group?.name || 'my group';
  upsertChat(user.id, c => ({ user: c.user || user }));
  const res = await sendTo(user.id, `Join my group "${name}" 👇\n${inviteLink(gid)}`);
  if (!res.ok) sendError(res);
  return res.ok;
}

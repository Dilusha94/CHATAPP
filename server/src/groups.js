// Group chats (max 10 people). Same privacy rules as private chats: a group and all
// its messages are hard-deleted the moment its last member leaves, and members are
// removed automatically when they log out or go idle.
import crypto from 'node:crypto';
import { config } from './config.js';
import { redis, users, publicUser, newId } from './store.js';

/** gid -> { id, name, admin, created, members: [{ id, joined }], kicked: [deviceId] } */
export const groups = new Map();

const GK = {
  group: id => `group:${id}`,
  chat: id => `gchat:${id}`,
  index: 'groups:index',
};
export const groupRoom = gid => `g:${gid}`;
const userRoom = id => `u:${id}`;

// 10 characters from an unambiguous alphabet; also used in the invite link
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
const newGroupId = () => [...crypto.randomBytes(10)].map(b => ALPHABET[b % ALPHABET.length]).join('');

let io;
export const setGroupIo = server => { io = server; };

export const isMember = (g, uid) => g.members.some(m => m.id === uid);
export const groupsOf = uid => [...groups.values()].filter(g => isMember(g, uid));

/** What clients see: never deviceIds or the kicked list */
export const publicGroup = g => ({
  id: g.id, name: g.name, admin: g.admin, max: config.groupMaxMembers,
  members: g.members.map(m => users.get(m.id)).filter(Boolean).map(publicUser),
});

async function save(g) {
  await redis.multi()
    .set(GK.group(g.id), JSON.stringify(g), 'EX', config.orphanTtlSeconds)
    .sadd(GK.index, g.id)
    .exec();
}

async function pushHistory(gid, msg) {
  const key = GK.chat(gid);
  await redis.multi()
    .rpush(key, JSON.stringify(msg))
    .ltrim(key, -config.maxHistory, -1)
    .expire(key, config.orphanTtlSeconds)
    .expire(GK.group(gid), config.orphanTtlSeconds)
    .exec();
}

export const groupHistory = async gid => (await redis.lrange(GK.chat(gid), 0, -1)).map(r => JSON.parse(r));

/** "Anna joined", "Ben left"… shown as small notes in the conversation */
async function announce(g, text) {
  const msg = { id: newId(), gid: g.id, type: 'system', text, ts: Date.now() };
  await pushHistory(g.id, msg);
  io?.to(groupRoom(g.id)).emit('group:msg', { gid: g.id, msg });
}

const broadcastUpdate = g => io?.to(groupRoom(g.id)).emit('group:update', { group: publicGroup(g) });

export async function saveGroupMessage(g, msg) {
  await pushHistory(g.id, msg);
}

export async function createGroup(u, name) {
  if (groupsOf(u.id).length >= config.groupMaxJoined) return { error: `You can be in up to ${config.groupMaxJoined} groups at once` };
  const adminOf = [...groups.values()].filter(g => g.admin === u.id).length;
  if (adminOf >= config.groupMaxCreated) return { error: `You can create up to ${config.groupMaxCreated} groups` };
  const now = Date.now();
  const g = { id: newGroupId(), name, admin: u.id, created: now, members: [{ id: u.id, joined: now }], kicked: [] };
  groups.set(g.id, g);
  await save(g);
  io?.in(userRoom(u.id)).socketsJoin(groupRoom(g.id));
  await announce(g, `${u.nick} created the group`);
  return { group: g };
}

export async function joinGroup(u, gid) {
  const g = groups.get(gid);
  if (!g) return { error: 'This group no longer exists' };
  if (isMember(g, u.id)) return { group: g };
  if (g.kicked.includes(u.deviceId)) return { error: 'You were removed from this group' };
  if (g.members.length >= config.groupMaxMembers) return { error: `This group is full (${config.groupMaxMembers} people)` };
  if (groupsOf(u.id).length >= config.groupMaxJoined) return { error: `You can be in up to ${config.groupMaxJoined} groups at once` };
  g.members.push({ id: u.id, joined: Date.now() });
  await save(g);
  io?.in(userRoom(u.id)).socketsJoin(groupRoom(gid));
  await announce(g, `${u.nick} joined`);
  broadcastUpdate(g);
  return { group: g };
}

/** reason: 'left' (incl. logout/idle) or 'kicked'. The longest-standing member inherits admin. */
export async function removeMember(g, uid, reason) {
  if (!isMember(g, uid)) return;
  const u = users.get(uid);
  g.members = g.members.filter(m => m.id !== uid);
  io?.in(userRoom(uid)).socketsLeave(groupRoom(g.id));
  if (reason === 'kicked') {
    if (u?.deviceId) g.kicked.push(u.deviceId);
    io?.to(userRoom(uid)).emit('group:removed', { gid: g.id, name: g.name, reason });
  }
  if (!g.members.length) return deleteGroup(g.id);

  let newAdmin = null;
  if (g.admin === uid) {
    g.admin = g.members.reduce((a, b) => (a.joined <= b.joined ? a : b)).id;
    newAdmin = users.get(g.admin);
  }
  await save(g);
  const nick = u?.nick || 'Someone';
  await announce(g, reason === 'kicked' ? `${nick} was removed by the admin` : `${nick} left`);
  if (newAdmin) await announce(g, `${newAdmin.nick} is now the admin`);
  broadcastUpdate(g);
}

export async function deleteGroup(gid) {
  groups.delete(gid);
  await redis.multi().del(GK.group(gid), GK.chat(gid)).srem(GK.index, gid).exec();
}

/** Called on logout / idle / disconnect / ban, before the user is hard-deleted. */
export async function leaveAllGroups(uid) {
  for (const g of groupsOf(uid)) await removeMember(g, uid, 'left');
}

/** After a server restart (users must already be restored). */
export async function restoreGroups() {
  const ids = await redis.smembers(GK.index);
  let restored = 0;
  for (const id of ids) {
    const raw = await redis.get(GK.group(id));
    const g = raw ? JSON.parse(raw) : null;
    if (g) g.members = g.members.filter(m => users.has(m.id));
    if (!g || !g.members.length) { await deleteGroup(id); continue; }
    if (!isMember(g, g.admin)) g.admin = g.members.reduce((a, b) => (a.joined <= b.joined ? a : b)).id;
    groups.set(id, g);
    await save(g);
    restored++;
  }
  return restored;
}

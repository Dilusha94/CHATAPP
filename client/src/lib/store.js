import { create } from 'zustand';

export const useStore = create(() => ({
  status: 'connecting',   // connecting | join | ready | banned
  me: null,
  users: {},              // id -> public user (online, visible)
  count: 0,
  chats: {},              // partnerId -> { user, messages: [], unread, loaded, left }
  active: null,           // partnerId of open chat
  groups: {},             // groupId -> { group, messages: [], unread, loaded }
  activeGroup: null,      // groupId of open group chat
  pendingGroup: null,     // groupId from an invite link, joined right after sign-in
  geoCountry: null,       // country detected by the server (Cloudflare); null = unknown, use the browser's guess
  view: 'home',           // home | groups | inbox | search | profile | history
  typing: {},             // partnerId -> timestamp
  sound: localStorage.getItem('sound') !== 'off',
  banned: null,
  notice: null,           // { kind: 'info'|'warn'|'error', text }
  dialog: null,           // open confirmation dialog, see ask()
  ads: null,              // ad switches from the admin panel (Ads tab), pushed live by the server
  lastActivity: Date.now(),
  connected: false,
}));

export const set = useStore.setState;
export const get = useStore.getState;

/**
 * In-app confirmation dialog (instead of the browser's confirm()).
 * Resolves true when the user confirms, false when they cancel.
 *   if (await ask({ title: 'Block Anna?', message: '…', confirm: 'Block', danger: true })) …
 */
export function ask({ title, message = '', confirm = 'OK', cancel = 'Cancel', danger = false }) {
  get().dialog?.resolve(false); // only one at a time
  return new Promise(resolve => {
    set({ dialog: { title, message, confirm, cancel, danger, resolve: ok => { set({ dialog: null }); resolve(ok); } } });
  });
}

export function notify(text, kind = 'info') {
  set({ notice: { text, kind, at: Date.now() } });
  setTimeout(() => { if (get().notice?.text === text) set({ notice: null }); }, 4000);
}

export function upsertChat(partnerId, patch) {
  const chats = get().chats;
  const cur = chats[partnerId] || { user: get().users[partnerId], messages: [], unread: 0, loaded: false, left: false };
  set({ chats: { ...chats, [partnerId]: { ...cur, ...patch(cur) } } });
}

export function upsertGroup(gid, patch) {
  const groups = get().groups;
  const cur = groups[gid] || { group: null, messages: [], unread: 0, loaded: false };
  set({ groups: { ...groups, [gid]: { ...cur, ...patch(cur) } } });
}

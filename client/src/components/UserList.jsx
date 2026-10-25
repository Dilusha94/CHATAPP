import { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useStore } from '../lib/store.js';
import { openChat } from '../lib/chat.js';
import { Avatar, Flag, GenderIcon } from './ui.jsx';
import { countryName } from '../lib/countries.js';
import AdBanner from './AdBanner.jsx';

const AD_EVERY = 5;  // a 320x50 banner after every 5 people in the Online list
const AD_ROW = 58;   // banner height (50) + gap

/** "Sri Lanka · Western" */
export const placeOf = u => [u.country && countryName(u.country), u.state].filter(Boolean).join(' · ');

export function UserRow({ u, onClick, right, sub }) {
  return (
    <button onClick={onClick} className="user-card h-16">
      <Avatar user={u} size="size-10 text-sm" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 truncate font-medium text-fg">
          <span className="truncate">{u.nick}</span>
          <GenderIcon g={u.gender} className="size-3.5 shrink-0" />
          <span className="text-xs font-normal text-fg-subtle">{u.age}</span>
        </span>
        {sub && <span className="block truncate text-xs text-fg-subtle">{sub}</span>}
      </span>
      {right}
      <Flag code={u.country} className="text-base" />
    </button>
  );
}

export default function UserList() {
  const usersObj = useStore(s => s.users);
  const count = useStore(s => s.count);
  const me = useStore(s => s.me);
  const unread = useStore(s => s.chats);
  const [filter, setFilter] = useState('all'); // all | m | f | local

  // Same country first (like Chatiw), then women/men mixed by nickname
  const list = useMemo(() => {
    let arr = Object.values(usersObj);
    if (filter === 'm' || filter === 'f') arr = arr.filter(u => u.gender === filter);
    if (filter === 'local') arr = arr.filter(u => u.country === me?.country);
    return arr.sort((a, b) => (b.country === me?.country) - (a.country === me?.country) || a.nick.localeCompare(b.nick));
  }, [usersObj, filter, me?.country]);

  // A 320x50 banner row after every AD_EVERY people (never after the last one).
  // Ad keys follow their slot (ad-1, ad-2…) so a banner isn't reloaded when people join or leave.
  const rows = useMemo(() => {
    const out = [];
    list.forEach((u, i) => {
      out.push(u);
      if ((i + 1) % AD_EVERY === 0 && i < list.length - 1) out.push({ ad: true, id: `ad-${(i + 1) / AD_EVERY}` });
    });
    return out;
  }, [list]);

  const parentRef = useRef(null);
  const v = useVirtualizer({ count: rows.length, getScrollElement: () => parentRef.current, estimateSize: i => (rows[i].ad ? AD_ROW : 72), overscan: 12 });

  return (
    <div className="flex h-full flex-col glass border-x-0 md:border-x md:rounded-[1.75rem]">
      <div className="flex items-center justify-between px-5 pt-4 pb-3">
        <span className="text-lg font-semibold text-fg">Online now</span>
        <span className="flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1 text-sm font-semibold text-fg ring-1 ring-line">
          <span className="size-2 rounded-full bg-ok shadow-[0_0_8px] shadow-ok animate-pulse" />{count}
        </span>
      </div>
      <div className="flex gap-2 overflow-x-auto px-4 pb-3">
        {[['all', 'All'], ['f', 'Women'], ['m', 'Men'], ['local', 'My country']].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} className={`chip shrink-0 ${filter === k ? 'chip-active' : ''}`}>{l}</button>
        ))}
      </div>
      <div ref={parentRef} className="flex-1 overflow-y-auto scroll-thin pb-2">
        {list.length === 0 && <p className="p-6 text-center text-sm text-fg-subtle">No one here yet. Invite a friend!</p>}
        <div style={{ height: v.getTotalSize(), position: 'relative' }}>
          {v.getVirtualItems().map(item => {
            const u = rows[item.index];
            if (u.ad) {
              return (
                <div key={u.id} className="flex justify-center px-3 pb-2" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: AD_ROW, transform: `translateY(${item.start}px)` }}>
                  <AdBanner size="320x50" />
                </div>
              );
            }
            const n = unread[u.id]?.unread || 0;
            return (
              <div key={u.id} className="h-[72px] px-3 pb-2" style={{ position: 'absolute', top: 0, left: 0, right: 0, transform: `translateY(${item.start}px)` }}>
                <UserRow u={u} onClick={() => openChat(u)} sub={placeOf(u)}
                  right={n > 0 && <span className="badge">{n}</span>} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

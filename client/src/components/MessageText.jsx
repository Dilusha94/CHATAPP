import { useEffect, useState } from 'react';
import { useStore } from '../lib/store.js';
import { inviteIdIn, inviteLink, groupInfo, joinGroup } from '../lib/chat.js';
import { GroupAvatar } from './ui.jsx';

/** Message text; our group invite links are shown as a tappable "Join group" card. */
export default function MessageText({ text, mine }) {
  const gid = inviteIdIn(text);
  if (!gid) return <p className="whitespace-pre-wrap break-words">{text}</p>;
  const rest = text.replace(inviteLink(gid), '').trim();
  return (
    <>
      {rest && <p className="whitespace-pre-wrap break-words">{rest}</p>}
      <InviteCard gid={gid} mine={mine} />
    </>
  );
}

function InviteCard({ gid, mine }) {
  const member = useStore(s => !!s.groups[gid]);
  const [info, setInfo] = useState(null);
  useEffect(() => {
    let live = true;
    groupInfo(gid).then(r => live && setInfo(r));
    return () => { live = false; };
  }, [gid, member]);

  const ok = info?.ok;
  const g = info?.info;
  const full = ok && g.count >= g.max && !member;
  const label = member ? 'Open group' : !info ? 'Loading…' : !ok ? 'No longer available' : full ? 'Group is full' : 'Join group';

  return (
    <div className={`mt-1.5 w-64 max-w-full rounded-2xl p-3 ${mine ? 'bg-black/15 ring-1 ring-white/25' : 'bg-surface ring-1 ring-line'}`}>
      <div className="flex items-center gap-3">
        <GroupAvatar name={g?.name} />
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-70">Group invite</div>
          <div className="truncate font-semibold">{ok ? g.name : info ? 'Group ended' : '…'}</div>
          {ok && <div className="text-xs opacity-75">{g.count}/{g.max} members</div>}
        </div>
      </div>
      <button type="button" disabled={!ok || full} onClick={() => joinGroup(gid)}
        className={`mt-3 w-full rounded-full py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-55 ${mine ? 'bg-white text-brand-dark hover:bg-white/90' : 'btn-primary'}`}>
        {label}
      </button>
    </div>
  );
}

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useStore, ask } from '../lib/store.js';
import { sendGroup, closeGroup, leaveGroup, kickMember, reportGroupMember, copyInvite, inviteUser, inviteLink } from '../lib/chat.js';
import { Avatar, GroupAvatar, Flag, GenderIcon, Icon, I } from './ui.jsx';
import MessageText from './MessageText.jsx';
import { countSentMessage } from '../lib/directLink.js';
import AdBanner from './AdBanner.jsx';
import { ReportDialog } from './ChatPanel.jsx';

const time = ts => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const EMOJI = ['😀', '😂', '😊', '😍', '😘', '😎', '🤔', '😢', '😡', '👍', '🙏', '❤️', '🔥', '🎉', '👋', '🙈'];

export default function GroupPanel() {
  const gid = useStore(s => s.activeGroup);
  const entry = useStore(s => s.groups[s.activeGroup]);
  const me = useStore(s => s.me);
  const [text, setText] = useState('');
  const [emoji, setEmoji] = useState(false);
  const [sheet, setSheet] = useState(null); // 'invite' | 'members'
  const endRef = useRef(null);
  const inputRef = useRef(null);

  useLayoutEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [entry?.messages.length, gid]);
  useEffect(() => { inputRef.current?.focus(); setText(''); setEmoji(false); setSheet(null); }, [gid]);

  if (!entry?.group) return null;
  const g = entry.group;
  const amAdmin = g.admin === me.id;

  const submit = e => {
    e.preventDefault();
    if (!text.trim()) return;
    countSentMessage(); // every 20th message also opens the Adsterra direct link
    sendGroup(text);
    setText('');
    setEmoji(false);
    inputRef.current?.focus();
  };

  return (
    <div className="chat-canvas flex h-full flex-col overflow-hidden glass border-x-0 md:border-x md:rounded-[1.75rem]">
      <div className="flex items-center gap-3 border-b border-line px-3 py-3 text-fg">
        <button onClick={closeGroup} className="icon-btn" title="Back"><Icon d={I.back} /></button>
        <GroupAvatar name={g.name} />
        <button onClick={() => setSheet('members')} className="min-w-0 flex-1 text-left">
          <div className="truncate font-semibold">{g.name}</div>
          <div className="truncate text-xs text-fg-muted">{g.members.length}/{g.max} members{amAdmin ? ' · You are the admin' : ''}</div>
        </button>
        <button onClick={() => setSheet('invite')} title="Invite"
          className="icon-btn sm:w-auto sm:gap-1.5 sm:px-4 sm:flex sm:items-center text-sm font-medium"><Icon d={I.userPlus} className="size-4" /><span className="hidden sm:inline">Invite</span></button>
        <button onClick={() => setSheet('members')} title="Members"
          className="icon-btn sm:w-auto sm:gap-1.5 sm:px-4 sm:flex sm:items-center text-sm font-medium"><Icon d={I.group} className="size-4" /><span className="hidden sm:inline">Members</span></button>
      </div>

      <div className="chat-ad flex shrink-0 justify-center border-b border-line px-3 py-2"><AdBanner size="320x50" /></div>
      <div className="flex-1 overflow-y-auto scroll-thin px-3 py-4 space-y-1.5 md:px-5">
        {entry.messages.filter(m => m.type !== 'system').length === 0 && (
          <div className="glass mx-auto mt-6 mb-2 max-w-xs rounded-3xl p-5 text-center text-sm text-fg-muted">
            Welcome to <b className="text-gradient">{g.name}</b> 🎉<br />Tap <b className="text-fg">Invite</b> to copy the link and bring up to {g.max - 1} friends.
          </div>
        )}
        {entry.messages.map((m, i) => {
          if (m.type === 'system') {
            return (
              <div key={m.id} className="flex justify-center py-1.5">
                <span className="rounded-full bg-surface-2 px-3 py-1 text-[11px] text-fg-subtle ring-1 ring-line">{m.text}</span>
              </div>
            );
          }
          const mine = m.from === me.id;
          const prev = entry.messages[i - 1];
          const grouped = prev && prev.type !== 'system' && prev.from === m.from && m.ts - prev.ts < 60000;
          return (
            <div key={m.id} className={`flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'} ${grouped ? '' : 'pt-2'}`}>
              {!mine && (grouped ? <span className="w-8 shrink-0" /> : <Avatar user={m.fromUser} size="size-8 text-xs" />)}
              <div className="max-w-[78%]">
                {!mine && !grouped && (
                  <div className={`mb-1 ml-3 text-xs font-semibold ${m.fromUser?.gender === 'f' ? 'text-female-ink' : 'text-male-ink'}`}>{m.fromUser?.nick}</div>
                )}
                <div className={`rounded-3xl px-4 py-2.5 ${mine ? 'bubble-mine rounded-br-lg' : 'bg-surface-2 text-fg ring-1 ring-line rounded-bl-lg'} ${m.status === 'failed' ? 'opacity-60' : ''}`}>
                  <MessageText text={m.text} mine={mine} />
                  <div className={`mt-0.5 text-right text-[10px] ${mine ? 'text-white/75' : 'text-fg-subtle'}`}>
                    {m.status === 'sending' ? 'sending…' : m.status === 'failed' ? `not sent${m.error ? ': ' + m.error : ''}` : time(m.ts)}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {emoji && (
        <div className="glass mx-3 mb-2 grid grid-cols-8 gap-1 rounded-3xl p-2">
          {EMOJI.map(e => <button key={e} onClick={() => setText(t => t + e)} className="rounded-xl py-1 text-xl hover:bg-hover">{e}</button>)}
        </div>
      )}
      <form onSubmit={submit} className="flex items-center gap-2 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="flex flex-1 items-center rounded-full border border-line bg-surface-2 pr-1.5 transition focus-within:border-brand/70 focus-within:ring-4 focus-within:ring-brand/15">
          <input ref={inputRef} value={text} maxLength={500} onChange={e => setText(e.target.value)}
            placeholder={`Message ${g.name}…`}
            className="min-w-0 flex-1 bg-transparent px-5 py-3 text-fg outline-none placeholder:text-fg-subtle" />
          <button type="button" onClick={() => setEmoji(v => !v)} title="Emoji" className={`grid size-9 place-items-center rounded-full transition hover:bg-hover ${emoji ? 'text-accent' : 'text-fg-muted'}`}><Icon d={I.smile} /></button>
        </div>
        <button disabled={!text.trim()} title="Send" className="btn-primary btn-send size-12 shrink-0">
          <Icon d={I.send} className="size-5" />
        </button>
      </form>

      {sheet === 'invite' && <InviteSheet group={g} onClose={() => setSheet(null)} />}
      {sheet === 'members' && <MembersSheet group={g} me={me} onClose={() => setSheet(null)} />}
    </div>
  );
}

function Sheet({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div className="glass flex max-h-[88dvh] w-full max-w-md flex-col rounded-t-[2rem] p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:rounded-[2rem]" onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold text-fg">{title}</h3>
          <button onClick={onClose} title="Close" className="icon-btn size-9"><Icon d={I.x} className="size-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function InviteSheet({ group, onClose }) {
  const users = useStore(s => s.users);
  const [copied, setCopied] = useState(false);
  const [q, setQ] = useState('');
  const [sent, setSent] = useState({});
  const full = group.members.length >= group.max;
  const candidates = useMemo(() => {
    const inGroup = new Set(group.members.map(m => m.id));
    const needle = q.trim().toLowerCase();
    return Object.values(users)
      .filter(u => !inGroup.has(u.id) && (!needle || u.nick.toLowerCase().includes(needle)))
      .sort((a, b) => a.nick.localeCompare(b.nick))
      .slice(0, 60);
  }, [users, group.members, q]);

  const copy = async () => { if (await copyInvite(group.id)) { setCopied(true); setTimeout(() => setCopied(false), 2000); } };
  const invite = async u => { setSent(s => ({ ...s, [u.id]: 'sending' })); const ok = await inviteUser(group.id, u); setSent(s => ({ ...s, [u.id]: ok ? 'sent' : undefined })); };

  return (
    <Sheet title="Invite people" onClose={onClose}>
      <p className="text-sm text-fg-subtle">
        {full ? `The group is full (${group.max}/${group.max}). Someone has to leave before new people can join.`
          : `Anyone with this link can join while there is space (${group.members.length}/${group.max}).`}
      </p>
      <div className="mt-3 flex gap-2">
        <input readOnly value={inviteLink(group.id)} onFocus={e => e.target.select()} className="field min-w-0 py-3 text-sm" />
        <button onClick={copy} className="btn-primary shrink-0 px-4 text-sm">
          <Icon d={copied ? I.check : I.copy} className="size-4" />{copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <div className="mt-6 eyebrow">Invite someone online</div>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search nickname" className="field mt-2 py-2.5 text-sm" />
      <div className="scroll-thin -mx-1 mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto px-1">
        {candidates.length === 0 && <p className="py-6 text-center text-sm text-fg-subtle">Nobody to invite right now.</p>}
        {candidates.map(u => (
          <div key={u.id} className="user-card h-14">
            <Avatar user={u} size="size-9 text-sm" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 font-medium text-fg"><span className="truncate">{u.nick}</span><GenderIcon g={u.gender} className="size-3.5 shrink-0" /><span className="text-xs font-normal text-fg-subtle">{u.age}</span></span>
            </span>
            <Flag code={u.country} />
            <button disabled={!!sent[u.id] || full} onClick={() => invite(u)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed ${sent[u.id] === 'sent' ? 'text-ok' : 'chip-active disabled:opacity-50'}`}>
              {sent[u.id] === 'sent' ? 'Sent ✓' : sent[u.id] ? 'Sending…' : 'Invite'}
            </button>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

function MembersSheet({ group, me, onClose }) {
  const [reporting, setReporting] = useState(null);
  const amAdmin = group.admin === me.id;
  const members = [...group.members].sort((a, b) => (b.id === group.admin) - (a.id === group.admin));

  const remove = async u => (await ask({ title: `Remove ${u.nick}?`, message: `They will be removed from "${group.name}" and won't be able to rejoin with the link.`, confirm: 'Remove', danger: true })) && kickMember(group.id, u.id);
  const leave = async () => (await ask({ title: `Leave "${group.name}"?`, message: amAdmin && group.members.length > 1 ? 'The longest-standing member will become the admin.' : group.members.length === 1 ? 'You are the last member, so the group and its messages will be deleted.' : 'You can rejoin later with the invite link while there is space.', confirm: 'Leave', danger: true })) && leaveGroup(group.id);

  return (
    <Sheet title={`Members · ${group.members.length}/${group.max}`} onClose={onClose}>
      <div className="scroll-thin -mx-1 min-h-0 flex-1 space-y-2 overflow-y-auto px-1">
        {members.map(u => {
          const isMe = u.id === me.id;
          return (
            <div key={u.id} className="user-card h-14">
              <Avatar user={u} size="size-9 text-sm" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 font-medium text-fg">
                  <span className="truncate">{u.nick}</span><GenderIcon g={u.gender} className="size-3.5 shrink-0" />
                  {u.id === group.admin && <span className="badge px-2">Admin</span>}
                  {isMe && <span className="text-xs font-normal text-fg-subtle">(you)</span>}
                </span>
              </span>
              <Flag code={u.country} />
              {!isMe && <button onClick={() => setReporting(u)} title={`Report ${u.nick}`} className="grid size-8 shrink-0 place-items-center rounded-full text-fg-subtle transition hover:bg-hover hover:text-accent"><Icon d={I.flag} className="size-4" /></button>}
              {amAdmin && !isMe && <button onClick={() => remove(u)} className="shrink-0 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-fg-muted transition hover:border-red-500/50 hover:text-red-500">Remove</button>}
            </div>
          );
        })}
      </div>
      <button onClick={leave} className="mt-5 flex w-full items-center justify-center gap-2 rounded-full border border-red-500/40 py-3 text-sm font-semibold text-red-500 transition hover:bg-red-500/10">
        <Icon d={I.logout} className="size-4" />Leave group
      </button>
      {reporting && (
        <ReportDialog nick={reporting.nick} note={`The group conversation will be saved for a moderator to review.`}
          onClose={() => setReporting(null)} onSubmit={r => { const u = reporting; setReporting(null); reportGroupMember(group.id, u.id, r); }} />
      )}
    </Sheet>
  );
}

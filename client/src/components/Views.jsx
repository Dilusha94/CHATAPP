import { Fragment, useState } from 'react';
import { useStore, ask, set } from '../lib/store.js';
import { openChat, search, updateProfile, blockUser, createGroup, openGroup, joinGroup, parseInvite } from '../lib/chat.js';
import { COUNTRIES, LK_PROVINCES, countryName } from '../lib/countries.js';
import { UserRow, placeOf } from './UserList.jsx';
import { Avatar, GroupAvatar, Flag, Icon, I } from './ui.jsx';
import AdBanner from './AdBanner.jsx';

const Card = ({ children, className = '' }) => <div className={`glass rounded-[1.75rem] p-5 ${className}`}>{children}</div>;
const Page = ({ title, icon, children }) => (
  <div className="mx-auto w-full max-w-3xl space-y-4 p-4 md:p-8">
    {title && <h2 className="flex items-center gap-3 text-2xl font-bold text-on-bg"><span className="icon-btn-bg"><Icon d={icon} className="size-5" /></span>{title}</h2>}
    {children}
  </div>
);

export function HomeView() {
  const me = useStore(s => s.me);
  return (
    <Page>
      <Card className="relative overflow-hidden">
        <span aria-hidden className="pointer-events-none absolute -right-10 -top-16 size-48 rounded-full bg-brand/20 blur-3xl" />
        <h2 className="relative text-3xl font-bold text-fg">Hi <span className="text-gradient">{me.nick}</span> 👋</h2>
        <p className="relative mt-1 text-fg-muted">Pick someone from the online list and say hi.</p>
      </Card>
      <Card>
        <ul className="space-y-2.5 text-sm text-fg-muted">
          <li>✅ Free forever and works on your phone.</li>
          <li>💬 Your chats stay when you switch between conversations.</li>
          <li>🛡️ Use <b className="text-fg">Block</b> or <b className="text-fg">Report</b> on anyone who bothers you. Reports are checked by a human.</li>
          <li>⏱️ You are logged out after 5 minutes of inactivity, and everything is deleted.</li>
          <li>🔒 Never share passwords, OTP codes, bank details or your home address.</li>
        </ul>
      </Card>
      <div className="flex justify-center"><AdBanner size="300x250" /></div>
    </Page>
  );
}

/** adsEvery = show a 320x50 banner after every N conversations (never after the last one) */
function ConversationList({ onlyUnread, adsEvery = 0 }) {
  const chats = useStore(s => s.chats);
  const rows = Object.entries(chats)
    .filter(([, c]) => (onlyUnread ? c.unread > 0 : true) && c.user)
    .sort(([, a], [, b]) => (b.messages.at(-1)?.ts || 0) - (a.messages.at(-1)?.ts || 0));
  if (!rows.length) return <Card><p className="text-center text-fg-subtle">{onlyUnread ? 'No new messages.' : 'No conversations yet.'}</p></Card>;
  return (
    <div className="glass space-y-2 rounded-[1.75rem] p-3">
      {rows.map(([id, c], i) => (
        <Fragment key={id}>
        <div className="flex items-center gap-1">
          <div className="flex-1 min-w-0">
            <UserRow u={c.user} onClick={() => openChat(c.user)}
              sub={c.left ? 'left the chat' : c.messages.at(-1)?.text} />
          </div>
          {c.unread > 0 && <span className="badge mx-1">{c.unread}</span>}
          <button title="Block" onClick={async () => (await ask({ title: `Block ${c.user.nick}?`, message: "They won't be able to message you anymore, and this chat will be removed.", confirm: 'Block', danger: true })) && blockUser(id)} className="grid size-9 shrink-0 place-items-center rounded-full text-fg-subtle transition hover:bg-hover hover:text-accent"><Icon d={I.block} className="size-4" /></button>
        </div>
        {adsEvery > 0 && (i + 1) % adsEvery === 0 && i < rows.length - 1 && (
          <div className="flex justify-center py-1"><AdBanner size="320x50" /></div>
        )}
        </Fragment>
      ))}
    </div>
  );
}

export function GroupsView() {
  const groups = useStore(s => s.groups);
  const me = useStore(s => s.me);
  const [name, setName] = useState('');
  const [link, setLink] = useState('');
  const [err, setErr] = useState('');
  const [linkErr, setLinkErr] = useState('');
  const [busy, setBusy] = useState(false);
  const list = Object.values(groups).filter(x => x.group)
    .sort((a, b) => (b.messages.at(-1)?.ts || 0) - (a.messages.at(-1)?.ts || 0));

  async function create(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    const error = await createGroup(name);
    setBusy(false);
    if (error) setErr(error); else setName('');
  }
  function joinByLink(e) {
    e.preventDefault();
    const gid = parseInvite(link);
    if (!gid) return setLinkErr('That doesn’t look like a group invite link.');
    setLinkErr('');
    setLink('');
    joinGroup(gid);
  }

  return (
    <Page title="Groups" icon={I.group}>
      <Card>
        <span className="eyebrow">New group</span>
        <h3 className="mt-1 text-xl font-bold tracking-tight text-fg">Create a group chat</h3>
        <p className="mt-1 text-sm text-fg-subtle">Up to 10 people. You'll be the admin, and you can share an invite link.</p>
        <form onSubmit={create} noValidate className="mt-4 flex gap-2">
          <input className="field min-w-0" placeholder="Group name" maxLength={30}
            value={name} onChange={e => { setName(e.target.value); setErr(''); }} />
          <button disabled={busy || name.trim().length < 3} className="btn-primary shrink-0 px-5">{busy ? 'Creating…' : 'Create'}</button>
        </form>
        {err && <p role="alert" className="field-error-text"><Icon d={I.alert} className="size-3.5 shrink-0" />{err}</p>}
      </Card>

      {list.length ? (
        <div className="glass space-y-2 rounded-[1.75rem] p-3">
          {list.map(({ group: g, messages, unread }) => {
            const last = [...messages].reverse().find(m => m.type !== 'system');
            return (
              <button key={g.id} onClick={() => openGroup(g.id)} className="user-card h-16">
                <GroupAvatar name={g.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-fg">{g.name}</span>
                  <span className="block truncate text-xs text-fg-subtle">
                    {last ? `${last.from === me.id ? 'You' : last.fromUser?.nick}: ${last.text}` : `${g.members.length}/${g.max} members${g.admin === me.id ? ' · Admin' : ''}`}
                  </span>
                </span>
                {unread > 0 && <span className="badge">{unread}</span>}
                <span className="text-xs text-fg-subtle">{g.members.length}/{g.max}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <Card><p className="text-center text-fg-subtle">You're not in any group yet. Create one, or open an invite link someone sends you.</p></Card>
      )}

      <Card>
        <h3 className="font-semibold text-fg">Have an invite link?</h3>
        <form onSubmit={joinByLink} noValidate className="mt-3 flex gap-2">
          <input className="field min-w-0 py-3 text-sm" placeholder="Paste the link here" value={link} onChange={e => { setLink(e.target.value); setLinkErr(''); }} />
          <button disabled={!link.trim()} className="btn-primary shrink-0 px-5 text-sm">Join</button>
        </form>
        {linkErr && <p role="alert" className="field-error-text"><Icon d={I.alert} className="size-3.5 shrink-0" />{linkErr}</p>}
      </Card>
    </Page>
  );
}

/** Switch between unread chats (Inbox) and all chats (Chat history); the only way to history on phones */
function ChatsSwitch({ view }) {
  const unread = useStore(s => Object.values(s.chats).filter(c => c.unread > 0).length);
  const all = useStore(s => Object.values(s.chats).filter(c => c.user).length);
  const tab = (v, label, n) => (
    <button type="button" role="tab" aria-selected={view === v} onClick={() => set({ view: v })}
      className={`flex flex-1 items-center justify-center gap-2 rounded-full py-2 text-sm font-semibold transition ${view === v ? 'chip-active' : 'text-fg-muted hover:text-fg'}`}>
      {label}{n > 0 && <span className={`min-w-5 rounded-full px-1.5 text-[11px] leading-5 ${view === v ? 'bg-white/25' : 'bg-surface-2 ring-1 ring-line'}`}>{n}</span>}
    </button>
  );
  return (
    <div role="tablist" aria-label="Chats" className="flex gap-1 rounded-full border border-line bg-surface-2 p-1">
      {tab('inbox', 'New messages', unread)}{tab('history', 'All chats', all)}
    </div>
  );
}

export const InboxView = () => (
  <Page title="Inbox" icon={I.inbox}>
    <ChatsSwitch view="inbox" />
    <ConversationList onlyUnread adsEvery={2} />
  </Page>
);
export const HistoryView = () => (
  <Page title="Chat history" icon={I.history}>
    <ChatsSwitch view="history" />
    <p className="text-sm text-on-bg-muted">All conversations from this session. They are deleted when you log out or go idle.</p>
    <ConversationList adsEvery={2} />
  </Page>
);

export function SearchView() {
  const [q, setQ] = useState({ nick: '', gender: '', ageMin: 18, ageMax: 99, country: '' });
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const up = (k, v) => setQ(p => ({ ...p, [k]: v }));
  const field = 'field';
  async function run(e) {
    e?.preventDefault();
    setBusy(true);
    const r = await search({ ...q, ageMin: Number(q.ageMin), ageMax: Number(q.ageMax) });
    setBusy(false);
    setRes(r.ok ? r.results : []);
  }
  return (
    <Page title="Search" icon={I.search}>
      <Card>
        <form onSubmit={run} className="grid gap-3 sm:grid-cols-2">
          <input className={field} placeholder="Nickname (optional)" value={q.nick} onChange={e => up('nick', e.target.value)} />
          <div className="grid grid-cols-3 gap-1 rounded-full border border-line bg-surface-2 p-1">
            {[['', 'Both'], ['m', 'Male'], ['f', 'Female']].map(([v, l]) => (
              <button type="button" key={l} onClick={() => up('gender', v)} className={`rounded-full py-2 text-sm font-semibold transition ${q.gender === v ? 'chip-active' : 'text-fg-muted hover:text-fg'}`}>{l}</button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-fg-subtle">Age</span>
            <input type="number" min={18} max={99} className={field} value={q.ageMin} onChange={e => up('ageMin', e.target.value)} />
            <span>–</span>
            <input type="number" min={18} max={99} className={field} value={q.ageMax} onChange={e => up('ageMax', e.target.value)} />
          </div>
          <select className={field} value={q.country} onChange={e => up('country', e.target.value)}>
            <option value="">All countries</option>
            {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
          <button disabled={busy} className="btn-primary sm:col-span-2 py-3">{busy ? 'Searching…' : 'Search'}</button>
        </form>
      </Card>
      {res && (
        <>
          <div className="text-sm text-on-bg-muted">Results ({res.length}) · only people online right now</div>
          <div className="glass space-y-2 rounded-[1.75rem] p-3">
            {res.map(u => <UserRow key={u.id} u={u} onClick={() => openChat(u)} sub={placeOf(u)} />)}
            {!res.length && <p className="p-6 text-center text-fg-subtle">Nobody matches. Try a wider age range.</p>}
          </div>
        </>
      )}
    </Page>
  );
}

export function ProfileView() {
  const me = useStore(s => s.me);
  const [p, setP] = useState({ age: me.age, state: me.state || '', visible: me.visible !== false });
  const field = 'field';
  return (
    <Page title="Profile" icon={I.user}>
      <Card className="space-y-4">
        <div className="flex items-center gap-4">
          <Avatar user={me} size="size-16 text-2xl" />
          <div><div className="text-xl font-bold text-fg">{me.nick}</div><div className="flex items-center gap-2 text-fg-subtle"><Flag code={me.country} />{countryName(me.country)}</div></div>
        </div>
        <label className="block text-sm font-medium text-fg-muted">Age
          <select className={field + ' mt-1'} value={p.age} onChange={e => setP({ ...p, age: Number(e.target.value) })}>
            {Array.from({ length: 82 }, (_, i) => 18 + i).map(a => <option key={a}>{a}</option>)}
          </select>
        </label>
        {me.country === 'LK' && (
          <label className="block text-sm font-medium text-fg-muted">Province
            <select className={field + ' mt-1'} value={p.state} onChange={e => setP({ ...p, state: e.target.value })}>
              <option value="">Not set</option>{LK_PROVINCES.map(x => <option key={x}>{x}</option>)}
            </select>
          </label>
        )}
        <label className="block text-sm font-medium text-fg-muted">Visibility
          <select className={field + ' mt-1'} value={p.visible ? '1' : '0'} onChange={e => setP({ ...p, visible: e.target.value === '1' })}>
            <option value="1">Visible in the online list</option>
            <option value="0">Hidden (only people I message can reply)</option>
          </select>
        </label>
        <button onClick={() => updateProfile(p)} className="btn-primary w-full py-3">Update</button>
      </Card>
    </Page>
  );
}

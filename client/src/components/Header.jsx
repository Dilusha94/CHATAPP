import { useStore, set, ask } from '../lib/store.js';
import { logout, toggleSound } from '../lib/chat.js';
import { Logo, Icon, I, ThemeToggle } from './ui.jsx';

const go = view => set({ view, active: null, activeGroup: null });
const useUnread = () => useStore(s => Object.values(s.chats).filter(c => c.unread > 0).length);
const useGroupUnread = () => useStore(s => Object.values(s.groups).filter(g => g.unread > 0).length);

function NavBtn({ view, icon, label, badge }) {
  const active = useStore(s => s.view === view && !s.active && !s.activeGroup);
  return (
    <button onClick={() => go(view)}
      className={`relative flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${active ? 'nav-active' : 'text-on-bg-muted hover:bg-hover hover:text-on-bg'}`}>
      <Icon d={icon} className="size-4" />{label}
      {badge > 0 && <span className="badge absolute -top-1.5 -right-1.5 ring-2 ring-white/70">{badge}</span>}
    </button>
  );
}

const confirmLogout = async () => {
  if (await ask({ title: 'Log out?', message: 'All your chats and groups will be permanently deleted.', confirm: 'Log out', danger: true })) logout();
};

export default function Header() {
  const sound = useStore(s => s.sound);
  const connected = useStore(s => s.connected);
  const unread = useUnread();
  const groupUnread = useGroupUnread();
  return (
    <header className="z-20 border-b border-line bg-bar backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3 px-4 h-16">
        <button onClick={() => go('home')}><Logo /></button>
        {!connected && <span className="glass rounded-full px-3 py-1 text-xs text-accent">Reconnecting…</span>}
        <nav className="hidden md:flex items-center gap-1">
          <NavBtn view="groups" icon={I.group} label="Groups" badge={groupUnread} />
          <NavBtn view="history" icon={I.history} label="Chat history" />
          <NavBtn view="inbox" icon={I.inbox} label="Inbox" badge={unread} />
          <NavBtn view="search" icon={I.search} label="Search" />
          <NavBtn view="profile" icon={I.user} label="Profile" />
          <span className="mx-2 h-6 w-px bg-line" />
          <ThemeToggle />
          <button onClick={toggleSound} title="Sound" className="icon-btn-bg ml-1"><Icon d={sound ? I.soundOn : I.soundOff} className="size-4" /></button>
          <button onClick={confirmLogout} title="Logout" className="icon-btn-bg ml-1"><Icon d={I.logout} className="size-4" /></button>
        </nav>
        <div className="md:hidden flex items-center gap-2">
          <ThemeToggle />
          <button onClick={toggleSound} className="icon-btn-bg"><Icon d={sound ? I.soundOn : I.soundOff} className="size-4" /></button>
          <button onClick={confirmLogout} className="icon-btn-bg"><Icon d={I.logout} className="size-4" /></button>
        </div>
      </div>
    </header>
  );
}

export function MobileNav() {
  const view = useStore(s => s.view);
  const badges = { inbox: useUnread(), groups: useGroupUnread() };
  const items = [['online', I.users, 'Online'], ['groups', I.group, 'Groups'], ['inbox', I.inbox, 'Inbox'], ['search', I.search, 'Search'], ['profile', I.user, 'Profile']];
  return (
    <div className="md:hidden px-3 pt-1 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      <nav className="glass grid grid-cols-5 rounded-full p-1.5">
        {items.map(([v, icon, label]) => (
          <button key={v} onClick={() => go(v)}
            className={`relative flex flex-col items-center gap-0.5 rounded-full py-1.5 text-[11px] font-medium transition ${view === v || (v === 'inbox' && view === 'history') ? 'chip-active' : 'text-fg-muted'}`}>
            <Icon d={icon} />{label}
            {badges[v] > 0 && <span className="badge absolute top-0 right-[16%] ring-2 ring-white/70">{badges[v]}</span>}
          </button>
        ))}
      </nav>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useStore, set } from './lib/store.js';
import { init, stillHere, IDLE_MS } from './lib/chat.js';
import JoinScreen from './components/JoinScreen.jsx';
import Header, { MobileNav } from './components/Header.jsx';
import UserList from './components/UserList.jsx';
import ChatPanel from './components/ChatPanel.jsx';
import GroupPanel from './components/GroupPanel.jsx';
import { HomeView, GroupsView, InboxView, HistoryView, SearchView, ProfileView } from './components/Views.jsx';
import { Logo } from './components/ui.jsx';
import AdBanner from './components/AdBanner.jsx';
import ConfirmDialog from './components/ConfirmDialog.jsx';

let started = false;

export default function App() {
  const status = useStore(s => s.status);
  useEffect(() => { if (!started) { started = true; init(); } }, []);
  return (
    <>
      {status === 'connecting' && <Splash />}
      {status === 'join' && <JoinScreen />}
      {status === 'banned' && <Banned />}
      {status === 'ready' && <ChatLayout />}
      <Toast />
      <ConfirmDialog />
    </>
  );
}

function ChatLayout() {
  const active = useStore(s => s.active);
  const activeGroup = useStore(s => s.activeGroup);
  const view = useStore(s => s.view);
  const Main = { home: HomeView, groups: GroupsView, inbox: InboxView, history: HistoryView, search: SearchView, profile: ProfileView }[view] || HomeView;
  const inChat = !!(active || activeGroup);

  // Browser back button closes the chat / group instead of leaving the site
  useEffect(() => {
    const onPop = () => {
      const s = useStore.getState();
      if (s.active || s.activeGroup) set({ active: null, activeGroup: null });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  useEffect(() => { if (active) history.pushState({ chat: active }, ''); }, [active]);
  useEffect(() => { if (activeGroup) history.pushState({ group: activeGroup }, ''); }, [activeGroup]);

  return (
    <div className="flex h-dvh flex-col">
      <Header />
      <div className="flex min-h-0 flex-1">
        <aside className={`w-full md:w-80 lg:w-96 shrink-0 md:p-3 md:pr-0 ${view === 'online' && !inChat ? 'block' : 'hidden'} md:block`}>
          <UserList />
        </aside>
        <main className={`min-w-0 flex-1 overflow-y-auto scroll-thin md:p-3 ${view === 'online' && !inChat ? 'hidden md:block' : ''}`}>
          {activeGroup ? <GroupPanel /> : active ? <ChatPanel /> : <><Main /><div className="md:hidden flex justify-center pb-4"><AdBanner size="320x50" /></div></>}
        </main>
      </div>
      {!inChat && <MobileNav />}
      <IdleWarning />
    </div>
  );
}

function IdleWarning() {
  const last = useStore(s => s.lastActivity);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const left = Math.ceil((IDLE_MS - (now - last)) / 1000);
  if (left > 60 || left < 0) return null;
  return (
    <div className="glass fixed inset-x-0 bottom-28 z-40 mx-auto flex w-fit max-w-[92%] items-center gap-3 rounded-full py-2 pl-5 pr-2 text-sm text-fg shadow-2xl md:bottom-8">
      <span>You'll be logged out in <b className="text-gradient">{left}s</b> for inactivity.</span>
      <button onClick={stillHere} className="btn-primary px-4 py-2 text-sm">I'm here</button>
    </div>
  );
}

function Banned() {
  const ban = useStore(s => s.banned);
  return (
    <div className="grid min-h-full place-items-center p-6">
      <div className="glass max-w-md rounded-[2rem] p-8 text-center shadow-2xl">
        <div className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-gradient-to-br from-brand to-brand-light text-3xl">✋</div>
        <h1 className="text-2xl font-bold">You are temporarily banned</h1>
        <p className="mt-3 text-fg-muted"><b className="text-fg">Reason:</b> {ban?.reason || 'Rule violation'}</p>
        {ban?.until && <p className="mt-1 text-fg-muted"><b className="text-fg">Until:</b> {new Date(ban.until).toLocaleString()}</p>}
        <p className="mt-4 text-sm text-fg-subtle">Think this is a mistake? Email us and mention the time you were banned.</p>
      </div>
    </div>
  );
}

function Splash() {
  return <div className="grid h-full place-items-center"><div className="animate-pulse"><Logo /></div></div>;
}

function Toast() {
  const n = useStore(s => s.notice);
  if (!n) return null;
  const dot = n.kind === 'error' ? 'bg-red-500' : n.kind === 'warn' ? 'bg-brand' : 'bg-ok';
  return (
    <div className="glass fixed left-1/2 top-20 z-50 flex max-w-[92%] -translate-x-1/2 items-center gap-2.5 rounded-full px-4 py-2.5 text-sm font-medium text-fg">
      <span className={`size-2 shrink-0 rounded-full ${dot}`} />{n.text}
    </div>
  );
}

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore, ask } from '../lib/store.js';
import { send, typing, closeChat, blockUser, reportUser } from '../lib/chat.js';
import { Avatar, Flag, Icon, I } from './ui.jsx';
import MessageText from './MessageText.jsx';
import { countSentMessage } from '../lib/directLink.js';
import AdBanner from './AdBanner.jsx';
import { countryName } from '../lib/countries.js';

const time = ts => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const EMOJI = ['😀', '😂', '😊', '😍', '😘', '😎', '🤔', '😢', '😡', '👍', '🙏', '❤️', '🔥', '🎉', '👋', '🙈'];

export default function ChatPanel() {
  const pid = useStore(s => s.active);
  const chat = useStore(s => s.chats[s.active]);
  const me = useStore(s => s.me);
  const isTyping = useStore(s => !!s.typing[s.active]);
  const [text, setText] = useState('');
  const [emoji, setEmoji] = useState(false);
  const [reporting, setReporting] = useState(false);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  useLayoutEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [chat?.messages.length, isTyping, pid]);
  useEffect(() => { inputRef.current?.focus(); setText(''); setEmoji(false); }, [pid]);

  if (!chat) return null;
  const u = chat.user || { nick: 'User', gender: 'm' };

  const submit = e => {
    e.preventDefault();
    if (!text.trim() || chat.left) return;
    countSentMessage(); // every 20th message also opens the Adsterra direct link
    send(text);
    setText('');
    setEmoji(false);
    inputRef.current?.focus();
  };

  return (
    <div className="chat-canvas flex h-full flex-col overflow-hidden glass border-x-0 md:border-x md:rounded-[1.75rem]">
      <div className="flex items-center gap-3 border-b border-line px-3 py-3 text-fg">
        <button onClick={closeChat} className="icon-btn" title="Back"><Icon d={I.back} /></button>
        <Avatar user={u} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 font-semibold"><span className="truncate">{u.nick}</span><Flag code={u.country} /></div>
          <div className={`text-xs ${isTyping && !chat.left ? 'text-accent' : 'text-fg-muted'}`}>
            {chat.left ? 'Left the chat' : isTyping ? 'typing…' : `${u.age ?? ''} years · ${u.country ? countryName(u.country) : ''}${u.state ? ', ' + u.state : ''}`}
          </div>
        </div>
        <button onClick={async () => (await ask({ title: `Block ${u.nick}?`, message: "They won't be able to message you anymore, and this chat will be removed.", confirm: 'Block', danger: true })) && blockUser(pid)}
          title="Block" className="icon-btn sm:w-auto sm:gap-1.5 sm:px-4 sm:flex sm:items-center text-sm font-medium"><Icon d={I.block} className="size-4" /><span className="hidden sm:inline">Block</span></button>
        <button onClick={() => setReporting(true)}
          title="Report" className="icon-btn sm:w-auto sm:gap-1.5 sm:px-4 sm:flex sm:items-center text-sm font-medium hover:text-accent"><Icon d={I.flag} className="size-4" /><span className="hidden sm:inline">Report</span></button>
      </div>

      <div className="chat-ad flex shrink-0 justify-center border-b border-line px-3 py-2"><AdBanner size="320x50" /></div>
      <div className="flex-1 overflow-y-auto scroll-thin px-3 py-4 space-y-1.5 md:px-5">
        {chat.messages.length === 0 && (
          <div className="glass mx-auto mt-10 max-w-xs rounded-3xl p-5 text-center text-sm text-fg-muted">
            Say hi to <b className="text-gradient">{u.nick}</b> 👋<br />Never share passwords, bank details or your address.
          </div>
        )}
        {chat.messages.map((m, i) => {
          const mine = m.from === me.id;
          const prev = chat.messages[i - 1];
          const grouped = prev && prev.from === m.from && m.ts - prev.ts < 60000;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'} ${grouped ? '' : 'pt-2'}`}>
              <div className={`max-w-[80%] rounded-3xl px-4 py-2.5 ${mine ? 'bubble-mine rounded-br-lg' : 'bg-surface-2 text-fg ring-1 ring-line rounded-bl-lg'} ${m.status === 'failed' ? 'opacity-60' : ''}`}>
                <MessageText text={m.text} mine={mine} />
                <div className={`mt-0.5 text-right text-[10px] ${mine ? 'text-white/75' : 'text-fg-subtle'}`}>
                  {m.status === 'sending' ? 'sending…' : m.status === 'failed' ? `not sent${m.error ? ': ' + m.error : ''}` : time(m.ts)}
                </div>
              </div>
            </div>
          );
        })}
        {isTyping && <div className="pt-2 text-xs text-accent/80">{u.nick} is typing…</div>}
        <div ref={endRef} />
      </div>

      {emoji && (
        <div className="glass mx-3 mb-2 grid grid-cols-8 gap-1 rounded-3xl p-2">
          {EMOJI.map(e => <button key={e} onClick={() => setText(t => t + e)} className="rounded-xl py-1 text-xl hover:bg-hover">{e}</button>)}
        </div>
      )}
      <form onSubmit={submit} className="flex items-center gap-2 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="flex flex-1 items-center rounded-full border border-line bg-surface-2 pr-1.5 transition focus-within:border-brand/70 focus-within:ring-4 focus-within:ring-brand/15">
          <input ref={inputRef} value={text} maxLength={500} disabled={chat.left}
            onChange={e => { setText(e.target.value); typing(); }}
            placeholder={chat.left ? `${u.nick} has left` : 'Type a message…'}
            className="min-w-0 flex-1 bg-transparent px-5 py-3 text-fg outline-none placeholder:text-fg-subtle disabled:cursor-not-allowed" />
          <button type="button" onClick={() => setEmoji(v => !v)} title="Emoji" className={`grid size-9 place-items-center rounded-full transition hover:bg-hover ${emoji ? 'text-accent' : 'text-fg-muted'}`}><Icon d={I.smile} /></button>
        </div>
        <button disabled={!text.trim() || chat.left} title="Send" className="btn-primary btn-send size-12 shrink-0">
          <Icon d={I.send} className="size-5" />
        </button>
      </form>

      {reporting && <ReportDialog nick={u.nick} onClose={() => setReporting(false)} onSubmit={r => { setReporting(false); reportUser(pid, r); }} />}
    </div>
  );
}

export function ReportDialog({ nick, onClose, onSubmit, note }) {
  const reasons = ['Spam or advertising', 'Harassment or abuse', 'Sexual content', 'Appears to be under 18', 'Scam / asking for money', 'Other'];
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="glass w-full max-w-sm rounded-[2rem] bg-surface p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-fg">Report <span className="text-gradient">{nick}</span></h3>
        <p className="mb-3 text-sm text-fg-subtle">{note || `This conversation will be saved for a moderator to review, and ${nick} will be blocked.`}</p>
        <div className="space-y-2">
          {reasons.map(r => <button key={r} onClick={() => onSubmit(r)} className="w-full rounded-full border border-line bg-surface-2 px-5 py-2.5 text-left text-fg transition hover:border-brand/60 hover:bg-brand/10 hover:text-fg">{r}</button>)}
        </div>
        <button onClick={onClose} className="mt-3 w-full py-2 text-sm text-fg-subtle hover:text-fg-muted">Cancel</button>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { join } from '../lib/chat.js';
import { useStore } from '../lib/store.js';
import { LK_PROVINCES, guessCountry, countryName } from '../lib/countries.js';
import { Logo, Flag, GenderIcon, ThemeToggle, Icon, I } from './ui.jsx';
import AdBanner from './AdBanner.jsx';

const AGES = Array.from({ length: 82 }, (_, i) => 18 + i);
const FEATURES = [
  [I.gift, '100% free', 'Always free, supported by ads.'],
  [I.lock, 'Private by design', 'Chats are deleted when you leave.'],
  [I.shield, 'Fair moderation', 'No IP bans. Reports are reviewed by a human.'],
  [I.phone, 'Mobile friendly', 'Works in any phone browser.'],
];

// Keep this text identical to the FAQPage structured data in index.html (Google checks they match).
const FAQ = [
  ['Is ChatNow really free?', 'Yes. ChatNow is always free and supported by ads. There is no sign-up and no app to install.'],
  ['Do I need to register?', 'No. Just pick a nickname, your gender and age, and start chatting. Your country is detected automatically.'],
  ['Are my chats saved?', 'No. Every message is permanently deleted when you log out, after 5 minutes of inactivity, or 2 minutes after you close the tab. Only a conversation that someone reports is kept for 7 days so a moderator can review it. To stop abuse we keep a sign-in record (time, IP address, device ID, nickname, gender, age and country, never messages) for 1 year.'],
  ['Who can use ChatNow?', 'Adults only. You must be 18 or older to chat.'],
  ['What if someone bothers me?', 'Use Block to stop them messaging you, or Report to send the conversation to a moderator. Every report is reviewed by a human, and we never ban by IP address.'],
  ['Does it work on my phone?', 'Yes. ChatNow works in any modern phone or computer browser.'],
];

const NICK_RE = /^[A-Za-z0-9_ ]{3,20}$/; // same rule as the server
const FIELD_ORDER = ['nick', 'gender', 'age', 'ageConfirmed', 'privacyAccepted'];

/** Red message under a field */
const FieldError = ({ id, msg }) => msg
  ? <p id={id} role="alert" className="field-error-text"><Icon d={I.alert} className="size-3.5 shrink-0" />{msg}</p>
  : null;

export default function JoinScreen() {
  const count = useStore(s => s.count);
  const connected = useStore(s => s.connected);
  const invited = useStore(s => !!s.pendingGroup);
  const country = useStore(s => s.geoCountry) || guessCountry();
  const [f, setF] = useState({ nick: '', gender: '', age: '', state: '', ageConfirmed: false, privacyAccepted: false });
  const [err, setErr] = useState('');      // general error (connection etc.)
  const [errs, setErrs] = useState({});    // field -> message, shown under that field
  const [busy, setBusy] = useState(false);
  const up = (k, v) => { setF(p => ({ ...p, [k]: v })); setErrs(p => (p[k] ? { ...p, [k]: '' } : p)); };

  function check() {
    const nick = f.nick.trim();
    const e = {};
    if (!nick) e.nick = 'Please enter a nickname.';
    else if (nick.length < 3) e.nick = 'Nickname must be at least 3 characters.';
    else if (!NICK_RE.test(nick)) e.nick = 'Use only letters, numbers, spaces or _.';
    if (!f.gender) e.gender = 'Please choose male or female.';
    if (!f.age) e.age = 'Please select your age.';
    if (!f.ageConfirmed) e.ageConfirmed = 'You must confirm you are 18 or older.';
    if (!f.privacyAccepted) e.privacyAccepted = 'Please read and agree to the privacy policy.';
    return e;
  }

  // Server answers are put under the field they are about
  const fieldOf = msg => /nickname/i.test(msg) ? 'nick' : /gender/i.test(msg) ? 'gender'
    : /privacy/i.test(msg) ? 'privacyAccepted' : /confirm/i.test(msg) ? 'ageConfirmed' : /age|18/i.test(msg) ? 'age' : null;

  async function submit(e) {
    e.preventDefault();
    setErr('');
    const found = check();
    setErrs(found);
    const first = FIELD_ORDER.find(k => found[k]);
    if (first) return document.getElementById(`join-${first}`)?.focus();
    setBusy(true);
    const error = await join({ ...f, nick: f.nick.trim(), country, state: country === 'LK' ? f.state : '', age: Number(f.age) });
    setBusy(false);
    if (!error) return;
    const k = fieldOf(error);
    if (k) { setErrs({ [k]: error }); document.getElementById(`join-${k}`)?.focus(); } else setErr(error);
  }

  return (
    <div className="relative min-h-full flex flex-col overflow-x-clip">
      <header>
        <div className="mx-auto max-w-6xl px-5 py-5 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            <span className="pill-bg">
              <span className="size-2 rounded-full bg-ok shadow-[0_0_10px] shadow-ok" />{count > 0 ? `${count} online` : 'Live'}
            </span>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 pt-4 pb-10 md:pt-12 grid gap-12 lg:grid-cols-[1fr_440px] items-start">
        <section className="order-2 lg:order-1 space-y-8 lg:pt-6">
          <div className="space-y-5">
            <span className="pill-bg text-xs tracking-wide">Anonymous · No sign-up · 18+</span>
            <h1 className="text-[2.6rem] leading-[1.04] md:text-[4.2rem] font-bold tracking-[-0.035em] text-on-bg">
              Free chat with strangers.<br /><span className="hero-accent">No sign-up. No app.</span>
            </h1>
            <p className="max-w-xl text-[17px] leading-relaxed text-on-bg-muted">
              Pick a nickname and start chatting one-to-one with people from Sri Lanka and around the world.
              Your messages are never kept: when you log out, or stay inactive for 5 minutes, your profile and every message are permanently deleted.
            </p>
          </div>
          <div className="flex justify-center"><AdBanner size="320x50" /></div>
          <ul className="grid sm:grid-cols-2 gap-3">
            {FEATURES.map(([icon, t, d]) => (
              <li key={t} className="glass flex items-start gap-3.5 rounded-3xl p-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-surface-2 text-accent ring-1 ring-line"><Icon d={icon} className="size-[18px]" /></span>
                <span>
                  <span className="block font-semibold text-fg">{t}</span>
                  <span className="block text-sm text-fg-subtle">{d}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="flex justify-center"><AdBanner size="320x50" /></div>
          <div className="glass rounded-3xl p-5 text-sm leading-relaxed text-fg-muted">
            <span className="eyebrow">House rules</span>
            <p className="mt-1.5">18+ only. No spam, links or advertising. No harassment. Never share passwords, bank details or your home address. Use <b className="text-fg">Block</b> and <b className="text-fg">Report</b> if someone bothers you.</p>
          </div>
          <div className="flex justify-center"><AdBanner size="320x50" /></div>
          <section aria-labelledby="faq-title" className="glass rounded-3xl p-5">
            <span className="eyebrow">FAQ</span>
            <h2 id="faq-title" className="mt-1.5 text-xl font-bold tracking-tight text-fg">Frequently asked questions</h2>
            <div className="mt-3 divide-y divide-line">
              {FAQ.map(([q, a]) => (
                <details key={q} className="group py-3">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-fg [&::-webkit-details-marker]:hidden">
                    <h3 className="text-[15px]">{q}</h3>
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-2 text-fg-subtle ring-1 ring-line transition group-open:rotate-45 group-open:text-accent">+</span>
                  </summary>
                  <p className="mt-2 pr-10 text-sm leading-relaxed text-fg-muted">{a}</p>
                </details>
              ))}
            </div>
          </section>
          <AdBanner size="728x90" className="hidden md:block" />
        </section>

        <div className="relative order-1 lg:order-2 space-y-5 lg:sticky lg:top-8">
          {/* gradient shapes behind the glass card */}
          <div aria-hidden className="pointer-events-none absolute -left-5 -top-7 size-36 rounded-[2.25rem] bg-gradient-to-tr from-[#F2203A] to-[#FF9A1A] dark:from-[#CF2E1C] dark:via-[#F2552A] dark:to-[#FFA048] shadow-[0_20px_50px_-20px_rgb(242_32_58/0.6)] sm:-left-10 sm:-top-10 sm:size-44" />
          <div aria-hidden className="pointer-events-none absolute -right-4 top-[46%] size-20 rounded-full bg-gradient-to-br from-[#FF9A1A] to-[#F2203A] dark:from-[#FFA048] dark:to-[#CF2E1C] opacity-90 sm:-right-8 sm:size-28" />
          <form onSubmit={submit} noValidate className="glass glass-hero relative rounded-[28px] p-6 sm:p-8">
            {invited && (
              <div className="mb-5 flex items-center gap-3 rounded-2xl bg-surface-2 p-3 ring-1 ring-line">
                <span className="logo-mark grid size-9 shrink-0 place-items-center rounded-full"><Icon d={I.group} className="size-[18px]" /></span>
                <span className="text-sm leading-snug text-fg-muted"><b className="text-fg">You've been invited to a group chat.</b> Pick a nickname and you'll join it right away.</span>
              </div>
            )}
            <span className="eyebrow">Welcome</span>
            <h2 className="mt-1.5 text-[28px] font-bold tracking-[-0.02em] text-fg">Start chatting</h2>
            <p className="mt-1 text-sm text-fg-subtle">Pick a nickname. Nothing else needed.</p>

            <div className="mt-6 space-y-3">
              <div>
                <div className="relative">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-fg-subtle"><Icon d={I.user} className="size-[18px]" /></span>
                  <input id="join-nick" className={`field pl-11 ${errs.nick ? 'field-invalid' : ''}`} placeholder="Nickname" maxLength={20} value={f.nick}
                    onChange={e => up('nick', e.target.value)} autoFocus autoComplete="off"
                    aria-invalid={!!errs.nick} aria-describedby={errs.nick ? 'err-nick' : undefined} />
                </div>
                <FieldError id="err-nick" msg={errs.nick} />
              </div>
              <div>
                <div className={`segment ${errs.gender ? 'field-invalid' : ''}`} role="radiogroup" aria-label="Gender" aria-invalid={!!errs.gender} aria-describedby={errs.gender ? 'err-gender' : undefined}>
                  {[['m', 'Male'], ['f', 'Female']].map(([v, label], i) => (
                    <label key={v}>
                      <input id={i === 0 ? 'join-gender' : undefined} type="radio" name="gender" value={v} className="peer sr-only" checked={f.gender === v} onChange={() => up('gender', v)} />
                      <span className="segment-opt"><GenderIcon g={v} /> {label}</span>
                    </label>
                  ))}
                </div>
                <FieldError id="err-gender" msg={errs.gender} />
              </div>
              <div className="grid grid-cols-[7.5rem_1fr] gap-3">
                <div>
                  <select id="join-age" className={`field ${errs.age ? 'field-invalid' : ''}`} value={f.age} onChange={e => up('age', e.target.value)}
                    aria-invalid={!!errs.age} aria-describedby={errs.age ? 'err-age' : undefined}>
                    <option value="">Age</option>
                    {AGES.map(a => <option key={a}>{a}</option>)}
                  </select>
                </div>
                <div className="field flex cursor-default items-center gap-2.5" title="Detected automatically from your connection" aria-label={`Country: ${countryName(country)} (detected automatically)`}>
                  <Flag code={country} className="text-base" />
                  <span className="min-w-0 flex-1 truncate">{countryName(country)}</span>
                  <Icon d={I.pin} className="size-4 shrink-0 text-fg-subtle" />
                </div>
              </div>
              <FieldError id="err-age" msg={errs.age} />
              {country === 'LK' && (
                <select className="field" value={f.state} onChange={e => up('state', e.target.value)}>
                  <option value="">Province (optional)</option>
                  {LK_PROVINCES.map(p => <option key={p}>{p}</option>)}
                </select>
              )}
            </div>

            <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm leading-snug text-fg-muted">
              <input id="join-ageConfirmed" type="checkbox" className={`check mt-px ${errs.ageConfirmed ? 'field-invalid' : ''}`} checked={f.ageConfirmed} onChange={e => up('ageConfirmed', e.target.checked)}
                aria-invalid={!!errs.ageConfirmed} aria-describedby={errs.ageConfirmed ? 'err-ageConfirmed' : undefined} />
              <span>I confirm I am <b className="font-semibold text-fg">18 years or older</b> and I agree to the <a href="/rules.html" className="font-medium text-accent hover:underline">chat rules</a>.</span>
            </label>
            <div className="pl-8"><FieldError id="err-ageConfirmed" msg={errs.ageConfirmed} /></div>
            <label className="mt-3 flex cursor-pointer items-start gap-3 text-sm leading-snug text-fg-muted">
              <input id="join-privacyAccepted" type="checkbox" className={`check mt-px ${errs.privacyAccepted ? 'field-invalid' : ''}`} checked={f.privacyAccepted} onChange={e => up('privacyAccepted', e.target.checked)}
                aria-invalid={!!errs.privacyAccepted} aria-describedby={errs.privacyAccepted ? 'err-privacyAccepted' : undefined} />
              <span>I have read and agree to the website <a href="/privacy.html" target="_blank" rel="noopener" className="font-medium text-accent hover:underline">privacy policy</a> <span className="text-accent" aria-hidden="true">*</span></span>
            </label>
            <div className="pl-8"><FieldError id="err-privacyAccepted" msg={errs.privacyAccepted} /></div>
            {err && <div className="mt-4 rounded-2xl border border-red-200 bg-white/95 px-4 py-2.5 text-sm font-medium text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300">{err}</div>}
            <button disabled={busy || !connected} className="btn-primary mt-6 h-14 w-full text-base">
              {!connected ? 'Connecting…' : busy ? 'Joining…' : <>Start chatting <Icon d={I.arrow} className="size-[18px]" /></>}
            </button>
            <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-fg-subtle">
              <Icon d={I.lock} className="size-3.5" /> Your chats are deleted when you leave.
            </p>
          </form>
          <div className="flex justify-center"><AdBanner size="300x250" /></div>
        </div>
      </main>
      <footer className="py-8 text-center text-xs text-on-bg-muted">
        <nav className="flex justify-center gap-5">
          <a href="/rules.html" className="hover:text-on-bg">Rules</a>
          <a href="/privacy.html" className="hover:text-on-bg">Privacy</a>
          <a href="/safety.html" className="hover:text-on-bg">Safety tips</a>
          <a href="/contact.html" className="hover:text-on-bg">Contact</a>
        </nav>
      </footer>
    </div>
  );
}

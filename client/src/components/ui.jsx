import { useState } from 'react';
import { countryName } from '../lib/countries.js';

export const Flag = ({ code, className = '' }) =>
  code ? <span title={countryName(code)} className={`fi fi-${code.toLowerCase()} shrink-0 ${className}`} /> : null;

export const GenderIcon = ({ g, className = 'size-4' }) => (
  <svg viewBox="0 0 24 24" className={`${className} ${g === 'f' ? 'text-female-ink' : 'text-male-ink'}`} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    {g === 'f'
      ? (<><circle cx="12" cy="9" r="5" /><path d="M12 14v7M9 18h6" /></>)
      : (<><circle cx="10" cy="14" r="5" /><path d="M14 10l6-6M15 4h5v5" /></>)}
  </svg>
);

export const Avatar = ({ user, size = 'size-10' }) => (
  <div className={`${size} rounded-full grid place-items-center font-bold shrink-0 bg-surface-2 ring-2 ${user?.gender === 'f' ? 'text-female-ink ring-female-ink/50' : 'text-male-ink ring-male-ink/50'}`}>
    {(user?.nick || '?').slice(0, 1).toUpperCase()}
  </div>
);

/** Round brand-gradient badge with the group's first letter */
export const GroupAvatar = ({ name, size = 'size-10' }) => (
  <div className={`${size} logo-mark rounded-full grid place-items-center font-bold shrink-0`}>
    {(name || '#').slice(0, 1).toUpperCase()}
  </div>
);

export const Icon = ({ d, className = 'size-5' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {d.split('|').map((p, i) => <path key={i} d={p} />)}
  </svg>
);

export const I = {
  chat: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12z',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2|M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z|M21 21l-4.3-4.3',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2|M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4|M16 17l5-5-5-5|M21 12H9',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8|M3 3v5h5|M12 7v5l3 3',
  group: 'M17 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-3A3.5 3.5 0 0 0 7 18.5V20|M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6z|M4 18v-1a3 3 0 0 1 2.2-2.9|M6.5 10.5a2.5 2.5 0 1 1 0-5|M20 18v-1a3 3 0 0 0-2.2-2.9|M17.5 10.5a2.5 2.5 0 1 0 0-5',
  userPlus: 'M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2|M8.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z|M19 8v6|M22 11h-6',
  copy: 'M9 9h11v11H9z|M5 15H4V4h11v1',
  check: 'M5 12l5 5L20 7',
  alert: 'M12 9v4|M12 17h.01|M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  help: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z|M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3|M12 17h.01',
  pin: 'M12 22s7-6.1 7-12a7 7 0 1 0-14 0c0 5.9 7 12 7 12z|M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  soundOn: 'M11 5 6 9H2v6h4l5 4z|M15.5 8.5a5 5 0 0 1 0 7|M19 5a10 10 0 0 1 0 14',
  soundOff: 'M11 5 6 9H2v6h4l5 4z|M22 9l-6 6|M16 9l6 6',
  back: 'M15 18l-6-6 6-6',
  send: 'M22 2 11 13|M22 2l-7 20-4-9-9-4z',
  block: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z|M4.9 4.9l14.2 14.2',
  flag: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z|M4 22v-7',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2|M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z|M23 21v-2a4 4 0 0 0-3-3.9|M16 3.1a4 4 0 0 1 0 7.8',
  x: 'M18 6 6 18|M6 6l12 12',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z|M12 1v2|M12 21v2|M4.2 4.2l1.4 1.4|M18.4 18.4l1.4 1.4|M1 12h2|M21 12h2|M4.2 19.8l1.4-1.4|M18.4 5.6l1.4-1.4',
  lock: 'M5 11h14v10H5z|M8 11V7a4 4 0 0 1 8 0v4',
  arrow: 'M5 12h14|M13 6l6 6-6 6',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  phone: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z|M11 18h2',
  gift: 'M20 12v10H4V12|M2 7h20v5H2z|M12 22V7|M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z|M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z',
  smile:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z|M8 14s1.5 2 4 2 4-2 4-2|M9 9h.01|M15 9h.01',
};

export const Logo = () => (
  <div className="flex items-center gap-2.5 select-none">
    <div className="size-9 rounded-full grid place-items-center logo-mark">
      <Icon d={I.chat} className="size-5" />
    </div>
    <span className="text-xl font-bold tracking-tight text-on-bg">
      {import.meta.env.VITE_SITE_NAME || 'ChatNow'}
    </span>
  </div>
);

/** Light/dark switch. Dark is the default (set in index.html); the choice made here is saved. */
export function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const toggle = () => {
    const on = !dark;
    document.documentElement.classList.toggle('dark', on);
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', on ? '#100B09' : '#EEF1F6');
    localStorage.setItem('theme', on ? 'dark' : 'light');
    setDark(on);
  };
  return (
    <button onClick={toggle} title={dark ? 'Light mode' : 'Dark mode'} className="icon-btn-bg">
      <Icon d={dark ? I.sun : I.moon} className="size-4" />
    </button>
  );
}

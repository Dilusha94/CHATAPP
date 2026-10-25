import { useEffect, useRef } from 'react';
import { useStore } from '../lib/store.js';
import { Icon, I } from './ui.jsx';

/** The single in-app confirmation dialog; opened with ask() from lib/store.js */
export default function ConfirmDialog() {
  const d = useStore(s => s.dialog);
  const okRef = useRef(null);

  useEffect(() => {
    if (!d) return;
    const prev = document.activeElement;
    okRef.current?.focus();
    const onKey = e => { if (e.key === 'Escape') d.resolve(false); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [d]);

  if (!d) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center" onClick={() => d.resolve(false)}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="dlg-title" aria-describedby="dlg-msg"
        className="glass dialog-in w-full max-w-sm rounded-[2rem] p-6 text-center" onClick={e => e.stopPropagation()}>
        <div className={`mx-auto mb-4 grid size-14 place-items-center rounded-full ${d.danger ? 'bg-red-500/15 text-red-400 ring-1 ring-red-500/30' : 'logo-mark'}`}>
          <Icon d={d.danger ? I.alert : I.help} className="size-6" />
        </div>
        <h3 id="dlg-title" className="text-lg font-bold tracking-tight text-fg">{d.title}</h3>
        {d.message && <p id="dlg-msg" className="mt-1.5 text-sm leading-relaxed text-fg-muted">{d.message}</p>}
        <div className="mt-6 grid grid-cols-2 gap-2">
          <button onClick={() => d.resolve(false)} className="rounded-full border border-line bg-surface-2 py-3 text-sm font-semibold text-fg-muted transition hover:bg-hover hover:text-fg">
            {d.cancel}
          </button>
          <button ref={okRef} onClick={() => d.resolve(true)}
            className={d.danger
              ? 'rounded-full bg-red-600 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_-10px_rgb(220_38_38/0.8)] outline-none transition hover:bg-red-500 focus-visible:ring-4 focus-visible:ring-red-500/30'
              : 'btn-primary py-3 text-sm outline-none focus-visible:ring-4 focus-visible:ring-brand/30'}>
            {d.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}

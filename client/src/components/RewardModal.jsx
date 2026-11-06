import { useEffect, useRef, useState } from 'react';
import { useStore, notify } from '../lib/store.js';
import { adApi, closeRewardModal } from '../lib/chat.js';
import { Icon, I } from './ui.jsx';

const AD_ERROR = 'Ad could not be loaded at the moment. Please try again later.';

/** Loads the sponsor (Monetag) script. Rejects when it is blocked (ad blocker) or too slow. */
function loadAdScript(src) {
  return new Promise((resolve, reject) => {
    document.querySelector('script[data-ad="rewarded"]')?.remove(); // a fresh one per view = a fresh impression
    const s = Object.assign(document.createElement('script'), { src, async: true });
    s.dataset.ad = 'rewarded';
    const timer = setTimeout(() => reject(new Error('timeout')), 10000);
    s.onload = () => { clearTimeout(timer); resolve(); };
    s.onerror = () => { clearTimeout(timer); reject(new Error('blocked')); };
    document.body.appendChild(s);
  });
}

export default function RewardModal() {
  const open = useStore(s => s.rewardModal);
  return open ? <Modal /> : null;
}

function Modal() {
  const src = useStore(s => s.ads?.rewarded?.src);
  // intro -> loading -> playing (countdown) ; failed = the ad could not be shown
  const [phase, setPhase] = useState('intro');
  const [error, setError] = useState('');
  const [left, setLeft] = useState(0);
  const [claiming, setClaiming] = useState(false);
  const nonce = useRef('');
  const seconds = useRef(12);

  useEffect(() => () => document.querySelector('script[data-ad="rewarded"]')?.remove(), []);

  // The countdown only runs while the ad is on screen
  useEffect(() => {
    if (phase !== 'playing' || left <= 0) return;
    const t = setTimeout(() => setLeft(n => n - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, left]);

  const start = async () => {
    setError('');
    setPhase('loading');
    const res = await adApi('start');
    if (!res.ok) { setError(res.error || AD_ERROR); return setPhase('intro'); }
    try {
      if (src) await loadAdScript(src); // no script configured yet: the placeholder below stands in for the ad
    } catch {
      setPhase('failed'); // blocked by an ad blocker, or the network is too slow
      return;
    }
    nonce.current = res.nonce;
    seconds.current = res.seconds;
    setLeft(res.seconds);
    setPhase('playing');
  };

  const claim = async () => {
    setClaiming(true);
    const res = await adApi('verify-reward', { nonce: nonce.current });
    setClaiming(false);
    if (res.ok) {
      notify(`+${res.added} image credits! Tap the picture button to send an image.`);
      return closeRewardModal();
    }
    if (res.wait) { setLeft(res.wait); return setError(res.error); } // the server wants a little more time
    setError(res.error || AD_ERROR);
    setPhase('intro');
  };

  const pct = phase === 'playing' ? Math.round(((seconds.current - left) / seconds.current) * 100) : 0;
  // While the ad is playing the popup cannot be dismissed by clicking outside
  const dismiss = phase === 'playing' || phase === 'loading' ? undefined : closeRewardModal;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onClick={dismiss}>
      <div className="glass w-full max-w-sm rounded-[2rem] bg-surface p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-3">
          <span className="logo-mark grid size-10 place-items-center rounded-full"><Icon d={I.image} className="size-5" /></span>
          <h3 className="text-lg font-bold text-fg">{phase === 'playing' ? 'Sponsor offer' : 'Image credits'}</h3>
        </div>

        {(phase === 'intro' || phase === 'loading') && (
          <>
            <p className="text-fg">You have no image credits remaining. Watch a sponsor offer video to earn <b>2 credits</b>! <span className="text-fg-muted">(1 Credit = 1 Image Share)</span></p>
            <ul className="mt-3 space-y-1.5 text-sm text-fg-muted">
              <li className="flex gap-2"><span className="text-accent">•</span>Keep this window open until the timer reaches 0.</li>
              <li className="flex gap-2"><span className="text-accent">•</span>The “Claim Reward” button unlocks when the timer ends.</li>
              <li className="flex gap-2"><span className="text-accent">•</span>Up to 5 rewards per day.</li>
            </ul>
            {error && <p className="mt-3 rounded-2xl bg-red-500/10 px-3 py-2 text-sm text-red-400 ring-1 ring-red-500/30">{error}</p>}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button onClick={closeRewardModal} disabled={phase === 'loading'} className="rounded-full border border-line bg-surface-2 py-3 font-semibold text-fg transition hover:bg-hover disabled:opacity-50">Cancel</button>
              <button onClick={start} disabled={phase === 'loading'} className="btn-primary py-3 font-semibold disabled:opacity-60">{phase === 'loading' ? 'Loading…' : 'View Ad'}</button>
            </div>
          </>
        )}

        {phase === 'failed' && (
          <>
            <p className="rounded-2xl bg-red-500/10 px-3 py-3 text-sm text-red-400 ring-1 ring-red-500/30">{AD_ERROR}</p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button onClick={closeRewardModal} className="rounded-full border border-line bg-surface-2 py-3 font-semibold text-fg transition hover:bg-hover">Close</button>
              <button onClick={start} className="btn-primary py-3 font-semibold">Try again</button>
            </div>
          </>
        )}

        {phase === 'playing' && (
          <>
            {/* The sponsor script (Monetag) shows its own ad. Without a script configured this box is the placeholder. */}
            <div className="grid min-h-40 place-items-center rounded-2xl border border-dashed border-line bg-surface-2 p-4 text-center text-sm text-fg-muted">
              {src ? 'Your sponsor offer is showing…' : 'Ad placeholder: no ad network is connected yet.'}
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-brand transition-all duration-1000" style={{ width: `${pct}%` }} /></div>
            <p className="mt-2 text-center text-sm text-fg-muted" aria-live="polite">
              {left > 0 ? <>Reward unlocks in <b className="text-fg">{left}s</b></> : 'Done! You can claim your reward now.'}
            </p>
            {error && <p className="mt-2 text-center text-xs text-red-400">{error}</p>}
            <button onClick={claim} disabled={left > 0 || claiming} className="btn-primary mt-4 w-full py-3 font-semibold disabled:cursor-not-allowed disabled:opacity-50">
              {claiming ? 'Claiming…' : left > 0 ? `Claim Reward (${left})` : 'Close / Claim Reward'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

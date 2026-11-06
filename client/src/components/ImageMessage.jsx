import { useRef, useState } from 'react';
import { imageUrl, openRewardModal } from '../lib/chat.js';
import { useStore } from '../lib/store.js';
import { Icon, I } from './ui.jsx';

/** A shared picture inside a chat bubble. Tap to view it full screen. */
export default function ImageMessage({ m, onLoad }) {
  const [open, setOpen] = useState(false);
  const [broken, setBroken] = useState(false);
  const src = imageUrl(m);

  if (broken) return <p className="py-1 text-sm italic opacity-70">Image no longer available</p>;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="block overflow-hidden rounded-2xl">
        <img src={src} alt="Shared image" loading="lazy" onLoad={onLoad} onError={() => setBroken(true)}
          className="max-h-72 w-auto max-w-full min-w-24 rounded-2xl object-cover" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/90 p-4" onClick={() => setOpen(false)}>
          <button type="button" onClick={() => setOpen(false)} title="Close" className="icon-btn absolute right-4 top-4 size-10 bg-black/40 text-white"><Icon d={I.x} /></button>
          <img src={src} alt="Shared image" className="max-h-full max-w-full rounded-xl object-contain" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </>
  );
}

/** Picture button inside the message box. With the credit gate on, it shows the credits left and opens
 *  the "watch an ad" popup when there are none. `onPick(file)` gets the chosen photo. */
export function AttachButton({ onPick, disabled }) {
  const ref = useRef(null);
  const gate = useStore(s => !!s.ads?.rewarded?.enabled);
  const credits = useStore(s => s.credits);
  return (
    <>
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden
        onChange={e => { const f = e.target.files[0]; e.target.value = ''; if (f) onPick(f); }} />
      <button type="button" disabled={disabled} onClick={() => (gate && credits < 1 ? openRewardModal() : ref.current.click())}
        title={gate ? `Send image (${credits} credit${credits === 1 ? '' : 's'} left)` : 'Send image'}
        className="relative grid size-9 place-items-center rounded-full text-fg-muted transition hover:bg-hover disabled:cursor-not-allowed disabled:opacity-50">
        <Icon d={I.image} />
        {gate && <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold leading-none text-white">{credits}</span>}
      </button>
    </>
  );
}

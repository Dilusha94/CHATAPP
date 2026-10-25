// Adsterra Direct Link: every Nth message a person sends (private or group) also opens the
// direct link in a new tab; the message itself is sent normally.
// Switched on/off, with the link and N, from the admin panel (Ads tab).
import { get } from './store.js';

const KEY = 'sentCount'; // per device; survives refresh and new sessions

export function sentCount() {
  return Number(localStorage.getItem(KEY)) || 0;
}

/**
 * Call this directly inside the Send click / Enter handler (not after an await):
 * browsers only allow opening a new tab during the user's own click or key press.
 */
export function countSentMessage() {
  const n = sentCount() + 1;
  localStorage.setItem(KEY, String(n));
  const dl = get().ads?.directLink;
  if (dl?.enabled && dl.url && n % (dl.every || 20) === 0) {
    window.open(dl.url, '_blank', 'noopener,noreferrer');
  }
}

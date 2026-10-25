// Adsterra Social Bar and Popunder, switched on/off from the admin panel (Ads tab).
//   Social bar: loaded as soon as the user is signed in.
//   Popunder:   loaded `delayMinutes` after sign-in (default 3); Adsterra then opens it on the user's next click.
// Settings arrive live from the server, so the admin can enable them while people are online.
import { useStore, get } from './store.js';

const LOGIN_KEY = 'loginAt';
let popTimer = null;
const loaded = {}; // kind -> src already on the page

/** Remember when this sign-in started (kept across page refreshes, cleared on logout) */
export function markLogin(fresh) {
  if (fresh || !sessionStorage.getItem(LOGIN_KEY)) sessionStorage.setItem(LOGIN_KEY, String(Date.now()));
}
export function clearLogin() { sessionStorage.removeItem(LOGIN_KEY); }

function inject(kind, src) {
  if (!src || loaded[kind] === src) return;
  document.querySelector(`script[data-ad="${kind}"]`)?.remove();
  const s = Object.assign(document.createElement('script'), { src, async: true });
  s.dataset.ad = kind;
  document.body.appendChild(s);
  loaded[kind] = src;
}

function remove(kind) {
  if (!loaded[kind]) return;
  document.querySelector(`script[data-ad="${kind}"]`)?.remove();
  delete loaded[kind];
  // A script that already ran may have added its own elements; they disappear on the next page load.
}

function apply() {
  const { status, ads } = get();
  clearTimeout(popTimer);
  const signedIn = status === 'ready';

  const sb = ads?.socialBar;
  if (signedIn && sb?.enabled && sb.src) inject('socialBar', sb.src); else remove('socialBar');

  const pu = ads?.popunder;
  if (signedIn && pu?.enabled && pu.src) {
    const at = Number(sessionStorage.getItem(LOGIN_KEY)) || Date.now();
    const wait = at + (pu.delayMinutes ?? 3) * 60000 - Date.now();
    if (wait <= 0) inject('popunder', pu.src);
    else popTimer = setTimeout(apply, wait);
  } else remove('popunder');
}

/** Call once at start-up: re-checks whenever the user signs in/out or the admin changes a switch */
export function watchAdScripts() {
  useStore.subscribe((s, prev) => { if (s.status !== prev.status || s.ads !== prev.ads) apply(); });
  apply();
}

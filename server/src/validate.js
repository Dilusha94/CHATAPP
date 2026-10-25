import { config } from './config.js';
import { isBadName } from './badwords.js';

const NICK_RE = /^[A-Za-z0-9_ ]{3,20}$/;
const URL_RE = /(https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(com|net|org|xyz|lk|io|me|site|link|ly|co)\b\S*/gi;
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function validateJoin(input = {}) {
  const nick = String(input.nick || '').trim().replace(/\s+/g, ' ');
  if (!NICK_RE.test(nick)) return { error: 'Nickname must be 3–20 letters, numbers, spaces or _' };
  if (isBadName(nick)) return { error: 'That nickname isn’t allowed. Please choose a different one.' };

  const gender = input.gender === 'f' ? 'f' : input.gender === 'm' ? 'm' : null;
  if (!gender) return { error: 'Select a gender' };

  const age = Number(input.age);
  if (!Number.isInteger(age) || age < 18 || age > 99) return { error: 'You must be 18 or older to use this site' };
  if (input.ageConfirmed !== true) return { error: 'Please confirm you are 18 or older' };
  if (input.privacyAccepted !== true) return { error: 'Please read and agree to the privacy policy' };

  const country = String(input.country || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) return { error: 'Select a country' };

  const state = String(input.state || '').slice(0, 40);
  const deviceId = String(input.deviceId || '').slice(0, 64);
  if (!/^[a-zA-Z0-9-]{8,64}$/.test(deviceId)) return { error: 'Invalid device' };

  return { value: { nick, gender, age, country, state, deviceId, visible: true } };
}

export const GROUP_ID_RE = /^[A-Za-z0-9]{10}$/;

/** Our own group invite links (https://yoursite.lk/?g=XXXXXXXXXX) are the only links allowed in chat. */
export function isInviteLink(s) {
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return config.clientOrigin.includes(u.origin) && u.pathname === '/' && !u.hash
      && [...u.searchParams.keys()].join() === 'g' && GROUP_ID_RE.test(u.searchParams.get('g'));
  } catch { return false; }
}

export function cleanText(raw) {
  let text = String(raw || '').replace(CONTROL_RE, '').trim().slice(0, config.maxMessageLength);
  if (config.blockLinks) text = text.replace(URL_RE, m => (isInviteLink(m) ? m : '[link removed]'));
  return text;
}

/** { name } or { error } */
export function cleanGroupName(raw) {
  const name = String(raw || '').replace(CONTROL_RE, '').replace(/\s+/g, ' ').trim().replace(URL_RE, '').trim().slice(0, 30);
  if (name.length < 3) return { error: 'Group name must be 3–30 characters' };
  if (isBadName(name)) return { error: 'That group name isn’t allowed. Please choose a different one.' };
  return { name };
}

/** Sliding-window limiter: returns true if allowed */
export function allow(bucket, limit) {
  const now = Date.now();
  while (bucket.length && now - bucket[0] > limit.windowMs) bucket.shift();
  if (bucket.length >= limit.count) return false;
  bucket.push(now);
  return true;
}

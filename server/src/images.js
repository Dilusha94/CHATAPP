// Image sharing. Three storage rules:
//
//  1. Every upload is re-encoded on the server to WebP (max 1280 px, quality 82: visually the same
//     picture at a fraction of the size) and stripped of all metadata. The original bytes are never kept.
//  2. Chat images live in data/uploads/<userId>/<random>.webp. They are deleted when the user's session
//     ends (logout, idle, ban…) and in any case 24 hours after upload (hourly cleanup job).
//  3. When a chat is reported, its images are COPIED to data/reported/<reportId>/ for the moderators
//     (Admin → Reports) and purged after 7 days, or as soon as the report is dismissed.
//
//   POST /upload            raw image bytes, headers x-user-id + x-token  -> { ok, file }
//   GET  /uploads/:uid/:f   the image (random names: only people in the chat know the URL)
import express from 'express';
import sharp from 'sharp';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { users, touch } from './store.js';
import { allow } from './validate.js';
import { creditGateOn } from './ads.js';

const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
export const uploadDir = path.resolve(config.uploadDir || path.join(dataDir, 'uploads'));
export const reportedDir = path.resolve(config.reportedDir || path.join(dataDir, 'reported'));

const UID_RE = /^[a-f0-9]{16}$/;
export const FILE_RE = /^[a-f0-9]{24}\.webp$/;
const REPORT_ID_RE = /^[a-f0-9]{16}$/;
const REPORT_FILE_RE = /^[a-f0-9]{16}_[a-f0-9]{24}\.webp$/;

/** Cheap pre-check on the first bytes (JPEG / PNG / WebP). The real decoding happens in sharp. */
export function sniff(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}

/** Decode, auto-rotate, shrink to 1280 px, re-encode as WebP, drop EXIF/GPS. Throws if it is not a real image. */
export const compress = buf => sharp(buf, { limitInputPixels: 50e6, failOn: 'error' })
  .rotate()
  .resize({ width: config.imageMaxSide, height: config.imageMaxSide, fit: 'inside', withoutEnlargement: true })
  .webp({ quality: config.imageQuality, effort: 4 })
  .toBuffer();

const userDir = uid => path.join(uploadDir, uid);

/** Does this user own this file? (used before a message may reference it) */
export async function imageExists(uid, file) {
  if (!UID_RE.test(uid) || !FILE_RE.test(file)) return false;
  try { await fs.access(path.join(userDir(uid), file)); return true; } catch { return false; }
}

export async function deleteUserImages(uid) {
  if (!UID_RE.test(uid)) return;
  await fs.rm(userDir(uid), { recursive: true, force: true }).catch(() => {});
}

// ---------- reported images (kept 7 days for moderators) ----------

/** Copies the images of a reported conversation next to the report. Returns how many were saved. */
export async function preserveForReport(reportId, messages = []) {
  if (!REPORT_ID_RE.test(String(reportId))) return 0;
  const dir = path.join(reportedDir, reportId);
  let saved = 0;
  for (const m of messages) {
    if (!m?.image || !FILE_RE.test(m.image) || !UID_RE.test(String(m.from))) continue;
    try {
      await fs.mkdir(dir, { recursive: true });
      await fs.copyFile(path.join(userDir(m.from), m.image), path.join(dir, `${m.from}_${m.image}`));
      saved++;
    } catch { /* already expired or deleted: nothing to keep */ }
  }
  return saved;
}

export async function deleteReportImages(reportId) {
  if (!REPORT_ID_RE.test(String(reportId))) return;
  await fs.rm(path.join(reportedDir, reportId), { recursive: true, force: true }).catch(() => {});
}

/** Admin only (the caller checks the admin token). */
export function sendReportImage(res, reportId, name) {
  if (!REPORT_ID_RE.test(reportId) || !REPORT_FILE_RE.test(name)) return res.sendStatus(404);
  res.set({ 'Content-Type': 'image/webp', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Cache-Control': 'private, no-store' });
  res.sendFile(name, { root: path.join(reportedDir, reportId), dotfiles: 'deny', headers: {} }, err => { if (err && !res.headersSent) res.sendStatus(404); });
}

// ---------- hourly cleanup ----------

const rmOld = async (dir, cutoff) => {
  let names;
  try { names = await fs.readdir(dir); } catch { return { left: 0, removed: 0 }; }
  let left = names.length, removed = 0;
  for (const n of names) {
    try {
      if ((await fs.stat(path.join(dir, n))).mtimeMs < cutoff) { await fs.rm(path.join(dir, n), { recursive: true, force: true }); left--; removed++; }
    } catch { left--; }
  }
  return { left, removed };
};

/**
 *  - chat images older than imageTtlHours (24 h) are deleted
 *  - folders of users who no longer exist are deleted (crash / restart safety net)
 *  - reported images older than reportTtlSeconds (7 days) are purged
 */
export async function cleanup() {
  const now = Date.now();
  let removed = 0;
  let dirs = [];
  try { dirs = await fs.readdir(uploadDir); } catch { /* nothing uploaded yet */ }
  for (const d of dirs) {
    const dir = path.join(uploadDir, d);
    if (!users.has(d)) { await fs.rm(dir, { recursive: true, force: true }).catch(() => {}); removed++; continue; }
    const r = await rmOld(dir, now - config.imageTtlHours * 3600 * 1000);
    removed += r.removed;
    if (!r.left) await fs.rmdir(dir).catch(() => {});
  }
  removed += (await rmOld(reportedDir, now - config.reportTtlSeconds * 1000)).removed;
  return removed;
}

// ---------- upload / serve ----------

const limiters = new Map(); // uid -> sliding window
const countFiles = async uid => { try { return (await fs.readdir(userDir(uid))).length; } catch { return 0; } };

export const cors = (req, res, next) => {
  const origin = req.headers.origin;
  if (origin && config.clientOrigin.includes(origin)) {
    res.set({
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'content-type, x-user-id, x-token',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Max-Age': '600',
      Vary: 'Origin',
    });
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
};

/** The signed-in user behind a request (headers x-user-id + x-token), or null */
export function authUser(req) {
  const u = users.get(String(req.get('x-user-id') || ''));
  const token = String(req.get('x-token') || '');
  if (!u || token.length !== u.token.length || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(u.token))) return null;
  return u;
}

export const images = express.Router();

images.options('/upload', cors); // browser preflight (custom headers)
images.post('/upload', cors, express.raw({ type: () => true, limit: config.maxImageBytes }), async (req, res) => {
  try {
    const u = authUser(req);
    if (!u) return res.status(401).json({ ok: false, error: 'not_joined' });
    // Gate: no credits, no upload (the credit itself is spent when the message is sent)
    if (creditGateOn() && u.credits < 1) return res.status(402).json({ ok: false, error: 'no_credits' });
    if (!limiters.has(u.id)) limiters.set(u.id, []);
    if (!allow(limiters.get(u.id), config.imageLimit)) return res.status(429).json({ ok: false, error: 'You are sending images too fast. Wait a minute.' });
    const body = req.body;
    if (!Buffer.isBuffer(body) || !body.length) return res.status(400).json({ ok: false, error: 'No image received' });
    if (!sniff(body)) return res.status(415).json({ ok: false, error: 'Only JPG, PNG or WebP images are allowed' });
    if ((await countFiles(u.id)) >= config.maxImagesPerUser) return res.status(429).json({ ok: false, error: `You can share up to ${config.maxImagesPerUser} images per session` });

    let out;
    try { out = await compress(body); } catch { return res.status(415).json({ ok: false, error: 'That file is not a valid image' }); }

    const file = `${crypto.randomBytes(12).toString('hex')}.webp`;
    await fs.mkdir(userDir(u.id), { recursive: true });
    await fs.writeFile(path.join(userDir(u.id), file), out, { flag: 'wx' });
    // The user may have logged out while the file was being written: do not leave it behind
    if (!users.has(u.id)) { await deleteUserImages(u.id); return res.status(401).json({ ok: false, error: 'not_joined' }); }
    touch(u.id);
    res.json({ ok: true, file });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

images.get('/uploads/:uid/:file', async (req, res) => {
  const { uid, file } = req.params;
  if (!UID_RE.test(uid) || !FILE_RE.test(file)) return res.sendStatus(404);
  res.set({
    'Content-Type': 'image/webp',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Cache-Control': 'private, max-age=3600',
    'Content-Disposition': 'inline',
  });
  res.sendFile(file, { root: userDir(uid), dotfiles: 'deny', headers: {} }, err => { if (err && !res.headersSent) res.sendStatus(404); });
});

// Upload errors (too large…) as JSON, not an HTML page
// eslint-disable-next-line no-unused-vars
images.use((err, _req, res, _next) => {
  if (err?.type === 'entity.too.large') return res.status(413).json({ ok: false, error: `Image is too large (max ${Math.round(config.maxImageBytes / 1024 / 1024)} MB)` });
  console.error(err);
  res.status(400).json({ ok: false, error: 'Upload failed' });
});

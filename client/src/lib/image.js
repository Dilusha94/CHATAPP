// Prepares a picked photo for sending: resized to max 1280 px and re-encoded as WebP (or JPEG).
// Re-encoding also strips EXIF data (GPS location, camera, date) so nothing private is shared.
const MAX_SIDE = 1280;
const MAX_BYTES = 1.8 * 1024 * 1024; // server limit is 2 MB
const OK_TYPE = /^image\/(jpeg|png|webp|gif)$/;

const load = file => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image')); };
  img.src = url;
});

const toBlob = (canvas, type, q) => new Promise(r => canvas.toBlob(r, type, q));

export async function prepareImage(file) {
  if (!file || !OK_TYPE.test(file.type)) throw new Error('Choose a JPG, PNG, WebP or GIF image');
  const img = await load(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // transparent PNGs would turn black in JPEG
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  // WebP is ~30% smaller than JPEG at the same quality; browsers that cannot make WebP fall back to JPEG.
  // (The server re-encodes everything to WebP anyway, this only saves upload data.)
  let blob = null;
  for (const q of [0.82, 0.65, 0.5]) {
    blob = await toBlob(canvas, 'image/webp', q);
    if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', q);
    if (blob && blob.size <= MAX_BYTES) return blob;
  }
  throw new Error('That image is too large');
}

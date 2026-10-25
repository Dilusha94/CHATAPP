// Adsterra banners each run in their own iframe so several banners can live on one page.
// On/off and the banner keys come from the admin panel (Ads tab), live.
import { useStore } from '../lib/store.js';

const SIZES = { '300x250': [300, 250], '728x90': [728, 90], '320x50': [320, 50] };

export default function AdBanner({ size = '300x250', className = '' }) {
  const banners = useStore(s => s.ads?.banners);
  const [w, h] = SIZES[size];
  if (!banners?.enabled) return null;
  const key = banners.keys?.[size];
  if (!key) {
    // switched on but no key for this size yet: show where it would go (development only)
    return import.meta.env.DEV
      ? <div className={`grid place-items-center rounded-2xl border border-dashed border-on-bg/20 text-xs text-on-bg-muted ${className}`} style={{ width: w, height: h, maxWidth: '100%' }}>Ad {size}</div>
      : null;
  }
  const html = `<html><body style="margin:0"><script>atOptions={'key':'${key}','format':'iframe','height':${h},'width':${w},'params':{}};</script><script src="https://${banners.domain}/${key}/invoke.js"></script></body></html>`;
  return (
    <iframe key={key} title="ad" srcDoc={html} width={w} height={h} loading="lazy" scrolling="no"
      className={`border-0 overflow-hidden max-w-full ${className}`}
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-same-origin" />
  );
}

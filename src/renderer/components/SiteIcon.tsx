import { Search } from 'lucide-react';
import { useState } from 'react';
import { siteLetter, hostOf, isNewTabUrl } from '@shared/url';

/** A page's favicon, or a colored letter tile when there isn't one. */
export function SiteIcon({ url, favicon, title, size = 16 }: { url: string; favicon?: string; title?: string; size?: number }) {
  const [broken, setBroken] = useState<string | null>(null);
  // Kite's own new-tab page.
  if (isNewTabUrl(url)) {
    return (
      <span className="site-icon newtab" style={{ width: size, height: size }} aria-hidden="true">
        <Search size={Math.round(size * 0.66)} />
      </span>
    );
  }
  if (favicon && broken !== favicon) {
    return <img className="site-icon" src={favicon} width={size} height={size} alt="" draggable={false} onError={() => setBroken(favicon)} />;
  }
  const host = hostOf(url);
  let hue = 0;
  for (const c of host || title || '?') hue = (hue * 31 + c.charCodeAt(0)) % 360;
  return (
    <span className="site-icon letter" style={{ width: size, height: size, fontSize: size * 0.62, background: `hsl(${hue} 52% 56%)` }} aria-hidden="true">
      {siteLetter(url, title)}
    </span>
  );
}

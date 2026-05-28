import { HttpError } from '../../middleware/errors.js';

export type Platform = 'website' | 'youtube' | 'tiktok' | 'instagram';

// Tracking params stripped before routing (exact names + a utm_* prefix rule).
const TRACKING_PARAMS = new Set(['igsh', 'igshid', 'si', 'fbclid', 'gclid', 'ref', 'ref_src']);

// URL shorteners are rejected — too easy to abuse, and the real host is unknown until resolved.
const SHORTENER_HOSTS = new Set([
  'bit.ly',
  't.co',
  'goo.gl',
  'tinyurl.com',
  'ow.ly',
  'buff.ly',
  'rebrand.ly',
  'cutt.ly',
  'is.gd',
]);

function stripWww(host: string): string {
  return host.replace(/^www\./, '');
}

function classifyHost(host: string): Platform {
  const h = stripWww(host).toLowerCase();
  if (h === 'instagram.com' || h.endsWith('.instagram.com')) return 'instagram';
  if (h === 'tiktok.com' || h.endsWith('.tiktok.com')) return 'tiktok';
  if (h === 'youtube.com' || h.endsWith('.youtube.com') || h === 'youtu.be') return 'youtube';
  return 'website';
}

// Normalizes a pasted URL (strips tracking params + fragment) and classifies its source platform.
// Throws HttpError(400) for unparseable URLs, non-http(s) schemes, and known shorteners.
export function classifyUrl(raw: string): { url: string; platform: Platform } {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new HttpError(400, 'Invalid URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new HttpError(400, 'Invalid URL');
  }

  if (SHORTENER_HOSTS.has(stripWww(parsed.hostname).toLowerCase())) {
    throw new HttpError(400, 'Shortened links are not supported — paste the full URL');
  }

  for (const key of [...parsed.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key) || key.toLowerCase().startsWith('utm_')) {
      parsed.searchParams.delete(key);
    }
  }
  parsed.hash = '';

  return { url: parsed.toString(), platform: classifyHost(parsed.hostname) };
}

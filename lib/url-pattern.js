/**
 * Normalize a URL to a stable cache key pattern.
 *
 * Steps:
 *  1. Parse the URL
 *  2. Keep protocol + host + pathname only (strip query params and hash)
 *  3. Replace numeric-only path segments with '*'
 *     e.g. /form/12345/step1 → /form/*/step1
 *  4. Remove trailing slashes
 *
 * Example:
 *   "https://example.gov.in/scholarship/98765/apply?lang=hi#top"
 *   → "https://example.gov.in/scholarship/*/apply"
 */
export function normalizeUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    // If not a valid URL, return as-is
    return url;
  }

  const origin = parsed.origin; // protocol + host (includes port if present)

  // Split pathname into segments, replace pure-numeric segments with '*'
  const segments = parsed.pathname.split('/').map((seg) => {
    return /^\d+$/.test(seg) ? '*' : seg;
  });

  // Rejoin, then remove trailing slash
  let pathname = segments.join('/').replace(/\/+$/, '');

  // Ensure at least a single slash for root paths
  if (!pathname) {
    pathname = '';
  }

  return `${origin}${pathname}`;
}

export function isSamePattern(url1, url2) {
  return normalizeUrl(url1) === normalizeUrl(url2);
}

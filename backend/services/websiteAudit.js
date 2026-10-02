/**
 * Fetches a business's public website and runs a small set of automated
 * checks (HTTPS, mobile-friendliness, basic SEO, social links, payment
 * signals, response time). No external API keys required.
 *
 * The server fetches a user-supplied URL, so this is hardened against
 * SSRF: only http/https with a public, non-reserved IP is allowed, and
 * every redirect hop is re-validated before being followed.
 */
const dns = require('dns').promises;
const net = require('net');

const FETCH_TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;
const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2MB

function isPrivateIPv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

function isPrivateIPv6(ip) {
  const lower = ip.toLowerCase();
  if (lower === '::1') return true;
  if (lower.startsWith('fe80:') || lower.startsWith('fe80::')) return true; // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local fc00::/7
  if (lower.startsWith('::ffff:')) {
    const mapped = lower.split(':').pop();
    if (net.isIPv4(mapped)) return isPrivateIPv4(mapped);
  }
  return false;
}

function isPrivateIP(ip) {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  if (net.isIPv6(ip)) return isPrivateIPv6(ip);
  return true; // unknown format — reject to be safe
}

async function assertPublicHost(hostname) {
  if (!hostname || hostname === 'localhost') {
    throw new Error('That URL is not allowed.');
  }
  let records;
  try {
    records = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error('Could not resolve that website’s address.');
  }
  if (!records.length) {
    throw new Error('Could not resolve that website’s address.');
  }
  for (const rec of records) {
    if (isPrivateIP(rec.address)) {
      throw new Error('That URL points to a private or internal address and can’t be audited.');
    }
  }
}

function normalizeUrl(rawUrl) {
  let input = String(rawUrl || '').trim();
  if (!input) throw new Error('A website URL is required.');
  // Only prepend a scheme if none is present at all — otherwise a
  // non-http(s) scheme (ftp://, javascript://, file://, ...) would get
  // "https://" glued in front of it instead of being rejected below.
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) input = `https://${input}`;

  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    throw new Error('That doesn’t look like a valid URL.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http and https URLs are supported.');
  }
  return parsed;
}

async function safeFetch(url, redirectsLeft) {
  await assertPublicHost(url.hostname);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(url, {
      redirect: 'manual',
      signal: controller.signal,
      headers: { 'User-Agent': 'BizTransform-WebsiteAudit/1.0' },
    });
  } finally {
    clearTimeout(timer);
  }

  if ([301, 302, 303, 307, 308].includes(res.status)) {
    const location = res.headers.get('location');
    if (!location || redirectsLeft <= 0) {
      throw new Error('Too many redirects while fetching that site.');
    }
    const nextUrl = new URL(location, url);
    if (nextUrl.protocol !== 'http:' && nextUrl.protocol !== 'https:') {
      throw new Error('Redirected to an unsupported URL.');
    }
    return safeFetch(nextUrl, redirectsLeft - 1);
  }

  return { res, finalUrl: url };
}

async function readBodyCapped(res) {
  const reader = res.body?.getReader?.();
  if (!reader) return await res.text();

  const decoder = new TextDecoder();
  let total = 0;
  let out = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      try {
        await reader.cancel();
      } catch {
        // ignore
      }
      break;
    }
    out += decoder.decode(value, { stream: true });
  }
  return out;
}

const SOCIAL_PATTERNS = [
  ['facebook', /facebook\.com\//i],
  ['instagram', /instagram\.com\//i],
  ['tiktok', /tiktok\.com\//i],
  ['linkedin', /linkedin\.com\//i],
  ['twitter/x', /(twitter|x)\.com\//i],
];

const PAYMENT_PATTERNS = [
  /js\.stripe\.com/i,
  /paypal\.com\/sdk/i,
  /squareup\.com/i,
  /checkout\.square/i,
  /shopify/i,
  /woocommerce/i,
];

function analyzeHtml(html) {
  const hasViewport = /<meta[^>]+name=["']viewport["']/i.test(html);
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const hasTitle = Boolean(titleMatch && titleMatch[1].trim());
  const hasMetaDescription = /<meta[^>]+name=["']description["'][^>]+content=["'][^"']+["']/i.test(html);
  const socialFound = SOCIAL_PATTERNS.filter(([, re]) => re.test(html)).map(([name]) => name);
  const paymentDetected = PAYMENT_PATTERNS.some((re) => re.test(html));

  return {
    mobile_friendly: hasViewport,
    has_title: hasTitle,
    has_meta_description: hasMetaDescription,
    social_links_found: socialFound,
    payment_detected: paymentDetected,
  };
}

async function runWebsiteAudit(url) {
  const startedAt = Date.now();

  try {
    const { res, finalUrl } = await safeFetch(url, MAX_REDIRECTS);
    const responseTimeMs = Date.now() - startedAt;

    if (!res.ok) {
      return {
        status: 'unreachable',
        error_message: `Site responded with HTTP ${res.status}.`,
        url: finalUrl.toString(),
        https: finalUrl.protocol === 'https:',
        response_time_ms: responseTimeMs,
      };
    }

    const html = await readBodyCapped(res);
    const analysis = analyzeHtml(html);

    return {
      status: 'ok',
      error_message: null,
      url: finalUrl.toString(),
      https: finalUrl.protocol === 'https:',
      response_time_ms: responseTimeMs,
      ...analysis,
    };
  } catch (err) {
    return {
      status: 'unreachable',
      error_message: err.message || 'Could not reach that website.',
      url: url.toString(),
      https: null,
      response_time_ms: null,
      mobile_friendly: null,
      has_title: null,
      has_meta_description: null,
      social_links_found: [],
      payment_detected: null,
    };
  }
}

module.exports = { runWebsiteAudit, normalizeUrl };

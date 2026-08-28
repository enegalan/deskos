import dns from 'node:dns/promises';
import net from 'node:net';
import type { Connect } from 'vite';
import type { Plugin } from 'vite';

export const TITLE_PATH = '/__deskos/page-title';

const MAX_REDIRECTS = 5;

/** Extract the first document title from an HTML snippet. */
function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (!match?.[1]) return null;
  const title = match[1].trim().replace(/\s+/g, ' ');
  return title || null;
}

function normalizeIpAddress(address: string): string {
  return address.startsWith('::ffff:') ? address.slice(7) : address;
}

/** True when an IP is private, link-local, or unspecified (loopback is allowed). */
function isBlockedIp(address: string): boolean {
  const ip = normalizeIpAddress(address);

  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map((part) => Number.parseInt(part, 10));
    if (a === 127) return false;
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 0) return true;
    return false;
  }

  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    if (normalized === '::1') return false;
    if (normalized === '::') return true;
    if (normalized.startsWith('fe80:')) return true;
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
    return false;
  }

  return true;
}

function isLocalDevHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return host.endsWith('.local');
}

function isBlockedHostname(hostname: string): boolean {
  const ipVersion = net.isIP(hostname);
  return ipVersion !== 0 && isBlockedIp(hostname);
}

/** Validate that a fetch target is an allowed HTTP(S) destination. */
async function isAllowedFetchTarget(url: URL): Promise<boolean> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return false;
  }

  const hostname = url.hostname;
  if (isLocalDevHostname(hostname)) {
    return true;
  }
  if (isBlockedHostname(hostname)) {
    return false;
  }

  if (net.isIP(hostname)) {
    return !isBlockedIp(hostname);
  }

  try {
    const records = await dns.lookup(hostname, { all: true, verbatim: true });
    if (records.length === 0) return false;
    return records.every((record) => !isBlockedIp(record.address));
  } catch {
    return false;
  }
}

/** Fetch HTML while validating every redirect hop against the destination policy. */
async function fetchHtmlWithPolicy(url: URL, signal: AbortSignal): Promise<string | null> {
  let current = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (!(await isAllowedFetchTarget(current))) {
      return null;
    }

    const response = await fetch(current.href, {
      signal,
      redirect: 'manual',
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'DeskOS-Browser/1.0',
      },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) return null;
      current = new URL(location, current);
      continue;
    }

    if (!response.ok) {
      return null;
    }

    return (await response.text()).slice(0, 65536);
  }

  return null;
}

/** Register the page-title lookup middleware on a Vite connect server. */
function attachPageTitleMiddleware(server: Connect.Server): void {
  server.use(async (req, res, next) => {
    if (!req.url?.startsWith(TITLE_PATH)) {
      next();
      return;
    }

    const requestUrl = new URL(req.url, 'http://localhost');
    const target = requestUrl.searchParams.get('url');
    if (!target) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ title: null }));
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(target);
    } catch {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ title: null }));
      return;
    }

    if (!(await isAllowedFetchTarget(parsed))) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ title: null }));
      return;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const html = await fetchHtmlWithPolicy(parsed, controller.signal);
      clearTimeout(timeout);

      if (html === null) {
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ title: null }));
        return;
      }

      const title = extractTitle(html);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ title }));
    } catch {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ title: null }));
    }
  });
}

/** Vite plugin: server-side HTML title lookup for the browser program. */
export function pageTitlePlugin(): Plugin {
  return {
    name: 'deskos-page-title',
    configureServer(server) {
      attachPageTitleMiddleware(server.middlewares);
    },
    configurePreviewServer(server) {
      attachPageTitleMiddleware(server.middlewares);
    },
  };
}

import type { Connect } from 'vite';
import type { Plugin } from 'vite';

export const TITLE_PATH = '/__deskos/page-title';

/** Extract the first document title from an HTML snippet. */
function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (!match?.[1]) return null;
  const title = match[1].trim().replace(/\s+/g, ' ');
  return title || null;
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
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Invalid protocol');
      }
    } catch {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ title: null }));
      return;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(parsed.href, {
        signal: controller.signal,
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'User-Agent': 'DeskOS-Browser/1.0',
        },
        redirect: 'follow',
      });
      clearTimeout(timeout);

      if (!response.ok) {
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ title: null }));
        return;
      }

      const html = (await response.text()).slice(0, 65536);
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

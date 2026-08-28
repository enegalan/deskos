/**
 * Vite plugin: scans `public/img/` and exposes its contents as `virtual:images`.
 *
 * The list is rebuilt on every load of the virtual module, and in dev the page
 * is reloaded when a file is added to or removed from `public/img/`.
 */

import type { Plugin, ViteDevServer } from 'vite';
import { readdirSync, existsSync } from 'fs';
import { resolve } from 'path';

/** Virtual module id imported as `virtual:images`. */
const VIRTUAL_MODULE_ID = 'virtual:images';
/** Vite-resolved id for the virtual images module. */
const RESOLVED_VIRTUAL_MODULE_ID = '\0' + VIRTUAL_MODULE_ID;

/** Extensions treated as previewable images. */
const IMAGE_EXTENSION = /\.(png|jpe?g|gif|webp|avif|svg|bmp|ico)$/i;

/** One image discovered under `public/img/`. */
interface ImageEntry {
  /** Original file name, shown as the item label. */
  name: string;
  /** URL-encoded path served by Vite from `public/`. */
  url: string;
}

/** List every image file directly under `public/img/` (name-sorted). */
function scanImages(rootDir: string): ImageEntry[] {
  const dir = resolve(rootDir, 'public/img');
  if (!existsSync(dir)) return [];

  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && IMAGE_EXTENSION.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .map((name) => ({ name, url: `/img/${encodeURIComponent(name)}` }));
}

/** Vite plugin that builds and hot-reloads the `virtual:images` module. */
export function imagesPlugin(): Plugin {
  let rootDir = process.cwd();

  return {
    name: 'deskos-images',

    configResolved(config) {
      rootDir = config.root;
    },

    resolveId(id) {
      if (id === VIRTUAL_MODULE_ID) {
        return RESOLVED_VIRTUAL_MODULE_ID;
      }
    },

    load(id) {
      if (id === RESOLVED_VIRTUAL_MODULE_ID) {
        return `export const images = ${JSON.stringify(scanImages(rootDir))};\n`;
      }
    },

    configureServer(server: ViteDevServer) {
      const imgDir = resolve(rootDir, 'public/img').replace(/\\/g, '/');

      const refresh = (file: string) => {
        if (!file.replace(/\\/g, '/').startsWith(imgDir)) return;
        const module = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_MODULE_ID);
        if (module) {
          server.moduleGraph.invalidateModule(module);
        }
        server.ws.send({ type: 'full-reload' });
      };

      server.watcher.add(imgDir);
      server.watcher.on('add', refresh);
      server.watcher.on('unlink', refresh);
    },
  };
}

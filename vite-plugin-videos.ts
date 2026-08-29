/**
 * Vite plugin: scans `public/video/` and exposes its contents as `virtual:videos`.
 *
 * The list is rebuilt on every load of the virtual module, and in dev the page
 * is reloaded when a file is added to or removed from `public/video/`.
 */

import type { Plugin, ViteDevServer } from 'vite';
import { readdirSync, existsSync } from 'fs';
import { resolve } from 'path';

/** Virtual module id imported as `virtual:videos`. */
const VIRTUAL_MODULE_ID = 'virtual:videos';
/** Vite-resolved id for the virtual videos module. */
const RESOLVED_VIRTUAL_MODULE_ID = '\0' + VIRTUAL_MODULE_ID;

/** Extensions treated as playable videos. */
const VIDEO_EXTENSION = /\.(mp4|webm|ogg|ogv|mov|m4v)$/i;

/** One video discovered under `public/video/`. */
interface VideoEntry {
  /** Original file name, shown as the item label. */
  name: string;
  /** URL-encoded path served by Vite from `public/`. */
  url: string;
}

/** List every video file directly under `public/video/` (name-sorted). */
function scanVideos(rootDir: string): VideoEntry[] {
  const dir = resolve(rootDir, 'public/video');
  if (!existsSync(dir)) return [];

  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && VIDEO_EXTENSION.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .map((name) => ({ name, url: `/video/${encodeURIComponent(name)}` }));
}

/** Vite plugin that builds and hot-reloads the `virtual:videos` module. */
export function videosPlugin(): Plugin {
  let rootDir = process.cwd();

  return {
    name: 'deskos-videos',

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
        return `export const videos = ${JSON.stringify(scanVideos(rootDir))};\n`;
      }
    },

    configureServer(server: ViteDevServer) {
      const videoDir = resolve(rootDir, 'public/video').replace(/\\/g, '/');

      const refresh = (file: string) => {
        if (!file.replace(/\\/g, '/').startsWith(videoDir)) return;
        const module = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_MODULE_ID);
        if (module) {
          server.moduleGraph.invalidateModule(module);
        }
        server.ws.send({ type: 'full-reload' });
      };

      server.watcher.add(videoDir);
      server.watcher.on('add', refresh);
      server.watcher.on('unlink', refresh);
    },
  };
}

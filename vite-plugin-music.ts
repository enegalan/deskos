/**
 * Vite plugin: scans `public/music/` and exposes its contents as `virtual:music`.
 *
 * The list is rebuilt on every load of the virtual module, and in dev the page
 * is reloaded when a file is added to or removed from `public/music/`.
 */

import type { Plugin, ViteDevServer } from 'vite';
import { readdirSync, existsSync } from 'fs';
import { resolve } from 'path';

/** Virtual module id imported as `virtual:music`. */
const VIRTUAL_MODULE_ID = 'virtual:music';
/** Vite-resolved id for the virtual music module. */
const RESOLVED_VIRTUAL_MODULE_ID = '\0' + VIRTUAL_MODULE_ID;

/** Extensions treated as playable audio. */
const AUDIO_EXTENSION = /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|weba|webm)$/i;

/** One track discovered under `public/music/`. */
interface MusicEntry {
  /** Original file name, shown as the item label. */
  name: string;
  /** URL-encoded path served by Vite from `public/`. */
  url: string;
}

/** List every audio file directly under `public/music/` (name-sorted). */
function scanMusic(rootDir: string): MusicEntry[] {
  const dir = resolve(rootDir, 'public/music');
  if (!existsSync(dir)) return [];

  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && AUDIO_EXTENSION.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .map((name) => ({ name, url: `/music/${encodeURIComponent(name)}` }));
}

/** Vite plugin that builds and hot-reloads the `virtual:music` module. */
export function musicPlugin(): Plugin {
  let rootDir = process.cwd();

  return {
    name: 'deskos-music',

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
        return `export const music = ${JSON.stringify(scanMusic(rootDir))};\n`;
      }
    },

    configureServer(server: ViteDevServer) {
      const musicDir = resolve(rootDir, 'public/music').replace(/\\/g, '/');

      const refresh = (file: string) => {
        const normalized = file.replace(/\\/g, '/');
        // Require a directory boundary so siblings like `music-old` do not match.
        if (normalized !== musicDir && !normalized.startsWith(`${musicDir}/`)) return;
        const module = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_MODULE_ID);
        if (module) {
          server.moduleGraph.invalidateModule(module);
        }
        server.ws.send({ type: 'full-reload' });
      };

      server.watcher.add(musicDir);
      server.watcher.on('add', refresh);
      server.watcher.on('unlink', refresh);
    },
  };
}

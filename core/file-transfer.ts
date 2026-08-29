/**
 * Import / export helpers: OS files ↔ VFS, URLs from Browser → desktop items.
 */

import {
  createDesktopFile,
  getFileById,
  getMediaById,
  getMediaUrl,
  isFileItem,
  isMediaItem,
  updateFileContent,
  getDesktopMedia,
  getDesktopSurfaceMedia,
  getDesktopSurfaceFiles,
  getDesktopShortcuts,
  getDesktopFolders,
  findNextAvailablePosition,
  clampGridPosition,
  getIdsInsideFolders,
  notifyDesktopUpdated,
  getFolderByPath,
  addItemToFolder,
  isWritableSpecialPath,
  moveItemToSpecialLocation,
  type DesktopItem,
  type DesktopMediaItem,
  type DesktopImageItem,
  type DesktopVideoItem,
  type DesktopAudioItem,
} from './desktop-shortcuts';
import { createScopedStorage } from './storage';
import { getFileExtension, getMimeTypeForName } from './file-associations';

/** MIME for dragging a URL out of the Browser onto the desktop. */
export const DESKOS_URL_DRAG_TYPE = 'application/x-deskos-browser-bookmark-url';

/** Max bytes to store as a data URL in system storage (keep localStorage healthy). */
const MAX_INLINE_BYTES = 1.5 * 1024 * 1024;

/** Bound remote fetches so stalled requests fall through to existing catch paths. */
const FETCH_TIMEOUT_MS = 30_000;

const MEDIA_STORAGE_KEY = 'desktop-media';
const systemStorage = createScopedStorage('system');

/** Whether a File / name looks like an image. */
function isImageFileName(name: string): boolean {
  return /^(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i.test(getFileExtension(name));
}

/** Whether a File / name looks like a video. */
function isVideoFileName(name: string): boolean {
  return /^(mp4|webm|ogv|mov|m4v)$/i.test(getFileExtension(name));
}

/** Whether a File / name looks like audio. */
function isAudioFileName(name: string): boolean {
  return /^(mp3|wav|ogg|oga|m4a|aac|flac|opus|weba)$/i.test(getFileExtension(name));
}

/** Whether a URL path looks like an image. */
function isImageUrl(url: string): boolean {
  try {
    const path = new URL(url, window.location.origin).pathname;
    return isImageFileName(path);
  } catch {
    return isImageFileName(url);
  }
}

/** Basename from a URL or path. */
function nameFromUrl(url: string, fallback = 'Link'): string {
  try {
    const parsed = new URL(url, window.location.origin);
    const base = parsed.pathname.split('/').filter(Boolean).pop();
    if (base) return decodeURIComponent(base);
    return parsed.hostname || fallback;
  } catch {
    return fallback;
  }
}

/** Read a File as UTF-8 text. */
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

/** Read a Blob / File as a data URL. */
function readFileAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsDataURL(blob);
  });
}

/** AbortSignal that fires after `FETCH_TIMEOUT_MS`. */
function fetchTimeoutSignal(): AbortSignal {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(FETCH_TIMEOUT_MS);
  }
  const controller = new AbortController();
  window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return controller.signal;
}

/** Next free desktop cell, optionally preferring a point. */
function nextDesktopPosition(preferred?: { x: number; y: number }): { x: number; y: number } {
  const inFolders = getIdsInsideFolders();
  const occupied = [
    ...getDesktopShortcuts()
      .filter((s) => !inFolders.has(s.id))
      .map((s) => ({ x: s.x, y: s.y })),
    ...getDesktopFolders()
      .filter((f) => !f.parentPath || f.parentPath === '/Desktop')
      .map((f) => ({ x: f.x, y: f.y })),
    ...getDesktopSurfaceMedia().map((m) => ({ x: m.x, y: m.y })),
    ...getDesktopSurfaceFiles().map((f) => ({ x: f.x, y: f.y })),
  ];
  if (preferred) {
    const clamped = clampGridPosition(preferred.x, preferred.y);
    const free = !occupied.some(
      (pos) => Math.abs(pos.x - clamped.x) < 1 && Math.abs(pos.y - clamped.y) < 1
    );
    if (free) return clamped;
  }
  return findNextAvailablePosition(occupied);
}

function saveMedia(media: DesktopMediaItem[]): void {
  systemStorage.setItem(MEDIA_STORAGE_KEY, media);
}

/** Create a user media item from a data/blob URL. */
function createUserMediaItem(
  kind: 'image' | 'video' | 'audio',
  name: string,
  url: string,
  x: number,
  y: number
): DesktopMediaItem {
  const id = `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  if (kind === 'image') {
    const item: DesktopImageItem = {
      id,
      name,
      kind: 'image',
      imageUrl: url,
      icon: 'image',
      x,
      y,
      home: '/Desktop',
    };
    return item;
  }
  if (kind === 'video') {
    const item: DesktopVideoItem = {
      id,
      name,
      kind: 'video',
      videoUrl: url,
      icon: 'video',
      x,
      y,
      home: '/Desktop',
    };
    return item;
  }
  const item: DesktopAudioItem = {
    id,
    name,
    kind: 'audio',
    audioUrl: url,
    icon: 'music',
    x,
    y,
    home: '/Desktop',
  };
  return item;
}

/** Persist media and nest under folder / special path when needed. */
function placeNewMedia(item: DesktopMediaItem, parentPath?: string): DesktopMediaItem {
  const media = getDesktopMedia();
  media.push(item);
  saveMedia(media);

  if (parentPath && parentPath !== '/Desktop') {
    const folder = getFolderByPath(parentPath);
    if (folder) {
      addItemToFolder(folder.id, item.id);
    } else if (isWritableSpecialPath(parentPath)) {
      moveItemToSpecialLocation(parentPath, item.id);
    } else {
      notifyDesktopUpdated();
    }
  } else {
    notifyDesktopUpdated();
  }

  return item;
}

/**
 * Create a `.url` shortcut file that opens in the Browser.
 */
export function createDesktopLink(
  url: string,
  name?: string,
  x?: number,
  y?: number,
  parentPath?: string
): ReturnType<typeof createDesktopFile> {
  const preferred =
    x !== undefined && y !== undefined ? clampGridPosition(x, y) : nextDesktopPosition();
  const base = (name || nameFromUrl(url, 'Link')).replace(/[/\\?%*:|"<>]/g, '-');
  const fileName = base.toLowerCase().endsWith('.url') ? base : `${base}.url`;
  const file = createDesktopFile(
    fileName,
    preferred.x,
    preferred.y,
    parentPath === '/Desktop' ? undefined : parentPath
  );
  updateFileContent(file.id, `[InternetShortcut]\nURL=${url}\n`);
  return getFileById(file.id) ?? file;
}

/**
 * Import a remote or local URL as a desktop media item or link file.
 */
export async function importUrlToDesktop(
  url: string,
  options?: { name?: string; x?: number; y?: number; parentPath?: string }
): Promise<DesktopItem | null> {
  const trimmed = url.trim();
  if (!trimmed) return null;

  const pos = nextDesktopPosition(
    options?.x !== undefined && options?.y !== undefined
      ? { x: options.x, y: options.y }
      : undefined
  );
  const x = options?.x !== undefined ? clampGridPosition(options.x, options.y ?? pos.y).x : pos.x;
  const y = options?.y !== undefined ? clampGridPosition(options.x ?? pos.x, options.y).y : pos.y;
  const parentPath = options?.parentPath;

  if (isImageUrl(trimmed) || trimmed.startsWith('data:image/')) {
    try {
      let dataUrl = trimmed;
      if (!trimmed.startsWith('data:')) {
        const response = await fetch(trimmed, { signal: fetchTimeoutSignal() });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        if (blob.size > MAX_INLINE_BYTES) {
          return createDesktopLink(trimmed, options?.name, x, y, parentPath);
        }
        dataUrl = await readFileAsDataUrl(blob);
      }
      const name = options?.name || nameFromUrl(trimmed, 'image.png');
      const item = createUserMediaItem('image', name, dataUrl, x, y);
      return placeNewMedia(item, parentPath);
    } catch {
      return createDesktopLink(trimmed, options?.name, x, y, parentPath);
    }
  }

  return createDesktopLink(trimmed, options?.name, x, y, parentPath);
}

/**
 * Import one or more OS `File` objects into the VFS (desktop or folder).
 */
export async function importOsFiles(
  files: FileList | File[],
  options?: { x?: number; y?: number; parentPath?: string }
): Promise<DesktopItem[]> {
  const list = Array.from(files);
  const created: DesktopItem[] = [];
  let cursor =
    options?.x !== undefined && options?.y !== undefined
      ? clampGridPosition(options.x, options.y)
      : nextDesktopPosition();

  for (const file of list) {
    const pos = created.length === 0 ? cursor : nextDesktopPosition(cursor);
    cursor = pos;

    try {
      if (isImageFileName(file.name) || file.type.startsWith('image/')) {
        if (file.size > MAX_INLINE_BYTES) {
          console.warn('[file-transfer] Image too large to inline:', file.name);
          continue;
        }
        const dataUrl = await readFileAsDataUrl(file);
        const item = createUserMediaItem('image', file.name, dataUrl, pos.x, pos.y);
        created.push(placeNewMedia(item, options?.parentPath));
        continue;
      }

      if (file.type.startsWith('audio/') || isAudioFileName(file.name)) {
        if (file.size > MAX_INLINE_BYTES) {
          console.warn('[file-transfer] Audio too large to inline:', file.name);
          continue;
        }
        const dataUrl = await readFileAsDataUrl(file);
        const item = createUserMediaItem('audio', file.name, dataUrl, pos.x, pos.y);
        created.push(placeNewMedia(item, options?.parentPath));
        continue;
      }

      if (isVideoFileName(file.name) || file.type.startsWith('video/')) {
        if (file.size > MAX_INLINE_BYTES) {
          console.warn('[file-transfer] Video too large to inline:', file.name);
          continue;
        }
        const dataUrl = await readFileAsDataUrl(file);
        const item = createUserMediaItem('video', file.name, dataUrl, pos.x, pos.y);
        created.push(placeNewMedia(item, options?.parentPath));
        continue;
      }

      const text = await readFileAsText(file);
      const deskFile = createDesktopFile(
        file.name,
        pos.x,
        pos.y,
        options?.parentPath === '/Desktop' ? undefined : options?.parentPath
      );
      updateFileContent(deskFile.id, text);
      const live = getFileById(deskFile.id);
      if (live) created.push(live);
    } catch (error) {
      console.error('[file-transfer] Failed to import', file.name, error);
    }
  }

  return created;
}

/** Parse URL from an Internet Shortcut `.url` body, or treat whole body as URL. */
export function parseUrlFileContent(content: string): string | null {
  const match = content.match(/^\s*URL\s*=\s*(.+)\s*$/im);
  if (match?.[1]) return match[1].trim();
  const trimmed = content.trim();
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('blob:') || trimmed.startsWith('/')) {
    return trimmed;
  }
  return null;
}

/**
 * Trigger a browser download for a VFS file or media item.
 */
export async function downloadDesktopItem(item: DesktopItem): Promise<void> {
  if (isFileItem(item)) {
    const mime = getMimeTypeForName(item.name);
    const blob = new Blob([item.content], { type: mime });
    triggerBlobDownload(blob, item.name);
    return;
  }

  if (isMediaItem(item)) {
    const url = getMediaUrl(item);
    if (url.startsWith('data:')) {
      const response = await fetch(url);
      const blob = await response.blob();
      triggerBlobDownload(blob, item.name);
      return;
    }
    try {
      const response = await fetch(url, { signal: fetchTimeoutSignal() });
      const blob = await response.blob();
      triggerBlobDownload(blob, item.name);
    } catch {
      const a = document.createElement('a');
      a.href = url;
      a.download = item.name;
      a.target = '_blank';
      a.rel = 'noopener';
      a.click();
    }
  }
}

/** Download by item id (file or media). */
export async function downloadItemById(itemId: string): Promise<void> {
  const file = getFileById(itemId);
  if (file) {
    await downloadDesktopItem(file);
    return;
  }
  const media = getMediaById(itemId);
  if (media) await downloadDesktopItem(media);
}

function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Read a URL from a DataTransfer (browser bookmark MIME, uri-list, or plain text).
 */
export function readDraggedUrl(dataTransfer: DataTransfer): string | null {
  const bookmark = dataTransfer.getData(DESKOS_URL_DRAG_TYPE);
  if (bookmark?.trim()) return bookmark.trim();

  const uriList = dataTransfer.getData('text/uri-list');
  if (uriList) {
    const line = uriList
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith('#'));
    if (line) return line;
  }

  const plain = dataTransfer.getData('text/plain')?.trim();
  if (
    plain &&
    (/^https?:\/\//i.test(plain) || plain.startsWith('data:') || plain.startsWith('/'))
  ) {
    return plain;
  }

  return null;
}

/** Whether the drag payload looks like an external file or URL drop. */
export function hasExternalFileDrag(types: readonly string[]): boolean {
  return (
    types.includes('Files') ||
    types.includes(DESKOS_URL_DRAG_TYPE) ||
    types.includes('text/uri-list')
  );
}

/** Open a file picker and import selected files into the VFS. */
export function pickAndImportFiles(options?: {
  x?: number;
  y?: number;
  parentPath?: string;
}): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.style.display = 'none';

  const cleanup = () => {
    if (!input.isConnected) return;
    input.remove();
  };

  input.onchange = () => {
    const files = input.files;
    cleanup();
    if (files && files.length > 0) {
      void importOsFiles(files, options);
    }
  };
  input.addEventListener('cancel', cleanup);
  // Browsers without a cancel event: remove the input after the picker closes.
  window.addEventListener(
    'focus',
    () => {
      window.setTimeout(cleanup, 500);
    },
    { once: true }
  );

  document.body.appendChild(input);
  input.click();
}

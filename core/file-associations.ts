/**
 * Extension → app open associations for desktop files and media.
 */

/** Apps that can open a file by extension. */
export type FileOpenHandler = 'text-editor' | 'browser' | 'photos' | 'videos';

/** Explicit extension map (lowercase, no leading dot). Unlisted → text-editor. */
const EXTENSION_HANDLERS: Record<string, FileOpenHandler> = {
  txt: 'text-editor',
  html: 'browser',
  htm: 'browser',
  pdf: 'browser',
  url: 'browser',
  png: 'photos',
  jpg: 'photos',
  jpeg: 'photos',
  gif: 'photos',
  webp: 'photos',
  svg: 'browser',
  mp4: 'videos',
  webm: 'videos',
  ogg: 'videos',
};

/** MIME types used when building blob URLs for browser / media open. */
const EXTENSION_MIME: Record<string, string> = {
  txt: 'text/plain',
  html: 'text/html',
  htm: 'text/html',
  pdf: 'application/pdf',
  url: 'application/internet-shortcut',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  webm: 'video/webm',
  ogg: 'video/ogg',
};

/**
 * Lowercase file extension without the leading dot, or empty string.
 */
export function getFileExtension(name: string): string {
  const base = name.split('/').pop() ?? name;
  const dot = base.lastIndexOf('.');
  if (dot <= 0 || dot === base.length - 1) return '';
  return base.slice(dot + 1).toLowerCase();
}

/**
 * Whether `ext` has an explicit association (not the text-editor default).
 */
export function hasExplicitOpenHandler(ext: string): boolean {
  return Object.prototype.hasOwnProperty.call(EXTENSION_HANDLERS, ext.toLowerCase());
}

/**
 * Resolve which app should open a file with the given extension.
 * Unknown extensions fall back to the text editor.
 */
export function getOpenHandler(ext: string): FileOpenHandler {
  const key = ext.toLowerCase();
  return EXTENSION_HANDLERS[key] ?? 'text-editor';
}

/**
 * MIME type for a file name / extension, defaulting to text/plain.
 */
export function getMimeTypeForName(name: string): string {
  const ext = getFileExtension(name);
  return EXTENSION_MIME[ext] ?? 'text/plain';
}

/**
 * Build a blob: URL from UTF-8 text content for preview / browser open.
 */
export function createContentBlobUrl(content: string, name: string): string {
  const mime = getMimeTypeForName(name);
  const blob = new Blob([content], { type: mime });
  return URL.createObjectURL(blob);
}

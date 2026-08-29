/**
 * Open a desktop item with the appropriate app (extension associations + media kinds).
 */

import {
  getFileExtension,
  getOpenHandler,
  hasExplicitOpenHandler,
  createContentBlobUrl,
  type FileOpenHandler,
} from './file-associations';
import {
  isDesktopFolder,
  isDesktopShortcut,
  isFileItem,
  isImageItem,
  isVideoItem,
  isAudioItem,
  isMediaItem,
  getMediaUrl,
  type DesktopItem,
  type DesktopFileItem,
  type DesktopMediaItem,
} from './desktop-shortcuts';
import { launchOrFocusProgram } from './context';
import { parseUrlFileContent } from './file-transfer';

/** Resolve open handler for a named file (user file or media). */
function resolveHandlerForName(name: string, mediaFallback?: FileOpenHandler): FileOpenHandler {
  const ext = getFileExtension(name);
  if (hasExplicitOpenHandler(ext) || !mediaFallback) {
    return getOpenHandler(ext);
  }
  return mediaFallback;
}

/** Open a user-created text file via the association map. */
function openFileItem(item: DesktopFileItem): void {
  const ext = getFileExtension(item.name);
  const handler = getOpenHandler(ext);

  // Internet shortcuts: open the target URL in the Browser.
  if (ext === 'url') {
    const target = parseUrlFileContent(item.content);
    if (target) {
      window.dispatchEvent(
        new CustomEvent('open-browser-url', { detail: { url: target, title: item.name } })
      );
      return;
    }
  }

  if (handler === 'text-editor') {
    window.dispatchEvent(new CustomEvent('open-text-file', { detail: { fileId: item.id } }));
    return;
  }

  const url = createContentBlobUrl(item.content, item.name);
  if (handler === 'browser') {
    window.dispatchEvent(
      new CustomEvent('open-browser-url', { detail: { url, title: item.name } })
    );
    return;
  }
  if (handler === 'photos') {
    window.dispatchEvent(
      new CustomEvent('open-image', {
        detail: { images: [{ src: url, name: item.name }], startIndex: 0 },
      })
    );
    return;
  }
  if (handler === 'videos') {
    window.dispatchEvent(
      new CustomEvent('open-video', {
        detail: { videos: [{ src: url, name: item.name }], startIndex: 0 },
      })
    );
  }
}

/** Open a seeded / copied media item (extension map overrides kind when listed). */
function openMediaItem(item: DesktopMediaItem): void {
  const kindFallback: FileOpenHandler | undefined = isImageItem(item)
    ? 'photos'
    : isVideoItem(item)
      ? 'videos'
      : undefined;

  // Audio always uses Music unless extension is explicitly remapped (e.g. .ogg → videos).
  if (isAudioItem(item) && !hasExplicitOpenHandler(getFileExtension(item.name))) {
    window.dispatchEvent(
      new CustomEvent('open-audio', {
        detail: {
          tracks: [{ src: getMediaUrl(item), name: item.name }],
          startIndex: 0,
        },
      })
    );
    return;
  }

  const handler = resolveHandlerForName(
    item.name,
    kindFallback ?? (isAudioItem(item) ? undefined : 'text-editor')
  );
  const url = getMediaUrl(item);

  if (handler === 'text-editor') {
    // Media assets are not text-editable in VFS; fall back to kind-based open.
    if (isImageItem(item)) {
      window.dispatchEvent(
        new CustomEvent('open-image', {
          detail: { images: [{ src: url, name: item.name }], startIndex: 0 },
        })
      );
    } else if (isVideoItem(item)) {
      window.dispatchEvent(
        new CustomEvent('open-video', {
          detail: { videos: [{ src: url, name: item.name }], startIndex: 0 },
        })
      );
    } else if (isAudioItem(item)) {
      window.dispatchEvent(
        new CustomEvent('open-audio', {
          detail: { tracks: [{ src: url, name: item.name }], startIndex: 0 },
        })
      );
    }
    return;
  }

  if (handler === 'browser') {
    window.dispatchEvent(
      new CustomEvent('open-browser-url', { detail: { url, title: item.name } })
    );
    return;
  }
  if (handler === 'photos') {
    window.dispatchEvent(
      new CustomEvent('open-image', {
        detail: { images: [{ src: url, name: item.name }], startIndex: 0 },
      })
    );
    return;
  }
  if (handler === 'videos') {
    window.dispatchEvent(
      new CustomEvent('open-video', {
        detail: { videos: [{ src: url, name: item.name }], startIndex: 0 },
      })
    );
  }
}

/**
 * Open a desktop item: folder navigate/open, shortcut launch, or file/media by association.
 *
 * @param item - Item to open
 * @param options.folderPath - When opening a folder inside a window, current path for navigate
 * @param options.windowId - Folder window id for in-window navigate
 */
export async function openDesktopItem(
  item: DesktopItem,
  options?: { folderPath?: string; windowId?: string }
): Promise<void> {
  if (isDesktopFolder(item)) {
    if (options?.folderPath && options.windowId) {
      window.dispatchEvent(
        new CustomEvent('folder-navigate', {
          detail: {
            windowId: options.windowId,
            path: `${options.folderPath}/${item.name}`,
          },
        })
      );
    } else {
      window.dispatchEvent(new CustomEvent('open-folder', { detail: { folderId: item.id } }));
    }
    return;
  }

  if (isDesktopShortcut(item)) {
    await launchOrFocusProgram(item.programId);
    return;
  }

  if (isFileItem(item)) {
    openFileItem(item);
    return;
  }

  if (isMediaItem(item)) {
    openMediaItem(item);
  }
}

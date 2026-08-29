import { createScopedStorage } from './storage';
import { useKernel } from './kernel';
import { GRID_OCCUPANCY_RATIO } from './constants';

/** Shortcut pinned to the desktop grid. */
export interface DesktopShortcut {
  id: string;
  programId: string;
  x: number;
  y: number;
  customName?: string;
}

/** User-created folder on the desktop or inside another folder. */
export interface DesktopFolder {
  id: string;
  name: string;
  x: number;
  y: number;
  icon: string;
  createdAt: number;
  contents: string[]; // Array of item IDs (shortcuts or folders)
  parentPath?: string; // Path of parent folder, undefined for root
}

/**
 * Read-only image entry shown inside a special location (e.g. `/Images`).
 * Not user-created and not persisted — it points at a bundled asset URL.
 */
export interface DesktopImageItem {
  id: string;
  name: string;
  kind: 'image';
  /** Asset URL served from `public/` (e.g. `/img/acer.png`). */
  imageUrl: string;
  icon: string;
  x: number;
  y: number;
  /**
   * Where the item lives when not inside a folder or special-location contents list.
   * `/Images` = media library; `/Desktop` = desktop surface.
   */
  home: '/Images' | '/Desktop';
}

/**
 * Video entry shown inside `/Videos`, the desktop, or a user folder.
 * Points at a bundled asset URL under `public/video/`.
 */
export interface DesktopVideoItem {
  id: string;
  name: string;
  kind: 'video';
  /** Asset URL served from `public/` (e.g. `/video/clip.mp4`). */
  videoUrl: string;
  icon: string;
  x: number;
  y: number;
  /**
   * Where the item lives when not inside a folder or special-location contents list.
   * `/Videos` = media library; `/Desktop` = desktop surface.
   */
  home: '/Videos' | '/Desktop';
}

/**
 * Special locations that accept arbitrary items (paste / drop / cut).
 * `/Applications` is excluded (virtual program list).
 */
export const WRITABLE_SPECIAL_PATHS = [
  '/Documents',
  '/Downloads',
  '/Music',
  '/Images',
  '/Videos',
] as const;

/** Absolute path of a writable special location. */
export type WritableSpecialPath = (typeof WRITABLE_SPECIAL_PATHS)[number];

/** Whether `path` is a special location that stores user-moved items. */
export function isWritableSpecialPath(path: string): path is WritableSpecialPath {
  return (WRITABLE_SPECIAL_PATHS as readonly string[]).includes(path);
}

/** Persisted image or video file item. */
export type DesktopMediaItem = DesktopImageItem | DesktopVideoItem;

/** Desktop shortcut, folder, or media file item. */
export type DesktopItem = DesktopShortcut | DesktopFolder | DesktopImageItem | DesktopVideoItem;

/**
 * Type guard: whether a desktop item is a folder.
 *
 * @param item - Shortcut, folder, or image
 * @returns `true` if `item` is a `DesktopFolder`
 */
export function isDesktopFolder(item: DesktopItem): item is DesktopFolder {
  return 'name' in item && 'contents' in item;
}

/**
 * Type guard: whether a desktop item is a program shortcut.
 *
 * @param item - Shortcut, folder, or image
 * @returns `true` if `item` is a `DesktopShortcut`
 */
export function isDesktopShortcut(item: DesktopItem): item is DesktopShortcut {
  return 'programId' in item;
}

/**
 * Type guard: whether a desktop item is a read-only image entry.
 *
 * @param item - Shortcut, folder, or image
 * @returns `true` if `item` is a `DesktopImageItem`
 */
export function isImageItem(item: DesktopItem): item is DesktopImageItem {
  return 'kind' in item && item.kind === 'image';
}

/**
 * Type guard: whether a desktop item is a read-only video entry.
 *
 * @param item - Shortcut, folder, image, or video
 * @returns `true` if `item` is a `DesktopVideoItem`
 */
export function isVideoItem(item: DesktopItem): item is DesktopVideoItem {
  return 'kind' in item && item.kind === 'video';
}

/**
 * Type guard: whether a desktop item is a persisted media file.
 */
export function isMediaItem(item: DesktopItem): item is DesktopMediaItem {
  return isImageItem(item) || isVideoItem(item);
}

/** Asset URL for a media item. */
export function getMediaUrl(item: DesktopMediaItem): string {
  return isImageItem(item) ? item.imageUrl : item.videoUrl;
}

/** System storage key for live desktop shortcuts. */
const STORAGE_KEY = 'desktop-shortcuts';
/** System storage key for live desktop folders. */
const FOLDERS_STORAGE_KEY = 'desktop-folders';
/** System storage key for folder id → absolute path map. */
const FOLDER_PATHS_STORAGE_KEY = 'folder-paths';
/** System storage key for persisted image/video file items. */
const MEDIA_STORAGE_KEY = 'desktop-media';
/** URLs already seeded from the bundled catalog (never re-seed after delete). */
const MEDIA_KNOWN_URLS_KEY = 'media-known-urls';
/** System storage key: special location path → item id list. */
const SPECIAL_CONTENTS_KEY = 'special-location-contents';

/**
 * Get current grid size from settings
 */
export function getGridSize(): number {
  return useKernel.getState().settings.gridSize;
}

/** Scoped system storage for desktop shortcut/folder persistence. */
const systemStorage = createScopedStorage('system');

/**
 * Get all desktop shortcuts
 */
export function getDesktopShortcuts(): DesktopShortcut[] {
  const shortcuts = systemStorage.getItem<DesktopShortcut[]>(STORAGE_KEY);
  return shortcuts || [];
}

/**
 * Add a new desktop shortcut
 */
export function addDesktopShortcut(
  programId: string,
  x?: number,
  y?: number,
  customName?: string
): DesktopShortcut {
  const shortcuts = getDesktopShortcuts();
  const folders = getDesktopFolders();

  // Check if shortcut already exists for this program
  const existing = shortcuts.find((s) => s.programId === programId);
  if (existing) {
    // Check if the shortcut is inside a folder
    const isInFolder = folders.some((f) => f.contents.includes(existing.id));

    // If it's in a folder and we're providing a position, remove it from the folder
    if (isInFolder && x !== undefined && y !== undefined) {
      folders.forEach((folder) => {
        if (folder.contents.includes(existing.id)) {
          folder.contents = folder.contents.filter((id) => id !== existing.id);
        }
      });
      systemStorage.setItem(FOLDERS_STORAGE_KEY, folders);
    }

    // Update existing shortcut position if provided
    if (x !== undefined && y !== undefined) {
      const clamped = clampGridPosition(x, y);
      existing.x = clamped.x;
      existing.y = clamped.y;
    }
    if (customName !== undefined) {
      existing.customName = customName;
    }
    systemStorage.setItem(STORAGE_KEY, shortcuts);

    // Always dispatch event when updating existing shortcut
    window.dispatchEvent(new CustomEvent('desktop-shortcuts-updated'));
    return existing;
  }

  // Find next available position if not provided
  const positionNotSpecified = x === undefined || y === undefined;
  if (x === undefined || y === undefined) {
    const inFolders = getIdsInsideFolders();
    const rootItems = [
      ...shortcuts.filter((s) => !inFolders.has(s.id)),
      ...folders.filter(isRootDesktopFolder),
      ...getDesktopSurfaceMedia(),
    ];
    const position = findNextAvailablePosition(rootItems.map((item) => ({ x: item.x, y: item.y })));
    x = position.x;
    y = position.y;
  } else {
    const clamped = clampGridPosition(x, y);
    x = clamped.x;
    y = clamped.y;
  }

  const newShortcut: DesktopShortcut = {
    id: `shortcut-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    programId,
    x,
    y,
    customName,
  };

  shortcuts.push(newShortcut);
  systemStorage.setItem(STORAGE_KEY, shortcuts);
  rememberGridMetrics();

  // If auto arrange is enabled and position was not manually specified, arrange all icons
  if (positionNotSpecified && useKernel.getState().settings.autoArrange) {
    autoArrangeIcons();
  } else {
    // Dispatch event to notify DesktopIcons to refresh
    window.dispatchEvent(new CustomEvent('desktop-shortcuts-updated'));
  }

  return newShortcut;
}

/**
 * Remove a desktop shortcut
 */
export function removeDesktopShortcut(shortcutId: string): void {
  const shortcuts = getDesktopShortcuts();
  const filtered = shortcuts.filter((s) => s.id !== shortcutId);
  systemStorage.setItem(STORAGE_KEY, filtered);
}

/**
 * Update desktop shortcut position
 */
export function updateDesktopShortcutPosition(shortcutId: string, x: number, y: number): void {
  const shortcuts = getDesktopShortcuts();
  const shortcut = shortcuts.find((s) => s.id === shortcutId);
  if (shortcut) {
    const clamped = clampGridPosition(x, y);
    shortcut.x = clamped.x;
    shortcut.y = clamped.y;
    systemStorage.setItem(STORAGE_KEY, shortcuts);
    rememberGridMetrics();
  }
}

/**
 * Folder shown on the desktop surface (not nested inside another folder)
 */
function isRootDesktopFolder(folder: DesktopFolder): boolean {
  return !folder.parentPath || folder.parentPath === '/Desktop';
}

/** Special path → item ids stored in that location. */
function getSpecialContentsMap(): Record<string, string[]> {
  return systemStorage.getItem<Record<string, string[]>>(SPECIAL_CONTENTS_KEY) || {};
}

function saveSpecialContentsMap(map: Record<string, string[]>): void {
  systemStorage.setItem(SPECIAL_CONTENTS_KEY, map);
}

/**
 * Item ids nested in a user folder or a writable special location.
 * Used so those items are not also listed on the desktop / media libraries.
 */
function getIdsInsideFolders(): Set<string> {
  const ids = new Set<string>();
  getDesktopFolders().forEach((folder) => {
    folder.contents.forEach((id) => ids.add(id));
  });
  Object.values(getSpecialContentsMap()).forEach((list) => {
    list.forEach((id) => ids.add(id));
  });
  return ids;
}

/** Remove `itemId` from every special-location contents list. */
export function removeItemFromAllSpecialLocations(itemId: string): void {
  const map = getSpecialContentsMap();
  let changed = false;
  for (const path of Object.keys(map)) {
    const next = map[path].filter((id) => id !== itemId);
    if (next.length !== map[path].length) {
      map[path] = next;
      changed = true;
    }
  }
  if (changed) saveSpecialContentsMap(map);
}

/** Special location path that currently contains `itemId`, or `null`. */
export function findSpecialLocationOfItem(itemId: string): WritableSpecialPath | null {
  const map = getSpecialContentsMap();
  for (const path of WRITABLE_SPECIAL_PATHS) {
    if (map[path]?.includes(itemId)) return path;
  }
  return null;
}

/** Resolve stored ids in a special location to live desktop items. */
export function getSpecialLocationContentItems(path: WritableSpecialPath): DesktopItem[] {
  const ids = getSpecialContentsMap()[path] || [];
  if (ids.length === 0) return [];

  const shortcuts = getDesktopShortcuts();
  const folders = getDesktopFolders();
  const media = getDesktopMedia();

  return ids
    .map((itemId) => {
      const shortcut = shortcuts.find((s) => s.id === itemId);
      if (shortcut) return shortcut;
      const folder = folders.find((f) => f.id === itemId);
      if (folder) return folder;
      return media.find((m) => m.id === itemId) || null;
    })
    .filter((item): item is DesktopItem => item !== null);
}

/**
 * Move an item into a writable special location (Documents, Images, …).
 * Removes it from folders / other special locations first.
 * Media destined for `/Images` or `/Videos` uses `home` (library); otherwise contents.
 */
export function moveItemToSpecialLocation(path: WritableSpecialPath, itemId: string): void {
  const folders = getDesktopFolders();
  let foldersChanged = false;
  folders.forEach((folder) => {
    if (folder.contents.includes(itemId)) {
      folder.contents = folder.contents.filter((id) => id !== itemId);
      foldersChanged = true;
    }
  });
  if (foldersChanged) systemStorage.setItem(FOLDERS_STORAGE_KEY, folders);

  removeItemFromAllSpecialLocations(itemId);

  const media = getDesktopMedia();
  const mediaItem = media.find((m) => m.id === itemId);
  const itemFolder = folders.find((f) => f.id === itemId);

  if (mediaItem && (path === '/Images' || path === '/Videos')) {
    if (isImageItem(mediaItem) && path === '/Images') {
      mediaItem.home = '/Images';
    } else if (isVideoItem(mediaItem) && path === '/Videos') {
      mediaItem.home = '/Videos';
    } else {
      // Cross-type library (e.g. image → /Videos): store in contents.
      mediaItem.home = '/Desktop';
      const map = getSpecialContentsMap();
      const list = map[path] || [];
      if (!list.includes(itemId)) {
        list.push(itemId);
        map[path] = list;
        saveSpecialContentsMap(map);
      }
    }
    saveDesktopMedia(media);
    notifyDesktopUpdated();
    return;
  }

  if (mediaItem) {
    mediaItem.home = '/Desktop';
    saveDesktopMedia(media);
  }

  if (itemFolder) {
    itemFolder.parentPath = path;
    systemStorage.setItem(FOLDERS_STORAGE_KEY, folders);
    const paths = getFolderPaths();
    paths[itemId] = `${path}/${itemFolder.name}`;
    setFolderPaths(paths);
  }

  const map = getSpecialContentsMap();
  const list = map[path] || [];
  if (!list.includes(itemId)) {
    list.push(itemId);
    map[path] = list;
    saveSpecialContentsMap(map);
  }

  notifyDesktopUpdated();
}

/** Remove an item from one special location's contents list. */
export function removeItemFromSpecialLocation(path: string, itemId: string): void {
  const map = getSpecialContentsMap();
  const list = map[path];
  if (!list || !list.includes(itemId)) return;
  map[path] = list.filter((id) => id !== itemId);
  saveSpecialContentsMap(map);
  notifyDesktopUpdated();
}

/**
 * Move items into a filesystem path (writable special location, user folder, or Desktop).
 * Used by folder-sidebar drops and desktop-icon drops onto sidebar targets.
 *
 * @returns `true` if the path accepted the items
 */
export function moveItemsToPath(path: string, itemIds: string[]): boolean {
  const uniqueIds = [...new Set(itemIds)];
  if (uniqueIds.length === 0) return false;
  if (path === '/Applications') return false;

  if (isWritableSpecialPath(path)) {
    for (const itemId of uniqueIds) {
      moveItemToSpecialLocation(path, itemId);
    }
    return true;
  }

  if (path === '/Desktop') {
    const occupied = getDesktopSurfacePositions(uniqueIds);
    for (const itemId of uniqueIds) {
      const parentFolder = getDesktopFolders().find((folder) => folder.contents.includes(itemId));
      if (parentFolder) {
        removeItemFromFolder(parentFolder.id, itemId);
      }

      const specialParent = findSpecialLocationOfItem(itemId);
      if (specialParent) {
        removeItemFromSpecialLocation(specialParent, itemId);
      }

      const next = findNextAvailablePosition(occupied);
      occupied.push(next);

      if (getMediaById(itemId)) {
        placeMediaOnDesktop(itemId, next.x, next.y);
        continue;
      }

      const folders = getDesktopFolders();
      const folder = folders.find((entry) => entry.id === itemId);
      if (folder) {
        folder.parentPath = '/Desktop';
        const paths = getFolderPaths();
        paths[itemId] = `/Desktop/${folder.name}`;
        setFolderPaths(paths);
        systemStorage.setItem(FOLDERS_STORAGE_KEY, folders);
        updateFolderPosition(itemId, next.x, next.y);
        continue;
      }

      if (getDesktopShortcuts().some((shortcut) => shortcut.id === itemId)) {
        updateDesktopShortcutPosition(itemId, next.x, next.y);
      }
    }
    return true;
  }

  const targetFolder = getFolderByPath(path);
  if (!targetFolder) return false;

  for (const itemId of uniqueIds) {
    if (itemId === targetFolder.id) continue;
    if (
      getDesktopFolders().some((folder) => folder.id === itemId) &&
      folderContainsItem(itemId, targetFolder.id)
    ) {
      continue;
    }
    addItemToFolder(targetFolder.id, itemId);
  }
  return true;
}

/** Notify UI that desktop / folder / media contents changed. */
function notifyDesktopUpdated(): void {
  window.dispatchEvent(new CustomEvent('desktop-shortcuts-updated'));
}

/** Get all persisted media file items. */
export function getDesktopMedia(): DesktopMediaItem[] {
  return systemStorage.getItem<DesktopMediaItem[]>(MEDIA_STORAGE_KEY) || [];
}

function saveDesktopMedia(media: DesktopMediaItem[]): void {
  systemStorage.setItem(MEDIA_STORAGE_KEY, media);
}

/** URLs already known from the bundled catalog (or prior copies). */
function getKnownMediaUrls(): Set<string> {
  return new Set(systemStorage.getItem<string[]>(MEDIA_KNOWN_URLS_KEY) || []);
}

function saveKnownMediaUrls(urls: Set<string>): void {
  systemStorage.setItem(MEDIA_KNOWN_URLS_KEY, Array.from(urls));
}

/** Trash storage key (read-only here to avoid a circular import with trash.ts). */
const TRASH_STORAGE_KEY = 'trash-items';

/** Collect media ids/urls currently represented in the trash tree. */
function collectTrashMediaRefs(): { ids: Set<string>; urls: Set<string> } {
  type TrashLike = { item: DesktopItem; nested?: TrashLike[] };
  const ids = new Set<string>();
  const urls = new Set<string>();
  const walk = (entries: TrashLike[]) => {
    for (const entry of entries) {
      if (isMediaItem(entry.item)) {
        ids.add(entry.item.id);
        urls.add(getMediaUrl(entry.item));
      }
      if (entry.nested) walk(entry.nested);
    }
  };
  walk(systemStorage.getItem<TrashLike[]>(TRASH_STORAGE_KEY) || []);
  return { ids, urls };
}

/** Whether this is the original catalog seed row (not a user copy). */
function isOriginalSeedRecord(item: DesktopMediaItem, kind: 'image' | 'video'): boolean {
  return item.kind === kind && item.id === `${kind}-${item.name}`;
}

/**
 * Seed library once from bundled catalog; deleted URLs are not re-created.
 * Also drops original seeds whose URL left the catalog, unless the record is
 * nested in a folder/special location or represented in the trash.
 */
export function ensureMediaLibrarySeeded(
  kind: 'image' | 'video',
  catalog: Array<{ name: string; url: string }>
): void {
  const media = getDesktopMedia();
  const known = getKnownMediaUrls();
  media.forEach((item) => known.add(getMediaUrl(item)));

  const catalogUrls = new Set(catalog.map((entry) => entry.url));
  const contained = getIdsInsideFolders();
  const trashRefs = collectTrashMediaRefs();

  let changed = false;

  // Drop original seeds no longer in the catalog (keep copies / nested / trash).
  for (let i = media.length - 1; i >= 0; i--) {
    const item = media[i];
    if (!isOriginalSeedRecord(item, kind)) continue;
    const url = getMediaUrl(item);
    if (catalogUrls.has(url)) continue;
    if (contained.has(item.id) || trashRefs.ids.has(item.id) || trashRefs.urls.has(url)) {
      continue;
    }
    media.splice(i, 1);
    changed = true;
  }

  catalog.forEach((entry, i) => {
    if (known.has(entry.url)) return;
    known.add(entry.url);
    changed = true;
    media.push(
      kind === 'image'
        ? {
            id: `image-${entry.name}`,
            name: entry.name,
            kind: 'image',
            imageUrl: entry.url,
            icon: 'image',
            x: 0,
            y: i,
            home: '/Images',
          }
        : {
            id: `video-${entry.name}`,
            name: entry.name,
            kind: 'video',
            videoUrl: entry.url,
            icon: 'video',
            x: 0,
            y: i,
            home: '/Videos',
          }
    );
  });

  saveKnownMediaUrls(known);
  if (changed) saveDesktopMedia(media);
}

/** Media shown in `/Images` or `/Videos` (not inside a folder or other location). */
export function getLibraryMediaItems(home: '/Images' | '/Videos'): DesktopMediaItem[] {
  const contained = getIdsInsideFolders();
  return getDesktopMedia().filter((item) => !contained.has(item.id) && item.home === home);
}

/** All items shown in a writable special location (library media + moved-in items). */
export function getWritableSpecialLocationItems(path: WritableSpecialPath): DesktopItem[] {
  const fromContents = getSpecialLocationContentItems(path);
  if (path === '/Images' || path === '/Videos') {
    const library = getLibraryMediaItems(path);
    const contentIds = new Set(fromContents.map((item) => item.id));
    return [...library.filter((item) => !contentIds.has(item.id)), ...fromContents];
  }
  return fromContents;
}

/** Media on the desktop surface. */
export function getDesktopSurfaceMedia(): DesktopMediaItem[] {
  const inFolders = getIdsInsideFolders();
  return getDesktopMedia().filter((item) => !inFolders.has(item.id) && item.home === '/Desktop');
}

/**
 * Look up a media item by id.
 */
export function getMediaById(mediaId: string): DesktopMediaItem | null {
  return getDesktopMedia().find((item) => item.id === mediaId) || null;
}

/** Clone a media item onto the desktop (or at x/y if given). */
export function copyDesktopMedia(
  sourceId: string,
  x?: number,
  y?: number
): DesktopMediaItem | null {
  const source = getMediaById(sourceId);
  if (!source) return null;

  let posX = x;
  let posY = y;
  if (posX === undefined || posY === undefined) {
    const occupied = [
      ...getDesktopShortcuts()
        .filter((s) => !getIdsInsideFolders().has(s.id))
        .map((s) => ({ x: s.x, y: s.y })),
      ...getDesktopFolders()
        .filter((f) => !f.parentPath || f.parentPath === '/Desktop')
        .map((f) => ({ x: f.x, y: f.y })),
      ...getDesktopSurfaceMedia().map((m) => ({ x: m.x, y: m.y })),
    ];
    const next = findNextAvailablePosition(occupied);
    posX = next.x;
    posY = next.y;
  }

  const id = `${source.kind}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const clone: DesktopMediaItem = isImageItem(source)
    ? { ...source, id, x: posX, y: posY, home: '/Desktop' }
    : { ...source, id, x: posX, y: posY, home: '/Desktop' };

  const media = getDesktopMedia();
  media.push(clone);
  saveDesktopMedia(media);
  notifyDesktopUpdated();
  return clone;
}

/** Move media to the desktop grid (also removes it from any folder / special location). */
export function placeMediaOnDesktop(mediaId: string, x: number, y: number): void {
  const media = getDesktopMedia();
  const item = media.find((m) => m.id === mediaId);
  if (!item) return;

  const folders = getDesktopFolders();
  let foldersChanged = false;
  folders.forEach((folder) => {
    if (folder.contents.includes(mediaId)) {
      folder.contents = folder.contents.filter((id) => id !== mediaId);
      foldersChanged = true;
    }
  });
  if (foldersChanged) systemStorage.setItem(FOLDERS_STORAGE_KEY, folders);

  removeItemFromAllSpecialLocations(mediaId);

  const clamped = clampGridPosition(x, y);
  item.x = clamped.x;
  item.y = clamped.y;
  item.home = '/Desktop';
  saveDesktopMedia(media);
  rememberGridMetrics();
  notifyDesktopUpdated();
}

/** Alias used by desktop icon reposition. */
export function updateMediaPosition(mediaId: string, x: number, y: number): void {
  placeMediaOnDesktop(mediaId, x, y);
}

/**
 * Find any desktop-surface item at a grid cell (ignores nested folder contents)
 */
export function findItemAtPosition(
  x: number,
  y: number,
  excludeId?: string | string[]
): DesktopItem | null {
  const exclude = new Set(
    excludeId == null ? [] : typeof excludeId === 'string' ? [excludeId] : excludeId
  );
  const shortcuts = getDesktopShortcuts();
  const folders = getDesktopFolders();
  const media = getDesktopSurfaceMedia();
  const inFolders = getIdsInsideFolders();
  const metrics = getGridMetrics();
  const col = Math.round(x / metrics.cellWidth);
  const row = Math.round(y / metrics.cellHeight);

  const shortcut = shortcuts.find((s) => {
    if (exclude.has(s.id)) return false;
    if (inFolders.has(s.id)) return false;
    return (
      Math.round(s.x / metrics.cellWidth) === col && Math.round(s.y / metrics.cellHeight) === row
    );
  });

  if (shortcut) return shortcut;

  const folder = folders.find((f) => {
    if (exclude.has(f.id)) return false;
    if (!isRootDesktopFolder(f)) return false;
    return (
      Math.round(f.x / metrics.cellWidth) === col && Math.round(f.y / metrics.cellHeight) === row
    );
  });

  if (folder) return folder;

  return (
    media.find((m) => {
      if (exclude.has(m.id)) return false;
      return (
        Math.round(m.x / metrics.cellWidth) === col && Math.round(m.y / metrics.cellHeight) === row
      );
    }) || null
  );
}

/** MIME type for multi-item drag payloads (JSON string[]) */
export const DESKOS_ITEM_IDS_MIME = 'application/x-deskos-item-ids';

/** Read dragged item ids from a DataTransfer (multi or single legacy fields) */
export function readDraggedItemIds(dataTransfer: DataTransfer): string[] {
  const raw = dataTransfer.getData(DESKOS_ITEM_IDS_MIME);
  if (raw) {
    try {
      const ids = JSON.parse(raw);
      if (Array.isArray(ids) && ids.length > 0) {
        return ids.filter((id): id is string => typeof id === 'string');
      }
    } catch {
      // fall through to single-id fields
    }
  }
  const shortcutId = dataTransfer.getData('application/x-deskos-shortcut-id');
  if (shortcutId) return [shortcutId];
  const folderId = dataTransfer.getData('application/x-deskos-folder-id');
  if (folderId) return [folderId];
  return [];
}

/**
 * Swap positions of two desktop items (shortcuts or folders)
 */
export function swapItemPositions(itemId1: string, itemId2: string): void {
  const shortcuts = getDesktopShortcuts();
  const folders = getDesktopFolders();
  const media = getDesktopMedia();

  const item1 =
    shortcuts.find((s) => s.id === itemId1) ||
    folders.find((f) => f.id === itemId1) ||
    media.find((m) => m.id === itemId1);
  const item2 =
    shortcuts.find((s) => s.id === itemId2) ||
    folders.find((f) => f.id === itemId2) ||
    media.find((m) => m.id === itemId2);

  if (item1 && item2) {
    const tempX = item1.x;
    const tempY = item1.y;
    item1.x = item2.x;
    item1.y = item2.y;
    item2.x = tempX;
    item2.y = tempY;

    systemStorage.setItem(STORAGE_KEY, shortcuts);
    systemStorage.setItem(FOLDERS_STORAGE_KEY, folders);
    saveDesktopMedia(media);
    rememberGridMetrics();

    window.dispatchEvent(new CustomEvent('desktop-shortcuts-updated'));
  }
}

/**
 * Desktop element size, or viewport fallback (full height — dock overlays icons)
 */
export function getDesktopBounds(): { width: number; height: number } {
  const el = document.querySelector('.desktop');
  if (el) {
    const rect = el.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

/** Computed desktop grid layout (cell count and stretched cell size). */
export interface GridMetrics {
  /** Preferred cell size from settings (used to pick cols/rows) */
  preferred: number;
  cols: number;
  rows: number;
  /** Stretched so cols×rows tile the desktop exactly (origin 0,0) */
  cellWidth: number;
  cellHeight: number;
}

/**
 * Metrics last used to write icon pixel positions (so resize can keep the same cells).
 */
let lastAppliedMetrics: GridMetrics | null = null;

/**
 * Root desktop items that occupy grid cells.
 */
function getRootDesktopItems(): DesktopItem[] {
  const inFolders = getIdsInsideFolders();
  const shortcuts = getDesktopShortcuts().filter((s) => !inFolders.has(s.id));
  const folders = getDesktopFolders().filter(isRootDesktopFolder);
  return [...shortcuts, ...folders];
}

/**
 * Cell index for a pixel position under the given metrics.
 *
 * @param x - Pixel X
 * @param y - Pixel Y
 * @param metrics - Metrics that produced (or match) those pixels
 */
function positionToCell(
  x: number,
  y: number,
  metrics: { cellWidth: number; cellHeight: number }
): { col: number; row: number } {
  return {
    col: Math.round(x / metrics.cellWidth),
    row: Math.round(y / metrics.cellHeight),
  };
}

/**
 * Farthest occupied cell indices (root desktop items only).
 * Uses last applied metrics, or preferred size for legacy pixel positions.
 */
function getOccupiedCellExtents(): { maxCol: number; maxRow: number } {
  const preferred = getGridSize();
  const indexMetrics = lastAppliedMetrics ?? {
    cellWidth: preferred,
    cellHeight: preferred,
  };

  let maxCol = -1;
  let maxRow = -1;
  getRootDesktopItems().forEach((item) => {
    const { col, row } = positionToCell(item.x, item.y, indexMetrics);
    maxCol = Math.max(maxCol, col);
    maxRow = Math.max(maxRow, row);
  });
  return { maxCol, maxRow };
}

/**
 * Grid that fills the desktop: preferred size picks density; cell size stretches.
 * Occupied cells are never dropped when the viewport shrinks (cols/rows only grow
 * to fit icons); icons keep the same cell index across resizes.
 *
 * @param bounds - Desktop pixel size
 */
export function getGridMetrics(
  bounds: { width: number; height: number } = getDesktopBounds()
): GridMetrics {
  const preferred = getGridSize();
  const baseCols = Math.max(1, Math.floor(bounds.width / preferred));
  const baseRows = Math.max(1, Math.floor(bounds.height / preferred));
  const { maxCol, maxRow } = getOccupiedCellExtents();
  const cols = Math.max(baseCols, maxCol + 1);
  const rows = Math.max(baseRows, maxRow + 1);
  return {
    preferred,
    cols,
    rows,
    cellWidth: bounds.width / cols,
    cellHeight: bounds.height / rows,
  };
}

/**
 * Remember metrics after icon pixel positions were written for those metrics.
 *
 * @param metrics - Metrics to treat as source of truth for cell indices
 */
export function rememberGridMetrics(metrics: GridMetrics = getGridMetrics()): void {
  lastAppliedMetrics = metrics;
}

/**
 * Pixel top-left of a grid cell.
 *
 * @param col - Column index (0-based)
 * @param row - Row index (0-based)
 * @param metrics - Current grid metrics
 * @returns `{ x, y }` at the cell origin
 */
function cellTopLeft(col: number, row: number, metrics: GridMetrics): { x: number; y: number } {
  return {
    x: col * metrics.cellWidth,
    y: row * metrics.cellHeight,
  };
}

/**
 * Clamp grid coords so the icon cell fits fully inside the desktop
 */
export function clampGridPosition(
  x: number,
  y: number,
  bounds: { width: number; height: number } = getDesktopBounds()
): { x: number; y: number } {
  const metrics = getGridMetrics(bounds);
  const col = Math.max(0, Math.min(metrics.cols - 1, Math.round(x / metrics.cellWidth)));
  const row = Math.max(0, Math.min(metrics.rows - 1, Math.round(y / metrics.cellHeight)));
  return cellTopLeft(col, row, metrics);
}

/**
 * Convert pixel coordinates to grid coordinates
 */
export function pixelToGrid(
  x: number,
  y: number,
  bounds: { width: number; height: number } = getDesktopBounds()
): { x: number; y: number } {
  const metrics = getGridMetrics(bounds);
  const col = Math.max(0, Math.min(metrics.cols - 1, Math.floor(x / metrics.cellWidth)));
  const row = Math.max(0, Math.min(metrics.rows - 1, Math.floor(y / metrics.cellHeight)));
  return cellTopLeft(col, row, metrics);
}

/**
 * Pixel → grid cell that fits fully on the desktop
 */
export function pixelToClampedGrid(
  x: number,
  y: number,
  bounds: { width: number; height: number } = getDesktopBounds()
): { x: number; y: number } {
  const snapped = pixelToGrid(x, y, bounds);
  return clampGridPosition(snapped.x, snapped.y, bounds);
}

/**
 * Find next available grid position
 */
export function findNextAvailablePosition(items: Array<{ x: number; y: number }>): {
  x: number;
  y: number;
} {
  const bounds = getDesktopBounds();
  const metrics = getGridMetrics(bounds);
  const thresholdX = metrics.cellWidth * GRID_OCCUPANCY_RATIO;
  const thresholdY = metrics.cellHeight * GRID_OCCUPANCY_RATIO;

  for (let row = 0; row < metrics.rows; row++) {
    for (let col = 0; col < metrics.cols; col++) {
      const pos = cellTopLeft(col, row, metrics);

      const occupied = items.some(
        (item) => Math.abs(item.x - pos.x) < thresholdX && Math.abs(item.y - pos.y) < thresholdY
      );

      if (!occupied) {
        return pos;
      }
    }
  }

  // If all visible cells are occupied, place past the grid (avoids overlapping origin)
  let y = metrics.rows * metrics.cellHeight;
  while (
    items.some((item) => Math.abs(item.x - 0) < thresholdX && Math.abs(item.y - y) < thresholdY)
  ) {
    y += metrics.cellHeight;
  }
  return { x: 0, y };
}

/** Whether a grid cell at `pos` overlaps an occupied item. */
function isCellOccupied(
  pos: { x: number; y: number },
  occupied: Array<{ x: number; y: number }>,
  metrics: ReturnType<typeof getGridMetrics>
): boolean {
  const thresholdX = metrics.cellWidth * GRID_OCCUPANCY_RATIO;
  const thresholdY = metrics.cellHeight * GRID_OCCUPANCY_RATIO;
  return occupied.some(
    (item) => Math.abs(item.x - pos.x) < thresholdX && Math.abs(item.y - pos.y) < thresholdY
  );
}

/**
 * Prefer `preferred` cell; if taken, pick the nearest free desktop cell (Windows-like).
 */
export function findNearestAvailablePosition(
  preferred: { x: number; y: number },
  occupied: Array<{ x: number; y: number }>,
  bounds: { width: number; height: number } = getDesktopBounds()
): { x: number; y: number } {
  const metrics = getGridMetrics(bounds);
  const preferredClamped = clampGridPosition(preferred.x, preferred.y, bounds);
  if (!isCellOccupied(preferredClamped, occupied, metrics)) {
    return preferredClamped;
  }

  let best: { x: number; y: number } | null = null;
  let bestDist = Infinity;
  for (let row = 0; row < metrics.rows; row++) {
    for (let col = 0; col < metrics.cols; col++) {
      const pos = cellTopLeft(col, row, metrics);
      if (isCellOccupied(pos, occupied, metrics)) continue;
      const dx = pos.x - preferredClamped.x;
      const dy = pos.y - preferredClamped.y;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        best = pos;
      }
    }
  }

  return best ?? findNextAvailablePosition(occupied);
}

/** Positions of root-desktop items, optionally excluding ids (e.g. the drag group) */
export function getDesktopSurfacePositions(
  excludeIds: Iterable<string> = []
): Array<{ x: number; y: number }> {
  const exclude = new Set(excludeIds);
  const inFolders = getIdsInsideFolders();
  const positions: Array<{ x: number; y: number }> = [];

  getDesktopShortcuts().forEach((s) => {
    if (exclude.has(s.id) || inFolders.has(s.id)) return;
    positions.push({ x: s.x, y: s.y });
  });
  getDesktopFolders().forEach((f) => {
    if (exclude.has(f.id) || !isRootDesktopFolder(f)) return;
    positions.push({ x: f.x, y: f.y });
  });
  getDesktopSurfaceMedia().forEach((m) => {
    if (exclude.has(m.id)) return;
    positions.push({ x: m.x, y: m.y });
  });

  return positions;
}

/**
 * Place a dragged group: keep relative layout when free; otherwise nearest empty cell.
 * Primary aims at `primaryFinal`; companions aim at origin + same delta.
 */
export function computeGroupDropPositions(
  dragIds: string[],
  origins: Record<string, { x: number; y: number }>,
  primaryId: string,
  primaryFinal: { x: number; y: number },
  bounds: { width: number; height: number } = getDesktopBounds()
): Record<string, { x: number; y: number }> {
  const claimed = getDesktopSurfacePositions(dragIds);
  const result: Record<string, { x: number; y: number }> = {};
  const primaryOrigin = origins[primaryId] ?? primaryFinal;
  const dx = primaryFinal.x - primaryOrigin.x;
  const dy = primaryFinal.y - primaryOrigin.y;

  const primaryPos = findNearestAvailablePosition(primaryFinal, claimed, bounds);
  result[primaryId] = primaryPos;
  claimed.push(primaryPos);

  for (const id of dragIds) {
    if (id === primaryId) continue;
    const origin = origins[id] ?? primaryOrigin;
    const preferred = {
      x: origin.x + dx,
      y: origin.y + dy,
    };
    const pos = findNearestAvailablePosition(preferred, claimed, bounds);
    result[id] = pos;
    claimed.push(pos);
  }

  return result;
}

/**
 * Relayout desktop icons for the current viewport while keeping each icon's cell
 * (col/row). Cell size stretches; occupied cells are not dropped on shrink.
 */
export function clampAllIconsToDesktop(): void {
  const bounds = getDesktopBounds();
  const preferred = getGridSize();
  const indexMetrics = lastAppliedMetrics ?? {
    preferred,
    cols: 1,
    rows: 1,
    cellWidth: preferred,
    cellHeight: preferred,
  };

  const shortcuts = getDesktopShortcuts();
  const folders = getDesktopFolders();
  const inFolders = getIdsInsideFolders();

  type Placement = { kind: 'shortcut' | 'folder'; id: string; col: number; row: number };
  const placements: Placement[] = [];
  let maxCol = -1;
  let maxRow = -1;

  shortcuts.forEach((shortcut) => {
    if (inFolders.has(shortcut.id)) return;
    const { col, row } = positionToCell(shortcut.x, shortcut.y, indexMetrics);
    placements.push({ kind: 'shortcut', id: shortcut.id, col, row });
    maxCol = Math.max(maxCol, col);
    maxRow = Math.max(maxRow, row);
  });

  folders.forEach((folder) => {
    if (!isRootDesktopFolder(folder)) return;
    const { col, row } = positionToCell(folder.x, folder.y, indexMetrics);
    placements.push({ kind: 'folder', id: folder.id, col, row });
    maxCol = Math.max(maxCol, col);
    maxRow = Math.max(maxRow, row);
  });

  const baseCols = Math.max(1, Math.floor(bounds.width / preferred));
  const baseRows = Math.max(1, Math.floor(bounds.height / preferred));
  const metrics: GridMetrics = {
    preferred,
    cols: Math.max(baseCols, maxCol + 1),
    rows: Math.max(baseRows, maxRow + 1),
    cellWidth: bounds.width / Math.max(baseCols, maxCol + 1),
    cellHeight: bounds.height / Math.max(baseRows, maxRow + 1),
  };

  let changed = false;
  placements.forEach(({ kind, id, col, row }) => {
    const pos = cellTopLeft(col, row, metrics);
    if (kind === 'shortcut') {
      const shortcut = shortcuts.find((s) => s.id === id);
      if (shortcut && (shortcut.x !== pos.x || shortcut.y !== pos.y)) {
        shortcut.x = pos.x;
        shortcut.y = pos.y;
        changed = true;
      }
    } else {
      const folder = folders.find((f) => f.id === id);
      if (folder && (folder.x !== pos.x || folder.y !== pos.y)) {
        folder.x = pos.x;
        folder.y = pos.y;
        changed = true;
      }
    }
  });

  rememberGridMetrics(metrics);

  if (!changed) return;

  systemStorage.setItem(STORAGE_KEY, shortcuts);
  systemStorage.setItem(FOLDERS_STORAGE_KEY, folders);
  window.dispatchEvent(new CustomEvent('desktop-shortcuts-updated'));
}

/**
 * Realign all desktop icons to the current grid size
 * This snaps all icons to the nearest grid position based on current gridSize
 * Resolves collisions by moving overlapping icons to available positions
 */
export function realignIconsToGrid(): void {
  const shortcuts = getDesktopShortcuts();
  const folders = getDesktopFolders();
  const allItems: Array<{ id: string; x: number; y: number; type: 'shortcut' | 'folder' }> = [];
  const metrics = getGridMetrics();
  let hasChanges = false;

  // Collect all items with their current positions
  shortcuts.forEach((shortcut) => {
    allItems.push({ id: shortcut.id, x: shortcut.x, y: shortcut.y, type: 'shortcut' });
  });
  folders.forEach((folder) => {
    allItems.push({ id: folder.id, x: folder.x, y: folder.y, type: 'folder' });
  });

  // Track occupied grid positions
  const occupiedPositions = new Map<string, string>(); // key: "col,row", value: itemId

  // First pass: align all items to grid and detect collisions
  const collisions: Array<{ item: (typeof allItems)[0]; gridPos: { x: number; y: number } }> = [];

  allItems.forEach((item) => {
    const gridPos = pixelToGrid(item.x, item.y);
    const col = Math.round(gridPos.x / metrics.cellWidth);
    const row = Math.round(gridPos.y / metrics.cellHeight);
    const posKey = `${col},${row}`;

    if (occupiedPositions.has(posKey)) {
      // Collision detected - this item needs a new position
      collisions.push({ item, gridPos });
    } else {
      // No collision - assign this position
      occupiedPositions.set(posKey, item.id);

      // Update the item's position if it changed
      if (item.x !== gridPos.x || item.y !== gridPos.y) {
        if (item.type === 'shortcut') {
          const shortcut = shortcuts.find((s) => s.id === item.id);
          if (shortcut) {
            shortcut.x = gridPos.x;
            shortcut.y = gridPos.y;
            hasChanges = true;
          }
        } else {
          const folder = folders.find((f) => f.id === item.id);
          if (folder) {
            folder.x = gridPos.x;
            folder.y = gridPos.y;
            hasChanges = true;
          }
        }
      }
    }
  });

  // Second pass: resolve collisions by finding available positions
  if (collisions.length > 0) {
    collisions.forEach(({ item, gridPos }) => {
      // Try to find an available position near the original position
      let found = false;
      const startCol = Math.round(gridPos.x / metrics.cellWidth);
      const startRow = Math.round(gridPos.y / metrics.cellHeight);

      // Search in a spiral pattern starting from the original grid position
      for (let radius = 1; radius <= Math.max(metrics.cols, metrics.rows) && !found; radius++) {
        for (let dx = -radius; dx <= radius && !found; dx++) {
          for (let dy = -radius; dy <= radius && !found; dy++) {
            // Only check positions at the current radius
            if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;

            const col = startCol + dx;
            const row = startRow + dy;
            if (col < 0 || row < 0 || col >= metrics.cols || row >= metrics.rows) {
              continue;
            }

            const pos = cellTopLeft(col, row, metrics);
            const posKey = `${col},${row}`;
            if (!occupiedPositions.has(posKey)) {
              occupiedPositions.set(posKey, item.id);

              if (item.type === 'shortcut') {
                const shortcut = shortcuts.find((s) => s.id === item.id);
                if (shortcut) {
                  shortcut.x = pos.x;
                  shortcut.y = pos.y;
                  hasChanges = true;
                }
              } else {
                const folder = folders.find((f) => f.id === item.id);
                if (folder) {
                  folder.x = pos.x;
                  folder.y = pos.y;
                  hasChanges = true;
                }
              }

              found = true;
            }
          }
        }
      }

      // If no position found in spiral search, use findNextAvailablePosition as fallback
      if (!found) {
        const allCurrentPositions = Array.from(occupiedPositions.keys()).map((key) => {
          const [col, row] = key.split(',').map(Number);
          return cellTopLeft(col, row, metrics);
        });
        const availablePos = findNextAvailablePosition(allCurrentPositions);
        const col = Math.round(availablePos.x / metrics.cellWidth);
        const row = Math.round(availablePos.y / metrics.cellHeight);
        occupiedPositions.set(`${col},${row}`, item.id);

        if (item.type === 'shortcut') {
          const shortcut = shortcuts.find((s) => s.id === item.id);
          if (shortcut) {
            shortcut.x = availablePos.x;
            shortcut.y = availablePos.y;
            hasChanges = true;
          }
        } else {
          const folder = folders.find((f) => f.id === item.id);
          if (folder) {
            folder.x = availablePos.x;
            folder.y = availablePos.y;
            hasChanges = true;
          }
        }
      }
    });
  }

  if (hasChanges) {
    // Save updated positions
    systemStorage.setItem(STORAGE_KEY, shortcuts);
    systemStorage.setItem(FOLDERS_STORAGE_KEY, folders);
    rememberGridMetrics();

    // Dispatch event to notify DesktopIcons to refresh
    window.dispatchEvent(new CustomEvent('desktop-shortcuts-updated'));
  } else {
    rememberGridMetrics();
  }
}

/**
 * Auto arrange all desktop icons in a grid pattern
 * Arranges icons from left to right, top to bottom
 */
export function autoArrangeIcons(): void {
  const shortcuts = getDesktopShortcuts();
  const folders = getDesktopFolders();
  const allItems = [...shortcuts, ...folders];

  if (allItems.length === 0) return;

  const metrics = getGridMetrics();
  let currentCol = 0;
  let currentRow = 0;

  // Sort items by their current position (top to bottom, left to right)
  // This preserves some order preference
  const sortedItems = [...allItems].sort((a, b) => {
    if (Math.abs(a.y - b.y) < metrics.cellHeight * GRID_OCCUPANCY_RATIO) {
      // Same row, sort by x
      return a.x - b.x;
    }
    return a.y - b.y;
  });

  // Arrange each item in grid order
  sortedItems.forEach((item) => {
    const pos = cellTopLeft(currentCol, currentRow, metrics);
    item.x = pos.x;
    item.y = pos.y;

    currentCol++;
    if (currentCol >= metrics.cols) {
      currentCol = 0;
      currentRow++;
    }
  });

  // Save updated positions
  systemStorage.setItem(STORAGE_KEY, shortcuts);
  systemStorage.setItem(FOLDERS_STORAGE_KEY, folders);
  rememberGridMetrics();

  // Dispatch event to notify DesktopIcons to refresh
  window.dispatchEvent(new CustomEvent('desktop-shortcuts-updated'));
}

/**
 * Organize desktop icons by name
 */
export async function organizeIconsByName(): Promise<void> {
  const shortcuts = getDesktopShortcuts();
  const folders = getDesktopFolders();

  // Filter to only root level items (not inside folders)
  const rootFolders = folders.filter((f) => !f.parentPath || f.parentPath === '/Desktop');
  const itemsInFolders = new Set<string>();
  folders.forEach((folder) => {
    folder.contents.forEach((itemId) => {
      itemsInFolders.add(itemId);
    });
  });
  const rootShortcuts = shortcuts.filter((s) => !itemsInFolders.has(s.id));

  if (rootShortcuts.length === 0 && rootFolders.length === 0) return;

  const metrics = getGridMetrics();
  let currentCol = 0;
  let currentRow = 0;

  // Get program names for shortcuts - import dynamically to avoid circular dependency
  const { programs } = await import('virtual:programs');

  // Create array of items with their names for sorting
  const itemsWithNames: Array<{ item: DesktopItem; name: string }> = [];

  rootShortcuts.forEach((shortcut) => {
    const program = programs[shortcut.programId];
    const name = shortcut.customName || program?.metadata?.name || shortcut.programId;
    itemsWithNames.push({ item: shortcut, name: name.toLowerCase() });
  });

  rootFolders.forEach((folder) => {
    itemsWithNames.push({ item: folder, name: folder.name.toLowerCase() });
  });

  // Sort by name
  itemsWithNames.sort((a, b) => {
    if (a.name < b.name) return -1;
    if (a.name > b.name) return 1;
    return 0;
  });

  // Arrange each item in grid order
  itemsWithNames.forEach(({ item }) => {
    const pos = cellTopLeft(currentCol, currentRow, metrics);
    item.x = pos.x;
    item.y = pos.y;

    currentCol++;
    if (currentCol >= metrics.cols) {
      currentCol = 0;
      currentRow++;
    }
  });

  // Save updated positions
  systemStorage.setItem(STORAGE_KEY, shortcuts);
  systemStorage.setItem(FOLDERS_STORAGE_KEY, folders);
  rememberGridMetrics();

  // Dispatch event to notify DesktopIcons to refresh
  window.dispatchEvent(new CustomEvent('desktop-shortcuts-updated'));
}

/**
 * Organize desktop icons by date created
 */
export function organizeIconsByDate(): void {
  const shortcuts = getDesktopShortcuts();
  const folders = getDesktopFolders();

  // Filter to only root level items (not inside folders)
  const rootFolders = folders.filter((f) => !f.parentPath || f.parentPath === '/Desktop');
  const itemsInFolders = new Set<string>();
  folders.forEach((folder) => {
    folder.contents.forEach((itemId) => {
      itemsInFolders.add(itemId);
    });
  });
  const rootShortcuts = shortcuts.filter((s) => !itemsInFolders.has(s.id));

  if (rootShortcuts.length === 0 && rootFolders.length === 0) return;

  const metrics = getGridMetrics();
  let currentCol = 0;
  let currentRow = 0;

  // Create array of items with their creation dates for sorting
  const itemsWithDates: Array<{ item: DesktopItem; date: number }> = [];

  rootShortcuts.forEach((shortcut) => {
    // Shortcuts don't have createdAt, use a default or extract from ID timestamp if available
    // For now, use 0 to put them at the end, or we could extract timestamp from ID
    const timestamp = shortcut.id.includes('-')
      ? parseInt(shortcut.id.split('-').pop() || '0', 10)
      : 0;
    itemsWithDates.push({ item: shortcut, date: timestamp || 0 });
  });

  rootFolders.forEach((folder) => {
    itemsWithDates.push({ item: folder, date: folder.createdAt || 0 });
  });

  // Sort by date (oldest first)
  itemsWithDates.sort((a, b) => a.date - b.date);

  // Arrange each item in grid order
  itemsWithDates.forEach(({ item }) => {
    const pos = cellTopLeft(currentCol, currentRow, metrics);
    item.x = pos.x;
    item.y = pos.y;

    currentCol++;
    if (currentCol >= metrics.cols) {
      currentCol = 0;
      currentRow++;
    }
  });

  // Save updated positions
  systemStorage.setItem(STORAGE_KEY, shortcuts);
  systemStorage.setItem(FOLDERS_STORAGE_KEY, folders);
  rememberGridMetrics();

  // Dispatch event to notify DesktopIcons to refresh
  window.dispatchEvent(new CustomEvent('desktop-shortcuts-updated'));
}

/**
 * Get all desktop folders
 */
export function getDesktopFolders(): DesktopFolder[] {
  const folders = systemStorage.getItem<DesktopFolder[]>(FOLDERS_STORAGE_KEY);
  return folders || [];
}

/**
 * Get folder paths mapping (folderId -> path)
 */
function getFolderPaths(): Record<string, string> {
  return systemStorage.getItem<Record<string, string>>(FOLDER_PATHS_STORAGE_KEY) || {};
}

/**
 * Set folder paths mapping
 */
function setFolderPaths(paths: Record<string, string>): void {
  systemStorage.setItem(FOLDER_PATHS_STORAGE_KEY, paths);
}

/**
 * Generate a unique folder name by appending (1), (2), (3), etc. if needed
 */
function generateUniqueFolderName(baseName: string, parentPath: string): string {
  const folders = getDesktopFolders();
  const targetParentPath = parentPath || '/Desktop';

  // Get all folders in the same parent directory
  const siblingFolders = folders.filter((f) => (f.parentPath || '/Desktop') === targetParentPath);

  // Check if base name is available
  const nameExists = siblingFolders.some((f) => f.name === baseName);
  if (!nameExists) {
    return baseName;
  }

  // Find the next available number
  let number = 1;
  let uniqueName = `${baseName} (${number})`;

  while (siblingFolders.some((f) => f.name === uniqueName)) {
    number++;
    uniqueName = `${baseName} (${number})`;
  }

  return uniqueName;
}

/**
 * Create a new desktop folder
 */
export function createDesktopFolder(
  name: string,
  x?: number,
  y?: number,
  parentPath?: string
): DesktopFolder {
  const folders = getDesktopFolders();
  const paths = getFolderPaths();

  // Find next available position if not provided (desktop surface only)
  if (x === undefined || y === undefined) {
    const shortcuts = getDesktopShortcuts();
    const inFolders = getIdsInsideFolders();
    const rootItems = [
      ...shortcuts.filter((s) => !inFolders.has(s.id)),
      ...folders.filter(isRootDesktopFolder),
      ...getDesktopSurfaceMedia(),
    ];
    const position = findNextAvailablePosition(rootItems.map((item) => ({ x: item.x, y: item.y })));
    x = position.x;
    y = position.y;
  } else {
    const clamped = clampGridPosition(x, y);
    x = clamped.x;
    y = clamped.y;
  }

  // Generate unique folder name
  const targetParentPath = parentPath || '/Desktop';
  const uniqueName = generateUniqueFolderName(name, targetParentPath);

  const folderId = `folder-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const path =
    targetParentPath !== '/Desktop'
      ? `${targetParentPath}/${uniqueName}`
      : `/Desktop/${uniqueName}`;

  const newFolder: DesktopFolder = {
    id: folderId,
    name: uniqueName,
    x,
    y,
    icon: 'folder',
    createdAt: Date.now(),
    contents: [],
    parentPath: targetParentPath,
  };

  folders.push(newFolder);
  paths[folderId] = path;

  // Nest under parent folder contents (path alone is not enough for getItemsByPath)
  if (targetParentPath !== '/Desktop') {
    const parentFolder = folders.find((f) => {
      const parentStoredPath =
        paths[f.id] ||
        (f.parentPath && f.parentPath !== '/Desktop'
          ? `${f.parentPath}/${f.name}`
          : `/Desktop/${f.name}`);
      return parentStoredPath === targetParentPath;
    });
    if (parentFolder && !parentFolder.contents.includes(folderId)) {
      parentFolder.contents.push(folderId);
    }
  }

  systemStorage.setItem(FOLDERS_STORAGE_KEY, folders);
  setFolderPaths(paths);
  rememberGridMetrics();

  window.dispatchEvent(new CustomEvent('desktop-shortcuts-updated'));

  return newFolder;
}

/**
 * Get all desktop items (shortcuts and folders)
 */
export function getDesktopItems(path?: string): DesktopItem[] {
  const shortcuts = getDesktopShortcuts();
  const folders = getDesktopFolders();

  if (!path || path === '/Desktop') {
    const inFolders = getIdsInsideFolders();
    const rootShortcuts = shortcuts.filter((s) => !inFolders.has(s.id));
    const rootFolders = folders.filter((f) => !f.parentPath || f.parentPath === '/Desktop');
    const rootMedia = getDesktopSurfaceMedia();
    return [...rootShortcuts, ...rootFolders, ...rootMedia];
  }

  // For specific paths, we'll need the file-system module
  // This is a placeholder - will be enhanced when file-system is implemented
  return [...shortcuts, ...folders];
}

/**
 * Get folder by ID
 */
export function getFolderById(folderId: string): DesktopFolder | null {
  const folders = getDesktopFolders();
  return folders.find((f) => f.id === folderId) || null;
}

/**
 * Get folder by path
 */
export function getFolderByPath(path: string): DesktopFolder | null {
  if (!path || path === '/Desktop' || path === '/') {
    return null; // Root is not a folder
  }

  // Parse path: /Desktop/Folder1/Folder2 -> ['Desktop', 'Folder1', 'Folder2']
  const parts = path.split('/').filter((p) => p.length > 0);
  if (parts.length === 0 || parts[0] !== 'Desktop') {
    return null;
  }

  const folders = getDesktopFolders();
  let currentFolders = folders.filter((f) => !f.parentPath || f.parentPath === '/Desktop');

  // Traverse path
  for (let i = 1; i < parts.length; i++) {
    const folderName = parts[i];
    const folder = currentFolders.find((f) => f.name === folderName);
    if (!folder) return null;

    // If this is the last part, return this folder
    if (i === parts.length - 1) {
      return folder;
    }

    // Otherwise, get subfolders
    const allFolders = getDesktopFolders();
    currentFolders = folder.contents
      .map((itemId) => allFolders.find((f) => f.id === itemId))
      .filter((f): f is DesktopFolder => f !== undefined);
  }

  return null;
}

/**
 * Get items by path
 */
export function getItemsByPath(path: string): DesktopItem[] {
  if (path === '/Desktop' || path === '/') {
    return getDesktopItems('/Desktop');
  }

  const folder = getFolderByPath(path);
  if (!folder) return [];

  const shortcuts = getDesktopShortcuts();
  const folders = getDesktopFolders();
  const media = getDesktopMedia();

  return folder.contents
    .map((itemId) => {
      const shortcut = shortcuts.find((s) => s.id === itemId);
      if (shortcut) return shortcut;
      const subFolder = folders.find((f) => f.id === itemId);
      if (subFolder) return subFolder;
      const mediaItem = media.find((m) => m.id === itemId);
      return mediaItem || null;
    })
    .filter((item): item is DesktopItem => item !== null);
}

/**
 * True if `searchId` is nested under `folderId` at any depth.
 */
export function folderContainsItem(folderId: string, searchId: string): boolean {
  const folders = getDesktopFolders();
  const visit = (id: string): boolean => {
    const folder = folders.find((f) => f.id === id);
    if (!folder) return false;
    for (const childId of folder.contents) {
      if (childId === searchId) return true;
      if (visit(childId)) return true;
    }
    return false;
  };
  return visit(folderId);
}

/**
 * Add an item to a folder
 */
export function addItemToFolder(folderId: string, itemId: string): void {
  const folders = getDesktopFolders();
  const paths = getFolderPaths();
  const folder = folders.find((f) => f.id === folderId);
  if (!folder) return;

  // Prevent adding item to itself
  if (folder.id === itemId) return;

  // Prevent adding item if it's already in the folder
  if (folder.contents.includes(itemId)) return;

  // Reject moving a folder into one of its own descendants (cycle).
  const itemFolder = folders.find((f) => f.id === itemId);
  if (itemFolder && folderContainsItem(itemId, folderId)) return;

  // Remove item from its current parent if it's a folder
  folders.forEach((f) => {
    if (f.id !== folderId && f.contents.includes(itemId)) {
      f.contents = f.contents.filter((id) => id !== itemId);
    }
  });

  folder.contents.push(itemId);

  // If the item being added is a folder, update its parentPath
  if (itemFolder) {
    // Calculate the new parent path
    const folderPath =
      paths[folderId] ||
      (folder.parentPath ? `${folder.parentPath}/${folder.name}` : `/Desktop/${folder.name}`);
    itemFolder.parentPath = folderPath;

    // Update the path mapping for the moved folder
    const newPath = `${folderPath}/${itemFolder.name}`;
    paths[itemId] = newPath;
  }

  // Media moved into a folder leaves the library / desktop surface / special locations.
  const media = getDesktopMedia();
  const mediaItem = media.find((m) => m.id === itemId);
  if (mediaItem) {
    mediaItem.home = '/Desktop';
    saveDesktopMedia(media);
  }

  removeItemFromAllSpecialLocations(itemId);

  systemStorage.setItem(FOLDERS_STORAGE_KEY, folders);
  setFolderPaths(paths);

  window.dispatchEvent(new CustomEvent('desktop-shortcuts-updated'));
}

/**
 * Remove an item from a folder
 */
export function removeItemFromFolder(folderId: string, itemId: string): void {
  const folders = getDesktopFolders();
  const paths = getFolderPaths();
  const folder = folders.find((f) => f.id === folderId);
  if (!folder) return;

  folder.contents = folder.contents.filter((id) => id !== itemId);

  // If the item being removed is a folder, update its parentPath to root
  const itemFolder = folders.find((f) => f.id === itemId);
  if (itemFolder) {
    itemFolder.parentPath = '/Desktop';
    // Update path mapping
    const newPath = `/Desktop/${itemFolder.name}`;
    paths[itemId] = newPath;
  }

  // Media removed from a folder lands on the desktop surface.
  const media = getDesktopMedia();
  const mediaItem = media.find((m) => m.id === itemId);
  if (mediaItem) {
    mediaItem.home = '/Desktop';
    saveDesktopMedia(media);
  }

  systemStorage.setItem(FOLDERS_STORAGE_KEY, folders);
  setFolderPaths(paths);

  window.dispatchEvent(new CustomEvent('desktop-shortcuts-updated'));
}

/**
 * Delete a desktop folder
 */
export function deleteDesktopFolder(folderId: string): void {
  const folders = getDesktopFolders();
  const paths = getFolderPaths();

  // Remove folder and all its contents recursively
  const removeFolderRecursive = (id: string) => {
    const folder = folders.find((f) => f.id === id);
    if (!folder) return;

    // Remove all items in the folder
    folder.contents.forEach((itemId) => {
      // Check if it's a subfolder
      const subFolder = folders.find((f) => f.id === itemId);
      if (subFolder) {
        removeFolderRecursive(itemId);
      }
      // Shortcuts are not deleted, just removed from folder
    });

    // Remove folder from array
    const index = folders.findIndex((f) => f.id === id);
    if (index !== -1) {
      folders.splice(index, 1);
    }

    // Remove path mapping
    delete paths[id];
  };

  removeFolderRecursive(folderId);

  systemStorage.setItem(FOLDERS_STORAGE_KEY, folders);
  setFolderPaths(paths);

  window.dispatchEvent(new CustomEvent('desktop-shortcuts-updated'));
}

/**
 * Rename a desktop folder
 */
export function renameDesktopFolder(folderId: string, newName: string): void {
  const folders = getDesktopFolders();
  const paths = getFolderPaths();
  const folder = folders.find((f) => f.id === folderId);
  if (!folder) return;

  folder.name = newName;

  // Update path if it exists
  if (paths[folderId]) {
    const oldPath = paths[folderId];
    const pathParts = oldPath.split('/');
    pathParts[pathParts.length - 1] = newName;
    paths[folderId] = pathParts.join('/');
  }

  systemStorage.setItem(FOLDERS_STORAGE_KEY, folders);
  setFolderPaths(paths);

  window.dispatchEvent(new CustomEvent('desktop-shortcuts-updated'));
}

/**
 * Rename a desktop shortcut
 */
export function renameDesktopShortcut(shortcutId: string, newName: string): void {
  const shortcuts = getDesktopShortcuts();
  const shortcut = shortcuts.find((s) => s.id === shortcutId);
  if (!shortcut) return;

  shortcut.customName = newName.trim() || undefined;

  systemStorage.setItem(STORAGE_KEY, shortcuts);

  window.dispatchEvent(new CustomEvent('desktop-shortcuts-updated'));
}

/**
 * Update desktop folder position
 */
export function updateFolderPosition(folderId: string, x: number, y: number): void {
  const folders = getDesktopFolders();
  const folder = folders.find((f) => f.id === folderId);
  if (folder) {
    const clamped = clampGridPosition(x, y);
    folder.x = clamped.x;
    folder.y = clamped.y;
    systemStorage.setItem(FOLDERS_STORAGE_KEY, folders);
    rememberGridMetrics();
  }
}

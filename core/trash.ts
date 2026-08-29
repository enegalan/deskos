/**
 * Soft-delete trash: move desktop items out of live storage, restore or purge later.
 */

import { createScopedStorage } from './storage';
import { notifyProgramIconChanged, resolveProgramIcon } from './program-icons';
import { isProtectedShortcutProgram } from './program-registry';
import {
  getDesktopShortcuts,
  getDesktopFolders,
  getDesktopMedia,
  getDesktopFiles,
  findNextAvailablePosition,
  isDesktopFolder,
  isDesktopShortcut,
  isImageItem,
  isVideoItem,
  isAudioItem,
  isMediaItem,
  isFileItem,
  findSpecialLocationOfItem,
  removeItemFromAllSpecialLocations,
  moveItemToSpecialLocation,
  isWritableSpecialPath,
  type DesktopShortcut,
  type DesktopFolder,
  type DesktopItem,
  type DesktopMediaItem,
  type DesktopFileItem,
} from './desktop-shortcuts';

/** System storage key for the trash entry list */
const TRASH_STORAGE_KEY = 'trash-items';
/** Scoped storage for system desktop data */
const systemStorage = createScopedStorage('system');
/** System storage key for live desktop shortcuts */
const SHORTCUTS_STORAGE_KEY = 'desktop-shortcuts';
/** System storage key for live desktop folders */
const FOLDERS_STORAGE_KEY = 'desktop-folders';
/** System storage key for folder id → absolute path map */
const FOLDER_PATHS_STORAGE_KEY = 'folder-paths';
/** System storage key for persisted media files */
const MEDIA_STORAGE_KEY = 'desktop-media';
/** System storage key for user-created text files */
const FILES_STORAGE_KEY = 'desktop-files';

/**
 * Soft-deleted desktop item snapshot stored in the trash list.
 */
export interface TrashEntry {
  /** Unique id of this trash-list entry (not the desktop item id) */
  id: string;
  /** Unix timestamp (ms) when the item was moved to trash */
  deletedAt: number;
  /** Parent folder path at delete time; `null` = desktop root */
  originalParentPath: string | null;
  /** Snapshot of the shortcut or folder at delete time */
  item: DesktopItem;
  /** Nested entries when `item` is a folder (captured at delete time) */
  nested?: TrashEntry[];
}

/** Read the folder id → path map from system storage. */
function getFolderPaths(): Record<string, string> {
  return systemStorage.getItem<Record<string, string>>(FOLDER_PATHS_STORAGE_KEY) || {};
}

/** Persist the folder id → path map. */
function setFolderPaths(paths: Record<string, string>): void {
  systemStorage.setItem(FOLDER_PATHS_STORAGE_KEY, paths);
}

/** Persist the live desktop shortcuts array. */
function saveShortcuts(shortcuts: DesktopShortcut[]): void {
  systemStorage.setItem(SHORTCUTS_STORAGE_KEY, shortcuts);
}

/** Persist the live desktop folders array. */
function saveFolders(folders: DesktopFolder[]): void {
  systemStorage.setItem(FOLDERS_STORAGE_KEY, folders);
}

/** Persist the live media file array. */
function saveMedia(media: DesktopMediaItem[]): void {
  systemStorage.setItem(MEDIA_STORAGE_KEY, media);
}

/** Persist the live user-created file array. */
function saveFiles(files: DesktopFileItem[]): void {
  systemStorage.setItem(FILES_STORAGE_KEY, files);
}

/** Notify UI that trash and/or desktop contents changed. */
function notifyTrashUpdated(): void {
  window.dispatchEvent(new CustomEvent('trash-updated'));
  window.dispatchEvent(new CustomEvent('desktop-shortcuts-updated'));
  notifyProgramIconChanged('trash');
}

/** Generate a unique trash-list entry id. */
function newTrashId(): string {
  return `trash-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Read all trash entries (newest first).
 */
export function getTrashItems(): TrashEntry[] {
  const items = systemStorage.getItem<TrashEntry[]>(TRASH_STORAGE_KEY);
  if (!items || items.length === 0) return [];
  return [...items].sort((a, b) => b.deletedAt - a.deletedAt);
}

/** Write the full trash entry list to storage. */
function setTrashItems(items: TrashEntry[]): void {
  systemStorage.setItem(TRASH_STORAGE_KEY, items);
}

/**
 * Whether the trash has no top-level entries.
 */
export function isTrashEmpty(): boolean {
  const items = systemStorage.getItem<TrashEntry[]>(TRASH_STORAGE_KEY);
  return !items || items.length === 0;
}

/**
 * Resolve a folder's absolute path from the paths map or parentPath/name.
 */
function folderPathOf(folder: DesktopFolder, paths: Record<string, string>): string {
  return (
    paths[folder.id] ||
    (folder.parentPath && folder.parentPath !== '/Desktop'
      ? `${folder.parentPath}/${folder.name}`
      : `/Desktop/${folder.name}`)
  );
}

/**
 * Parent path containing `itemId`, or `null` if on the desktop root.
 */
function findOriginalParentPath(
  itemId: string,
  folders: DesktopFolder[],
  paths: Record<string, string>
): string | null {
  for (const folder of folders) {
    if (folder.contents.includes(itemId)) {
      return folderPathOf(folder, paths);
    }
  }
  return findSpecialLocationOfItem(itemId);
}

/** True if the desktop shortcut must not be soft-deleted (program flag). */
function isProtectedProgramShortcut(item: DesktopItem): boolean {
  return isDesktopShortcut(item) && isProtectedShortcutProgram(item.programId);
}

/**
 * Snapshot a folder and its contents into a trash entry tree; mutate live arrays.
 */
function captureFolderTree(
  folderId: string,
  shortcuts: DesktopShortcut[],
  folders: DesktopFolder[],
  media: DesktopMediaItem[],
  files: DesktopFileItem[],
  paths: Record<string, string>,
  deletedAt: number
): TrashEntry | null {
  const folder = folders.find((f) => f.id === folderId);
  if (!folder) return null;

  const nested: TrashEntry[] = [];
  for (const childId of [...folder.contents]) {
    const subFolder = folders.find((f) => f.id === childId);
    if (subFolder) {
      const childEntry = captureFolderTree(
        childId,
        shortcuts,
        folders,
        media,
        files,
        paths,
        deletedAt
      );
      if (childEntry) nested.push(childEntry);
      continue;
    }
    const shortcutIndex = shortcuts.findIndex((s) => s.id === childId);
    if (shortcutIndex !== -1) {
      const shortcut = shortcuts[shortcutIndex];
      if (!isProtectedProgramShortcut(shortcut)) {
        nested.push({
          id: newTrashId(),
          deletedAt,
          originalParentPath: folderPathOf(folder, paths),
          item: { ...shortcut },
        });
      }
      shortcuts.splice(shortcutIndex, 1);
      continue;
    }
    const mediaIndex = media.findIndex((m) => m.id === childId);
    if (mediaIndex !== -1) {
      nested.push({
        id: newTrashId(),
        deletedAt,
        originalParentPath: folderPathOf(folder, paths),
        item: { ...media[mediaIndex] },
      });
      media.splice(mediaIndex, 1);
      continue;
    }
    const fileIndex = files.findIndex((f) => f.id === childId);
    if (fileIndex !== -1) {
      nested.push({
        id: newTrashId(),
        deletedAt,
        originalParentPath: folderPathOf(folder, paths),
        item: { ...files[fileIndex] },
      });
      files.splice(fileIndex, 1);
    }
  }

  const parentPath = findOriginalParentPath(folderId, folders, paths);
  const snapshot: DesktopFolder = {
    ...folder,
    contents: nested.map((entry) => entry.item.id),
  };

  // Remove this folder from any parent contents
  for (const parent of folders) {
    if (parent.contents.includes(folderId)) {
      parent.contents = parent.contents.filter((id) => id !== folderId);
    }
  }
  removeItemFromAllSpecialLocations(folderId);

  const index = folders.findIndex((f) => f.id === folderId);
  if (index !== -1) {
    folders.splice(index, 1);
  }
  delete paths[folderId];

  return {
    id: newTrashId(),
    deletedAt,
    originalParentPath: parentPath,
    item: snapshot,
    nested,
  };
}

/**
 * Snapshot a shortcut and remove it from live storage arrays.
 */
function captureShortcut(
  shortcutId: string,
  shortcuts: DesktopShortcut[],
  folders: DesktopFolder[],
  paths: Record<string, string>,
  deletedAt: number
): TrashEntry | null {
  const index = shortcuts.findIndex((s) => s.id === shortcutId);
  if (index === -1) return null;

  const shortcut = shortcuts[index];
  if (isProtectedProgramShortcut(shortcut)) {
    // Trash desktop shortcut: permanent remove, never soft-delete into trash list
    for (const folder of folders) {
      if (folder.contents.includes(shortcutId)) {
        folder.contents = folder.contents.filter((id) => id !== shortcutId);
      }
    }
    shortcuts.splice(index, 1);
    return null;
  }

  const parentPath = findOriginalParentPath(shortcutId, folders, paths);

  for (const folder of folders) {
    if (folder.contents.includes(shortcutId)) {
      folder.contents = folder.contents.filter((id) => id !== shortcutId);
    }
  }

  removeItemFromAllSpecialLocations(shortcutId);

  shortcuts.splice(index, 1);

  return {
    id: newTrashId(),
    deletedAt,
    originalParentPath: parentPath,
    item: { ...shortcut },
  };
}

/**
 * Snapshot a media file and remove it from live storage arrays.
 */
function captureMediaItem(
  mediaId: string,
  media: DesktopMediaItem[],
  folders: DesktopFolder[],
  paths: Record<string, string>,
  deletedAt: number
): TrashEntry | null {
  const index = media.findIndex((m) => m.id === mediaId);
  if (index === -1) return null;

  const item = media[index];
  const parentPath = findOriginalParentPath(mediaId, folders, paths);

  for (const folder of folders) {
    if (folder.contents.includes(mediaId)) {
      folder.contents = folder.contents.filter((id) => id !== mediaId);
    }
  }

  removeItemFromAllSpecialLocations(mediaId);

  media.splice(index, 1);

  return {
    id: newTrashId(),
    deletedAt,
    originalParentPath: parentPath ?? (item.home === '/Desktop' ? null : item.home),
    item: { ...item },
  };
}

/**
 * Snapshot a user file and remove it from live storage arrays.
 */
function captureFileItem(
  fileId: string,
  files: DesktopFileItem[],
  folders: DesktopFolder[],
  paths: Record<string, string>,
  deletedAt: number
): TrashEntry | null {
  const index = files.findIndex((f) => f.id === fileId);
  if (index === -1) return null;

  const item = files[index];
  const parentPath = findOriginalParentPath(fileId, folders, paths);

  for (const folder of folders) {
    if (folder.contents.includes(fileId)) {
      folder.contents = folder.contents.filter((id) => id !== fileId);
    }
  }

  removeItemFromAllSpecialLocations(fileId);

  files.splice(index, 1);

  return {
    id: newTrashId(),
    deletedAt,
    originalParentPath: parentPath ?? (item.home === '/Desktop' ? null : item.home),
    item: { ...item },
  };
}

/**
 * Move desktop items into the trash (soft-delete).
 *
 * @param itemIds - Shortcut, folder, media, or file ids to move
 */
export function moveToTrash(itemIds: string[]): void {
  const uniqueIds = [...new Set(itemIds)];
  if (uniqueIds.length === 0) return;

  const shortcuts = getDesktopShortcuts();
  const folders = getDesktopFolders();
  const media = getDesktopMedia();
  const files = getDesktopFiles();
  const paths = getFolderPaths();
  const trash = getTrashItems();
  const deletedAt = Date.now();

  const folderIds = uniqueIds.filter((id) => folders.some((f) => f.id === id));
  const remainingIds = uniqueIds.filter((id) => !folderIds.includes(id));

  for (const folderId of folderIds) {
    // Skip if already removed as nested content of another selected folder
    if (!folders.some((f) => f.id === folderId)) continue;
    const entry = captureFolderTree(folderId, shortcuts, folders, media, files, paths, deletedAt);
    if (entry) trash.unshift(entry);
  }

  for (const itemId of remainingIds) {
    if (shortcuts.some((s) => s.id === itemId)) {
      const entry = captureShortcut(itemId, shortcuts, folders, paths, deletedAt);
      if (entry) trash.unshift(entry);
    } else if (media.some((m) => m.id === itemId)) {
      const entry = captureMediaItem(itemId, media, folders, paths, deletedAt);
      if (entry) trash.unshift(entry);
    } else if (files.some((f) => f.id === itemId)) {
      const entry = captureFileItem(itemId, files, folders, paths, deletedAt);
      if (entry) trash.unshift(entry);
    }
  }

  saveShortcuts(shortcuts);
  saveFolders(folders);
  saveMedia(media);
  saveFiles(files);
  setFolderPaths(paths);
  setTrashItems(trash);
  notifyTrashUpdated();
}

/**
 * Pick a unique folder name among siblings under `parentPath` (adds ` (n)` if needed).
 */
function uniqueFolderName(baseName: string, parentPath: string, folders: DesktopFolder[]): string {
  const targetParentPath = parentPath || '/Desktop';
  const siblings = folders.filter((f) => (f.parentPath || '/Desktop') === targetParentPath);
  if (!siblings.some((f) => f.name === baseName)) return baseName;

  let number = 1;
  let uniqueName = `${baseName} (${number})`;
  while (siblings.some((f) => f.name === uniqueName)) {
    number++;
    uniqueName = `${baseName} (${number})`;
  }
  return uniqueName;
}

/**
 * Grid positions of items on the desktop root (not inside any folder).
 */
function desktopRootOccupied(
  shortcuts: DesktopShortcut[],
  folders: DesktopFolder[],
  media: DesktopMediaItem[] = [],
  files: DesktopFileItem[] = []
): Array<{ x: number; y: number }> {
  const inFolders = new Set<string>();
  folders.forEach((folder) => {
    folder.contents.forEach((id) => inFolders.add(id));
  });
  return [
    ...shortcuts.filter((s) => !inFolders.has(s.id)).map((s) => ({ x: s.x, y: s.y })),
    ...folders
      .filter((f) => !f.parentPath || f.parentPath === '/Desktop')
      .map((f) => ({ x: f.x, y: f.y })),
    ...media
      .filter((m) => !inFolders.has(m.id) && m.home === '/Desktop')
      .map((m) => ({ x: m.x, y: m.y })),
    ...files
      .filter((f) => !inFolders.has(f.id) && f.home === '/Desktop')
      .map((f) => ({ x: f.x, y: f.y })),
  ];
}

/**
 * Find a folder by absolute path using in-memory arrays (during restore).
 */
function findFolderByPathInMemory(
  path: string,
  folders: DesktopFolder[],
  paths: Record<string, string>
): DesktopFolder | null {
  if (!path || path === '/Desktop' || path === '/') return null;
  const byPaths = folders.find((f) => paths[f.id] === path);
  if (byPaths) return byPaths;
  return folders.find((f) => folderPathOf(f, paths) === path) || null;
}

/**
 * Restore a folder entry (and nested children) into live storage.
 */
function restoreFolderEntry(
  entry: TrashEntry,
  parentPath: string | null,
  shortcuts: DesktopShortcut[],
  folders: DesktopFolder[],
  media: DesktopMediaItem[],
  files: DesktopFileItem[],
  paths: Record<string, string>
): void {
  if (!isDesktopFolder(entry.item)) return;
  if (folders.some((f) => f.id === entry.item.id)) return;

  const targetParent = parentPath && parentPath !== '/Desktop' ? parentPath : '/Desktop';
  const name = uniqueFolderName(entry.item.name, targetParent, folders);
  let x = entry.item.x;
  let y = entry.item.y;

  if (targetParent === '/Desktop') {
    const occupied = desktopRootOccupied(shortcuts, folders, media, files);
    const conflict = occupied.some((pos) => Math.abs(pos.x - x) < 1 && Math.abs(pos.y - y) < 1);
    if (conflict) {
      const next = findNextAvailablePosition(occupied);
      x = next.x;
      y = next.y;
    }
  }

  const folder: DesktopFolder = {
    ...entry.item,
    name,
    x,
    y,
    parentPath: targetParent,
    contents: [],
  };

  folders.push(folder);
  const path = targetParent !== '/Desktop' ? `${targetParent}/${name}` : `/Desktop/${name}`;
  paths[folder.id] = path;

  if (targetParent !== '/Desktop') {
    const liveParent = findFolderByPathInMemory(targetParent, folders, paths);
    if (liveParent && !liveParent.contents.includes(folder.id)) {
      liveParent.contents.push(folder.id);
    }
  }

  for (const child of entry.nested || []) {
    if (isDesktopFolder(child.item)) {
      restoreFolderEntry(child, path, shortcuts, folders, media, files, paths);
    } else if (isDesktopShortcut(child.item)) {
      restoreShortcutEntry(child, path, shortcuts, folders, media, files, paths);
    } else if (isMediaItem(child.item)) {
      restoreMediaEntry(child, path, shortcuts, folders, media, files, paths);
    } else if (isFileItem(child.item)) {
      restoreFileEntry(child, path, shortcuts, folders, media, files, paths);
    }
  }
}

/**
 * Restore a shortcut entry into live storage.
 */
function restoreShortcutEntry(
  entry: TrashEntry,
  parentPath: string | null,
  shortcuts: DesktopShortcut[],
  folders: DesktopFolder[],
  media: DesktopMediaItem[],
  files: DesktopFileItem[],
  paths: Record<string, string>
): void {
  if (!isDesktopShortcut(entry.item)) return;

  // Already restored / still present
  if (shortcuts.some((s) => s.id === entry.item.id)) return;

  const isSpecial = parentPath !== null && isWritableSpecialPath(parentPath);
  const targetParent = parentPath && parentPath !== '/Desktop' && !isSpecial ? parentPath : null;
  let x = entry.item.x;
  let y = entry.item.y;

  if (!targetParent && !isSpecial) {
    const occupied = desktopRootOccupied(shortcuts, folders, media, files);
    const conflict = occupied.some((pos) => Math.abs(pos.x - x) < 1 && Math.abs(pos.y - y) < 1);
    if (conflict) {
      const next = findNextAvailablePosition(occupied);
      x = next.x;
      y = next.y;
    }
  }

  const shortcut: DesktopShortcut = {
    ...entry.item,
    x,
    y,
  };
  shortcuts.push(shortcut);

  if (isSpecial && parentPath) {
    saveShortcuts(shortcuts);
    moveItemToSpecialLocation(parentPath, shortcut.id);
    const live = getDesktopShortcuts();
    shortcuts.length = 0;
    live.forEach((s) => shortcuts.push(s));
    return;
  }

  if (targetParent) {
    const liveParent = findFolderByPathInMemory(targetParent, folders, paths);
    if (liveParent && !liveParent.contents.includes(shortcut.id)) {
      liveParent.contents.push(shortcut.id);
    }
  }
}

/**
 * Restore a media file entry into live storage.
 */
function restoreMediaEntry(
  entry: TrashEntry,
  parentPath: string | null,
  shortcuts: DesktopShortcut[],
  folders: DesktopFolder[],
  media: DesktopMediaItem[],
  files: DesktopFileItem[],
  paths: Record<string, string>
): void {
  if (!isMediaItem(entry.item)) return;
  if (media.some((m) => m.id === entry.item.id)) return;

  const isLibrary = parentPath === '/Images' || parentPath === '/Videos' || parentPath === '/Music';
  const isSpecial = parentPath !== null && isWritableSpecialPath(parentPath);
  const targetFolderPath =
    parentPath && parentPath !== '/Desktop' && !isSpecial ? parentPath : null;

  let x = entry.item.x;
  let y = entry.item.y;

  if (!targetFolderPath && !isLibrary && !isSpecial) {
    const occupied = desktopRootOccupied(shortcuts, folders, media, files);
    const conflict = occupied.some((pos) => Math.abs(pos.x - x) < 1 && Math.abs(pos.y - y) < 1);
    if (conflict) {
      const next = findNextAvailablePosition(occupied);
      x = next.x;
      y = next.y;
    }
  }

  let restored: DesktopMediaItem;
  if (isImageItem(entry.item)) {
    restored = {
      ...entry.item,
      x,
      y,
      home: parentPath === '/Images' ? '/Images' : '/Desktop',
    };
  } else if (isVideoItem(entry.item)) {
    restored = {
      ...entry.item,
      x,
      y,
      home: parentPath === '/Videos' ? '/Videos' : '/Desktop',
    };
  } else {
    restored = {
      ...entry.item,
      x,
      y,
      home: parentPath === '/Music' ? '/Music' : '/Desktop',
    };
  }

  media.push(restored);

  if (isSpecial && parentPath) {
    // Persist media first, then place into special location contents / library home.
    saveMedia(media);
    moveItemToSpecialLocation(parentPath, restored.id);
    // moveItem may have mutated media home / special map; reload into caller array
    const live = getDesktopMedia();
    media.length = 0;
    live.forEach((m) => media.push(m));
    return;
  }

  if (targetFolderPath) {
    const liveParent = findFolderByPathInMemory(targetFolderPath, folders, paths);
    if (liveParent && !liveParent.contents.includes(restored.id)) {
      liveParent.contents.push(restored.id);
    }
  }
}

/**
 * Restore a user file entry into live storage.
 */
function restoreFileEntry(
  entry: TrashEntry,
  parentPath: string | null,
  shortcuts: DesktopShortcut[],
  folders: DesktopFolder[],
  media: DesktopMediaItem[],
  files: DesktopFileItem[],
  paths: Record<string, string>
): void {
  if (!isFileItem(entry.item)) return;
  if (files.some((f) => f.id === entry.item.id)) return;

  const isSpecial = parentPath !== null && isWritableSpecialPath(parentPath);
  const targetFolderPath =
    parentPath && parentPath !== '/Desktop' && !isSpecial ? parentPath : null;

  let x = entry.item.x;
  let y = entry.item.y;

  if (!targetFolderPath && !isSpecial) {
    const occupied = desktopRootOccupied(shortcuts, folders, media, files);
    const conflict = occupied.some((pos) => Math.abs(pos.x - x) < 1 && Math.abs(pos.y - y) < 1);
    if (conflict) {
      const next = findNextAvailablePosition(occupied);
      x = next.x;
      y = next.y;
    }
  }

  const restored: DesktopFileItem = {
    ...entry.item,
    x,
    y,
    home: '/Desktop',
  };
  files.push(restored);

  if (isSpecial && parentPath) {
    saveFiles(files);
    moveItemToSpecialLocation(parentPath, restored.id);
    const live = getDesktopFiles();
    files.length = 0;
    live.forEach((f) => files.push(f));
    return;
  }

  if (targetFolderPath) {
    const liveParent = findFolderByPathInMemory(targetFolderPath, folders, paths);
    if (liveParent && !liveParent.contents.includes(restored.id)) {
      liveParent.contents.push(restored.id);
    }
  }
}

/**
 * Restore trash entries to their original parent (or desktop if missing).
 *
 * @param entryIds - Top-level trash entry ids
 */
export function restoreFromTrash(entryIds: string[]): void {
  const uniqueIds = [...new Set(entryIds)];
  if (uniqueIds.length === 0) return;

  const trash = getTrashItems();
  const shortcuts = getDesktopShortcuts();
  const folders = getDesktopFolders();
  const media = getDesktopMedia();
  const files = getDesktopFiles();
  const paths = getFolderPaths();
  const remaining: TrashEntry[] = [];

  for (const entry of trash) {
    if (!uniqueIds.includes(entry.id)) {
      remaining.push(entry);
      continue;
    }

    let parentPath = entry.originalParentPath;
    if (
      parentPath &&
      parentPath !== '/Desktop' &&
      !isWritableSpecialPath(parentPath) &&
      !findFolderByPathInMemory(parentPath, folders, paths)
    ) {
      parentPath = null;
    }

    if (isDesktopFolder(entry.item)) {
      restoreFolderEntry(entry, parentPath, shortcuts, folders, media, files, paths);
    } else if (isMediaItem(entry.item)) {
      restoreMediaEntry(entry, parentPath, shortcuts, folders, media, files, paths);
    } else if (isFileItem(entry.item)) {
      restoreFileEntry(entry, parentPath, shortcuts, folders, media, files, paths);
    } else {
      restoreShortcutEntry(entry, parentPath, shortcuts, folders, media, files, paths);
    }
  }

  saveShortcuts(shortcuts);
  saveFolders(folders);
  saveMedia(media);
  saveFiles(files);
  setFolderPaths(paths);
  setTrashItems(remaining);
  notifyTrashUpdated();
}

/**
 * Permanently remove trash entries.
 *
 * @param entryIds - Top-level trash entry ids
 */
export function deleteForever(entryIds: string[]): void {
  const uniqueIds = new Set(entryIds);
  if (uniqueIds.size === 0) return;

  const trash = getTrashItems().filter((entry) => !uniqueIds.has(entry.id));
  setTrashItems(trash);
  notifyTrashUpdated();
}

/**
 * Permanently remove every trash entry.
 */
export function emptyTrash(): void {
  setTrashItems([]);
  notifyTrashUpdated();
}

/**
 * Display name for a trash entry.
 */
export function getTrashEntryName(entry: TrashEntry): string {
  if (isDesktopFolder(entry.item)) return entry.item.name;
  if (isImageItem(entry.item)) return entry.item.name;
  if (isVideoItem(entry.item)) return entry.item.name;
  if (isAudioItem(entry.item)) return entry.item.name;
  if (isFileItem(entry.item)) return entry.item.name;
  return entry.item.customName || entry.item.programId;
}

/**
 * Icon name for a trash entry.
 */
export function getTrashEntryIcon(entry: TrashEntry): string {
  if (isDesktopFolder(entry.item)) return entry.item.icon || 'folder';
  if (isDesktopShortcut(entry.item)) {
    return resolveProgramIcon(entry.item.programId, entry.item.programId);
  }
  if (isImageItem(entry.item)) return entry.item.icon || 'image';
  if (isVideoItem(entry.item)) return entry.item.icon || 'video';
  if (isAudioItem(entry.item)) return entry.item.icon || 'music';
  if (isFileItem(entry.item)) return entry.item.icon || 'file';
  return 'package';
}

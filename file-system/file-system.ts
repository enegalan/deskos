/**
 * Virtual filesystem helpers: path resolution, favorites, recent, special roots.
 * Every module under ./locations/ is a special location (auto-registered).
 */

import { createScopedStorage } from '../core/storage';
import {
  getFolderByPath as getFolderByPathImpl,
  type DesktopItem,
  type DesktopFolder,
} from '../core/desktop-shortcuts';

/** Registry key = locations/<id>.ts filename */
export type SpecialLocation = string;

/** Definition of a virtual special location (Desktop, Documents, etc.). */
export interface SpecialLocationInfo {
  path: string;
  name: string;
  icon: string;
  /** Sidebar order (lower first). Default 100. */
  order?: number;
  /** Items shown when this location is opened */
  getItems: () => DesktopItem[];
}

/**
 * Scan ./locations/*.ts and build the special-location registry (sorted by `order`).
 *
 * @returns Map of location id → location definition
 */
function loadSpecialLocations(): Record<SpecialLocation, SpecialLocationInfo> {
  const modules = import.meta.glob('./locations/*.ts', {
    eager: true,
  }) as Record<string, { location: SpecialLocationInfo }>;

  const loaded = Object.entries(modules)
    .map(([modulePath, mod]) => {
      const id = modulePath.slice(modulePath.lastIndexOf('/') + 1).replace(/\.ts$/, '');
      return { id, location: mod.location };
    })
    .filter((entry) => entry.location)
    .sort((a, b) => {
      const orderA = a.location.order ?? 100;
      const orderB = b.location.order ?? 100;
      if (orderA !== orderB) return orderA - orderB;
      return a.location.name.localeCompare(b.location.name);
    });

  const registry: Record<SpecialLocation, SpecialLocationInfo> = {};
  for (const { id, location } of loaded) {
    registry[id] = location;
  }
  return registry;
}

/** All special locations from ./locations/ (insertion order = sidebar order) */
export const SPECIAL_LOCATIONS: Record<SpecialLocation, SpecialLocationInfo> =
  loadSpecialLocations();

/**
 * Get a desktop folder by absolute path.
 *
 * @param path - Absolute folder path (e.g. `/Desktop/Work`)
 * @returns Folder or `null` if not found
 */
export function getFolderByPath(path: string): DesktopFolder | null {
  return getFolderByPathImpl(path);
}

/** Scoped system storage for favorites and recent paths. */
const systemStorage = createScopedStorage('system');
/** System storage key for sidebar favorite paths. */
const FAVORITES_STORAGE_KEY = 'favorites';
/** System storage key for recently opened paths. */
const RECENT_ITEMS_STORAGE_KEY = 'recent-items';

/**
 * Split a filesystem path into non-empty segments.
 *
 * @param path - Absolute or relative path
 * @returns Path segments (empty for `/`)
 */
export function parsePath(path: string): string[] {
  if (!path || path === '/') return [];
  return path.split('/').filter((part) => part.length > 0);
}

/**
 * Normalize a path (collapse duplicates, resolve `.` and `..`).
 *
 * @param path - Path to normalize
 * @returns Normalized absolute path
 */
export function normalizePath(path: string): string {
  if (!path) return '/';
  if (path === '/') return '/';

  const parts = parsePath(path);
  const normalized: string[] = [];

  for (const part of parts) {
    if (part === '.') {
      continue;
    } else if (part === '..') {
      if (normalized.length > 0) {
        normalized.pop();
      }
    } else {
      normalized.push(part);
    }
  }

  return '/' + normalized.join('/');
}

/**
 * Resolve a path to a special location, user folder, or not-found.
 *
 * @param path - Absolute path
 * @returns Resolution result with optional location id or folder
 */
export function resolvePath(path: string): {
  type: 'special' | 'folder' | 'not-found';
  location?: SpecialLocation;
  folder?: DesktopFolder;
} {
  const normalized = normalizePath(path);

  for (const [key, info] of Object.entries(SPECIAL_LOCATIONS)) {
    if (normalized === info.path) {
      return { type: 'special', location: key };
    }
  }

  const folder = getFolderByPathImpl(normalized);
  if (folder) {
    return { type: 'folder', folder };
  }

  return { type: 'not-found' };
}

/**
 * Icon name for a filesystem path (special location, folder, or generic folder).
 *
 * @param path - Absolute path
 * @returns Icon name for UI
 */
export function getPathIcon(path: string): string {
  const resolved = resolvePath(path);
  if (resolved.type === 'special' && resolved.location) {
    return SPECIAL_LOCATIONS[resolved.location].icon;
  }
  if (resolved.type === 'folder' && resolved.folder) {
    return resolved.folder.icon || 'folder';
  }
  return 'folder';
}

/**
 * Get items for a special location (delegates to that location's `getItems`).
 *
 * @param location - Special location id (`locations/<id>.ts`)
 * @returns Items to show in that location
 */
export function getSpecialLocationItems(location: SpecialLocation): DesktopItem[] {
  return SPECIAL_LOCATIONS[location]?.getItems() ?? [];
}

/**
 * Read the favorite paths list from storage.
 *
 * @returns Favorite absolute paths
 */
export function getFavorites(): string[] {
  return systemStorage.getItem<string[]>(FAVORITES_STORAGE_KEY) || [];
}

/**
 * Add a path to favorites if it is not already listed.
 *
 * @param path - Absolute path to favorite
 */
export function addFavorite(path: string): void {
  const favorites = getFavorites();
  if (!favorites.includes(path)) {
    favorites.push(path);
    systemStorage.setItem(FAVORITES_STORAGE_KEY, favorites);
  }
}

/**
 * Remove a path from favorites.
 *
 * @param path - Absolute path to remove
 */
export function removeFavorite(path: string): void {
  const favorites = getFavorites();
  const filtered = favorites.filter((p) => p !== path);
  systemStorage.setItem(FAVORITES_STORAGE_KEY, filtered);
}

/**
 * Check whether a path is in favorites.
 *
 * @param path - Absolute path
 * @returns `true` if the path is favorited
 */
export function isFavorite(path: string): boolean {
  return getFavorites().includes(path);
}

/**
 * Read recent paths from storage (newest first).
 *
 * @returns Recent path entries with timestamps
 */
export function getRecentItems(): Array<{ path: string; timestamp: number }> {
  return (
    systemStorage.getItem<Array<{ path: string; timestamp: number }>>(RECENT_ITEMS_STORAGE_KEY) ||
    []
  );
}

/**
 * Record a path as recently visited (keeps last 20).
 *
 * @param path - Absolute path to record
 */
export function addRecentItem(path: string): void {
  const recent = getRecentItems();
  const filtered = recent.filter((item) => item.path !== path);
  filtered.unshift({ path, timestamp: Date.now() });
  systemStorage.setItem(RECENT_ITEMS_STORAGE_KEY, filtered.slice(0, 20));
}

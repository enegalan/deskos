import { createScopedStorage } from './storage';
import { getFolderByPath as getFolderByPathImpl, getItemsByPath as getItemsByPathImpl, type DesktopItem, type DesktopFolder } from './desktop-shortcuts';
import { programs } from 'virtual:programs';

// Re-export functions from desktop-shortcuts for convenience
export function getFolderByPath(path: string): DesktopFolder | null {
  return getFolderByPathImpl(path);
}

export function getItemsByPath(path: string): DesktopItem[] {
  return getItemsByPathImpl(path);
}

const systemStorage = createScopedStorage('system');
const FAVORITES_STORAGE_KEY = 'favorites';
const RECENT_ITEMS_STORAGE_KEY = 'recent-items';

export type SpecialLocation = 'Desktop' | 'Documents' | 'Downloads' | 'Music' | 'Videos' | 'Images' | 'Applications';

export interface SpecialLocationInfo {
  path: string;
  name: string;
  icon: string;
}

export const SPECIAL_LOCATIONS: Record<SpecialLocation, SpecialLocationInfo> = {
  Desktop: { path: '/Desktop', name: 'Desktop', icon: 'desktop' },
  Documents: { path: '/Documents', name: 'Documents', icon: 'file' },
  Downloads: { path: '/Downloads', name: 'Downloads', icon: 'download' },
  Music: { path: '/Music', name: 'Music', icon: 'music' },
  Videos: { path: '/Videos', name: 'Videos', icon: 'video' },
  Images: { path: '/Images', name: 'Images', icon: 'image' },
  Applications: { path: '/Applications', name: 'Applications', icon: 'folder' },
};

/**
 * Parse a path into components
 */
export function parsePath(path: string): string[] {
  if (!path || path === '/') return [];
  return path.split('/').filter(part => part.length > 0);
}

/**
 * Normalize a path (remove duplicates, resolve . and ..)
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
 * Resolve a path to a folder or special location
 */
export function resolvePath(path: string): { type: 'special' | 'folder' | 'not-found'; location?: SpecialLocation; folder?: DesktopFolder } {
  const normalized = normalizePath(path);
  
  // Check if it's a special location
  for (const [key, info] of Object.entries(SPECIAL_LOCATIONS)) {
    if (normalized === info.path) {
      return { type: 'special', location: key as SpecialLocation };
    }
  }
  
  // Check if it's a folder path
  const folder = getFolderByPathImpl(normalized);
  if (folder) {
    return { type: 'folder', folder };
  }
  
  return { type: 'not-found' };
}

/**
 * Icon name for a filesystem path (special location, folder, or generic folder)
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
 * Get items for a special location
 */
export function getSpecialLocationItems(location: SpecialLocation): DesktopItem[] {
  switch (location) {
    case 'Desktop':
      return getItemsByPathImpl('/Desktop');
    
    case 'Documents':
    case 'Downloads':
    case 'Music':
    case 'Videos':
    case 'Images':
      // These are virtual folders - return empty for now
      // Can be extended to support actual file storage
      return [];
    
    case 'Applications':
      // Return all installed programs as shortcuts
      const shortcuts: DesktopItem[] = [];
      Object.keys(programs).forEach(programId => {
        const program = programs[programId];
        if (program) {
          // Create a virtual shortcut for display
          shortcuts.push({
            id: `app-${programId}`,
            programId,
            x: 0,
            y: 0,
            customName: program.metadata.name,
          });
        }
      });
      return shortcuts;
    
    default:
      return [];
  }
}

/**
 * Get favorites
 */
export function getFavorites(): string[] {
  return systemStorage.getItem<string[]>(FAVORITES_STORAGE_KEY) || [];
}

/**
 * Add favorite
 */
export function addFavorite(path: string): void {
  const favorites = getFavorites();
  if (!favorites.includes(path)) {
    favorites.push(path);
    systemStorage.setItem(FAVORITES_STORAGE_KEY, favorites);
  }
}

/**
 * Remove favorite
 */
export function removeFavorite(path: string): void {
  const favorites = getFavorites();
  const filtered = favorites.filter(p => p !== path);
  systemStorage.setItem(FAVORITES_STORAGE_KEY, filtered);
}

/**
 * Check if path is favorite
 */
export function isFavorite(path: string): boolean {
  return getFavorites().includes(path);
}

/**
 * Get recent items
 */
export function getRecentItems(): Array<{ path: string; timestamp: number }> {
  return systemStorage.getItem<Array<{ path: string; timestamp: number }>>(RECENT_ITEMS_STORAGE_KEY) || [];
}

/**
 * Add recent item
 */
export function addRecentItem(path: string): void {
  const recent = getRecentItems();
  // Remove if already exists
  const filtered = recent.filter(item => item.path !== path);
  // Add to beginning
  filtered.unshift({ path, timestamp: Date.now() });
  // Keep only last 20
  const limited = filtered.slice(0, 20);
  systemStorage.setItem(RECENT_ITEMS_STORAGE_KEY, limited);
}

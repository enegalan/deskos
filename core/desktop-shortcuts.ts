import { createScopedStorage } from './storage';
import { useKernel } from './kernel';
import { GRID_OCCUPANCY_RATIO } from './constants';

export interface DesktopShortcut {
  id: string;
  programId: string;
  x: number;
  y: number;
  customName?: string;
}

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

export type DesktopItem = DesktopShortcut | DesktopFolder;

/**
 * Type guard: whether a desktop item is a folder.
 *
 * @param item - Shortcut or folder
 * @returns `true` if `item` is a `DesktopFolder`
 */
export function isDesktopFolder(item: DesktopItem): item is DesktopFolder {
  return 'name' in item && 'contents' in item;
}

/**
 * Type guard: whether a desktop item is a program shortcut.
 *
 * @param item - Shortcut or folder
 * @returns `true` if `item` is a `DesktopShortcut`
 */
export function isDesktopShortcut(item: DesktopItem): item is DesktopShortcut {
  return 'programId' in item;
}

const STORAGE_KEY = 'desktop-shortcuts';
const FOLDERS_STORAGE_KEY = 'desktop-folders';
const FOLDER_PATHS_STORAGE_KEY = 'folder-paths';

/**
 * Get current grid size from settings
 */
export function getGridSize(): number {
  return useKernel.getState().settings.gridSize;
}

// Create system storage for desktop shortcuts
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
export function addDesktopShortcut(programId: string, x?: number, y?: number, customName?: string): DesktopShortcut {
  const shortcuts = getDesktopShortcuts();
  const folders = getDesktopFolders();
  
  // Check if shortcut already exists for this program
  const existing = shortcuts.find((s) => s.programId === programId);
  if (existing) {
    // Check if the shortcut is inside a folder
    const isInFolder = folders.some(f => f.contents.includes(existing.id));
    
    // If it's in a folder and we're providing a position, remove it from the folder
    if (isInFolder && x !== undefined && y !== undefined) {
      folders.forEach(folder => {
        if (folder.contents.includes(existing.id)) {
          folder.contents = folder.contents.filter(id => id !== existing.id);
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
  }
}

/**
 * Folder shown on the desktop surface (not nested inside another folder)
 */
function isRootDesktopFolder(folder: DesktopFolder): boolean {
  return !folder.parentPath || folder.parentPath === '/Desktop';
}

/**
 * Get all item IDs inside folders
 */
function getIdsInsideFolders(): Set<string> {
  const ids = new Set<string>();
  getDesktopFolders().forEach((folder) => {
    folder.contents.forEach((id) => ids.add(id));
  });
  return ids;
}

/**
 * Find any desktop-surface item at a grid cell (ignores nested folder contents)
 */
export function findItemAtPosition(x: number, y: number, excludeId?: string): DesktopItem | null {
  const shortcuts = getDesktopShortcuts();
  const folders = getDesktopFolders();
  const inFolders = getIdsInsideFolders();
  const metrics = getGridMetrics();
  const col = Math.round(x / metrics.cellWidth);
  const row = Math.round(y / metrics.cellHeight);

  const shortcut = shortcuts.find((s) => {
    if (excludeId && s.id === excludeId) return false;
    if (inFolders.has(s.id)) return false;
    return Math.round(s.x / metrics.cellWidth) === col && Math.round(s.y / metrics.cellHeight) === row;
  });

  if (shortcut) return shortcut;

  const folder = folders.find((f) => {
    if (excludeId && f.id === excludeId) return false;
    if (!isRootDesktopFolder(f)) return false;
    return Math.round(f.x / metrics.cellWidth) === col && Math.round(f.y / metrics.cellHeight) === row;
  });

  return folder || null;
}

/**
 * Swap positions of two desktop items (shortcuts or folders)
 */
export function swapItemPositions(itemId1: string, itemId2: string): void {
  const shortcuts = getDesktopShortcuts();
  const folders = getDesktopFolders();
  
  // Find both items
  const item1 = shortcuts.find((s) => s.id === itemId1) || folders.find((f) => f.id === itemId1);
  const item2 = shortcuts.find((s) => s.id === itemId2) || folders.find((f) => f.id === itemId2);
  
  if (item1 && item2) {
    const tempX = item1.x;
    const tempY = item1.y;
    item1.x = item2.x;
    item1.y = item2.y;
    item2.x = tempX;
    item2.y = tempY;
    
    // Save changes
    systemStorage.setItem(STORAGE_KEY, shortcuts);
    systemStorage.setItem(FOLDERS_STORAGE_KEY, folders);
    
    // Dispatch event to notify DesktopIcons to refresh
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
 * Grid that fills the entire desktop: cols/rows from preferred size,
 * cellWidth/Height stretched so there is no leftover strip.
 */
export function getGridMetrics(
  bounds: { width: number; height: number } = getDesktopBounds()
): GridMetrics {
  const preferred = getGridSize();
  const cols = Math.max(1, Math.floor(bounds.width / preferred));
  const rows = Math.max(1, Math.floor(bounds.height / preferred));
  return {
    preferred,
    cols,
    rows,
    cellWidth: bounds.width / cols,
    cellHeight: bounds.height / rows,
  };
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
export function findNextAvailablePosition(items: Array<{ x: number; y: number }>): { x: number; y: number } {
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
    items.some(
      (item) => Math.abs(item.x - 0) < thresholdX && Math.abs(item.y - y) < thresholdY
    )
  ) {
    y += metrics.cellHeight;
  }
  return { x: 0, y };
}

/**
 * Pull any icons that sit outside the desktop back into valid cells
 */
export function clampAllIconsToDesktop(): void {
  const bounds = getDesktopBounds();
  const shortcuts = getDesktopShortcuts();
  const folders = getDesktopFolders();
  let changed = false;

  shortcuts.forEach((shortcut) => {
    const clamped = clampGridPosition(shortcut.x, shortcut.y, bounds);
    if (clamped.x !== shortcut.x || clamped.y !== shortcut.y) {
      shortcut.x = clamped.x;
      shortcut.y = clamped.y;
      changed = true;
    }
  });

  folders.forEach((folder) => {
    const clamped = clampGridPosition(folder.x, folder.y, bounds);
    if (clamped.x !== folder.x || clamped.y !== folder.y) {
      folder.x = clamped.x;
      folder.y = clamped.y;
      changed = true;
    }
  });

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
  const collisions: Array<{ item: typeof allItems[0]; gridPos: { x: number; y: number } }> = [];
  
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
          const shortcut = shortcuts.find(s => s.id === item.id);
          if (shortcut) {
            shortcut.x = gridPos.x;
            shortcut.y = gridPos.y;
            hasChanges = true;
          }
        } else {
          const folder = folders.find(f => f.id === item.id);
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
                const shortcut = shortcuts.find(s => s.id === item.id);
                if (shortcut) {
                  shortcut.x = pos.x;
                  shortcut.y = pos.y;
                  hasChanges = true;
                }
              } else {
                const folder = folders.find(f => f.id === item.id);
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
        const allCurrentPositions = Array.from(occupiedPositions.keys()).map(key => {
          const [col, row] = key.split(',').map(Number);
          return cellTopLeft(col, row, metrics);
        });
        const availablePos = findNextAvailablePosition(allCurrentPositions);
        const col = Math.round(availablePos.x / metrics.cellWidth);
        const row = Math.round(availablePos.y / metrics.cellHeight);
        occupiedPositions.set(`${col},${row}`, item.id);
        
        if (item.type === 'shortcut') {
          const shortcut = shortcuts.find(s => s.id === item.id);
          if (shortcut) {
            shortcut.x = availablePos.x;
            shortcut.y = availablePos.y;
            hasChanges = true;
          }
        } else {
          const folder = folders.find(f => f.id === item.id);
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
    
    // Dispatch event to notify DesktopIcons to refresh
    window.dispatchEvent(new CustomEvent('desktop-shortcuts-updated'));
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
  const rootFolders = folders.filter(f => !f.parentPath || f.parentPath === '/Desktop');
  const itemsInFolders = new Set<string>();
  folders.forEach(folder => {
    folder.contents.forEach(itemId => {
      itemsInFolders.add(itemId);
    });
  });
  const rootShortcuts = shortcuts.filter(s => !itemsInFolders.has(s.id));
  
  if (rootShortcuts.length === 0 && rootFolders.length === 0) return;

  const metrics = getGridMetrics();
  let currentCol = 0;
  let currentRow = 0;

  // Get program names for shortcuts - import dynamically to avoid circular dependency
  const { programs } = await import('virtual:programs');
  
  // Create array of items with their names for sorting
  const itemsWithNames: Array<{ item: DesktopItem; name: string }> = [];
  
  rootShortcuts.forEach(shortcut => {
    const program = programs[shortcut.programId];
    const name = shortcut.customName || (program?.metadata?.name || shortcut.programId);
    itemsWithNames.push({ item: shortcut, name: name.toLowerCase() });
  });
  
  rootFolders.forEach(folder => {
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
  const rootFolders = folders.filter(f => !f.parentPath || f.parentPath === '/Desktop');
  const itemsInFolders = new Set<string>();
  folders.forEach(folder => {
    folder.contents.forEach(itemId => {
      itemsInFolders.add(itemId);
    });
  });
  const rootShortcuts = shortcuts.filter(s => !itemsInFolders.has(s.id));
  
  if (rootShortcuts.length === 0 && rootFolders.length === 0) return;

  const metrics = getGridMetrics();
  let currentCol = 0;
  let currentRow = 0;

  // Create array of items with their creation dates for sorting
  const itemsWithDates: Array<{ item: DesktopItem; date: number }> = [];
  
  rootShortcuts.forEach(shortcut => {
    // Shortcuts don't have createdAt, use a default or extract from ID timestamp if available
    // For now, use 0 to put them at the end, or we could extract timestamp from ID
    const timestamp = shortcut.id.includes('-') ? parseInt(shortcut.id.split('-').pop() || '0', 10) : 0;
    itemsWithDates.push({ item: shortcut, date: timestamp || 0 });
  });
  
  rootFolders.forEach(folder => {
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
  const siblingFolders = folders.filter(f => (f.parentPath || '/Desktop') === targetParentPath);
  
  // Check if base name is available
  const nameExists = siblingFolders.some(f => f.name === baseName);
  if (!nameExists) {
    return baseName;
  }
  
  // Find the next available number
  let number = 1;
  let uniqueName = `${baseName} (${number})`;
  
  while (siblingFolders.some(f => f.name === uniqueName)) {
    number++;
    uniqueName = `${baseName} (${number})`;
  }
  
  return uniqueName;
}

/**
 * Create a new desktop folder
 */
export function createDesktopFolder(name: string, x?: number, y?: number, parentPath?: string): DesktopFolder {
  const folders = getDesktopFolders();
  const paths = getFolderPaths();
  
  // Find next available position if not provided (desktop surface only)
  if (x === undefined || y === undefined) {
    const shortcuts = getDesktopShortcuts();
    const inFolders = getIdsInsideFolders();
    const rootItems = [
      ...shortcuts.filter((s) => !inFolders.has(s.id)),
      ...folders.filter(isRootDesktopFolder),
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
  const path = targetParentPath !== '/Desktop' ? `${targetParentPath}/${uniqueName}` : `/Desktop/${uniqueName}`;
  
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
    // Return root items (items without parent or with parentPath === '/Desktop')
    const rootShortcuts = shortcuts.filter(s => !s.programId.startsWith('folder-'));
    const rootFolders = folders.filter(f => !f.parentPath || f.parentPath === '/Desktop');
    return [...rootShortcuts, ...rootFolders];
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
  return folders.find(f => f.id === folderId) || null;
}

/**
 * Get folder by path
 */
export function getFolderByPath(path: string): DesktopFolder | null {
  if (!path || path === '/Desktop' || path === '/') {
    return null; // Root is not a folder
  }
  
  // Parse path: /Desktop/Folder1/Folder2 -> ['Desktop', 'Folder1', 'Folder2']
  const parts = path.split('/').filter(p => p.length > 0);
  if (parts.length === 0 || parts[0] !== 'Desktop') {
    return null;
  }
  
  const folders = getDesktopFolders();
  let currentFolders = folders.filter(f => !f.parentPath || f.parentPath === '/Desktop');
  
  // Traverse path
  for (let i = 1; i < parts.length; i++) {
    const folderName = parts[i];
    const folder = currentFolders.find(f => f.name === folderName);
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
  
  return folder.contents
    .map(itemId => {
      const shortcut = shortcuts.find(s => s.id === itemId);
      if (shortcut) return shortcut;
      const subFolder = folders.find(f => f.id === itemId);
      return subFolder || null;
    })
    .filter((item): item is DesktopItem => item !== null);
}

/**
 * Add an item to a folder
 */
export function addItemToFolder(folderId: string, itemId: string): void {
  const folders = getDesktopFolders();
  const paths = getFolderPaths();
  const folder = folders.find(f => f.id === folderId);
  if (!folder) return;
  
  // Prevent adding item to itself
  if (folder.id === itemId) return;
  
  // Prevent adding item if it's already in the folder
  if (folder.contents.includes(itemId)) return;
  
  // Remove item from its current parent if it's a folder
  folders.forEach(f => {
    if (f.id !== folderId && f.contents.includes(itemId)) {
      f.contents = f.contents.filter(id => id !== itemId);
    }
  });
  
  folder.contents.push(itemId);
  
  // If the item being added is a folder, update its parentPath
  const itemFolder = folders.find(f => f.id === itemId);
  if (itemFolder) {
    // Calculate the new parent path
    const folderPath = paths[folderId] || (folder.parentPath ? `${folder.parentPath}/${folder.name}` : `/Desktop/${folder.name}`);
    itemFolder.parentPath = folderPath;
    
    // Update the path mapping for the moved folder
    const newPath = `${folderPath}/${itemFolder.name}`;
    paths[itemId] = newPath;
  }
  
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
  const folder = folders.find(f => f.id === folderId);
  if (!folder) return;
  
  folder.contents = folder.contents.filter(id => id !== itemId);
  
  // If the item being removed is a folder, update its parentPath to root
  const itemFolder = folders.find(f => f.id === itemId);
  if (itemFolder) {
    itemFolder.parentPath = '/Desktop';
    // Update path mapping
    const newPath = `/Desktop/${itemFolder.name}`;
    paths[itemId] = newPath;
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
    const folder = folders.find(f => f.id === id);
    if (!folder) return;
    
    // Remove all items in the folder
    folder.contents.forEach(itemId => {
      // Check if it's a subfolder
      const subFolder = folders.find(f => f.id === itemId);
      if (subFolder) {
        removeFolderRecursive(itemId);
      }
      // Shortcuts are not deleted, just removed from folder
    });
    
    // Remove folder from array
    const index = folders.findIndex(f => f.id === id);
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
  const folder = folders.find(f => f.id === folderId);
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
  const shortcut = shortcuts.find(s => s.id === shortcutId);
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
  const folder = folders.find(f => f.id === folderId);
  if (folder) {
    const clamped = clampGridPosition(x, y);
    folder.x = clamped.x;
    folder.y = clamped.y;
    systemStorage.setItem(FOLDERS_STORAGE_KEY, folders);
  }
}

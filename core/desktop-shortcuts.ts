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

/** Desktop shortcut or folder item. */
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

/** System storage key for live desktop shortcuts. */
const STORAGE_KEY = 'desktop-shortcuts';
/** System storage key for live desktop folders. */
const FOLDERS_STORAGE_KEY = 'desktop-folders';
/** System storage key for folder id → absolute path map. */
const FOLDER_PATHS_STORAGE_KEY = 'folder-paths';

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
  const inFolders = getIdsInsideFolders();
  const metrics = getGridMetrics();
  const col = Math.round(x / metrics.cellWidth);
  const row = Math.round(y / metrics.cellHeight);

  const shortcut = shortcuts.find((s) => {
    if (exclude.has(s.id)) return false;
    if (inFolders.has(s.id)) return false;
    return Math.round(s.x / metrics.cellWidth) === col && Math.round(s.y / metrics.cellHeight) === row;
  });

  if (shortcut) return shortcut;

  const folder = folders.find((f) => {
    if (exclude.has(f.id)) return false;
    if (!isRootDesktopFolder(f)) return false;
    return Math.round(f.x / metrics.cellWidth) === col && Math.round(f.y / metrics.cellHeight) === row;
  });

  return folder || null;
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
    rememberGridMetrics();
    
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
export function getDesktopSurfacePositions(excludeIds: Iterable<string> = []): Array<{ x: number; y: number }> {
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
    rememberGridMetrics();
  }
}

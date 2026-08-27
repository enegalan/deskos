/**
 * Dock (taskbar) pins.
 * Items are defined under ./items/ — order in DOCK_ITEMS = left-to-right order.
 */

import { item as launcher } from './items/launcher';
import { item as notes } from './items/notes';
import { item as settings } from './items/settings';

export interface DockItem {
  /** Program id from programs/<name>/program.tsx */
  programId: string;
}

/** Pinned dock entries (order = display order) */
export const DOCK_ITEMS: DockItem[] = [launcher, notes, settings];

/**
 * Dock entry for the launcher (if pinned).
 *
 * @returns Launcher dock item, or `undefined`
 */
export function getDockLauncher(): DockItem | undefined {
  return DOCK_ITEMS.find((item) => item.programId === 'launcher');
}

/**
 * Non-launcher dock pins (left-to-right order).
 *
 * @returns Pinned program dock items
 */
export function getDockPins(): DockItem[] {
  return DOCK_ITEMS.filter((item) => item.programId !== 'launcher');
}

/** Program ids already represented by a fixed dock slot */
export function getDockPinnedProgramIds(): Set<string> {
  return new Set(DOCK_ITEMS.map((item) => item.programId));
}

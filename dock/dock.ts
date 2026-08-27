/**
 * Dock (taskbar) layout.
 * Items live under ./items/ — order in DOCK_ITEMS = left-to-right order.
 */

import { item as launcher } from './items/launcher';
import { item as notes } from './items/notes';
import { item as settings } from './items/settings';
import { item as separator } from './items/separator';
import { item as clock } from './items/clock';
import { item as running } from './items/running';

/** Pinned program entry */
export type DockProgramItem = {
  type: 'program';
  programId: string;
};

/** Built-in dock chrome (not a program) */
export type DockSpecialItem =
  | { type: 'separator' }
  | { type: 'clock' }
  | { type: 'running' };

export type DockItem = DockProgramItem | DockSpecialItem;

/** Full dock layout (order = display order) */
export const DOCK_ITEMS: DockItem[] = [
  launcher,
  separator,
  notes,
  settings,
  running,
  separator,
  clock,
];

/**
 * Whether a dock entry is a program pin.
 *
 * @param item - Dock entry
 */
export function isDockProgram(item: DockItem): item is DockProgramItem {
  return item.type === 'program';
}

/**
 * Dock entry for the launcher (if pinned).
 *
 * @returns Launcher dock item, or `undefined`
 */
export function getDockLauncher(): DockProgramItem | undefined {
  return DOCK_ITEMS.find(
    (item): item is DockProgramItem => isDockProgram(item) && item.programId === 'launcher'
  );
}

/**
 * Non-launcher program pins (left-to-right order).
 *
 * @returns Pinned program dock items
 */
export function getDockPins(): DockProgramItem[] {
  return DOCK_ITEMS.filter(
    (item): item is DockProgramItem => isDockProgram(item) && item.programId !== 'launcher'
  );
}

/** Program ids already represented by a fixed dock pin */
export function getDockPinnedProgramIds(): Set<string> {
  return new Set(
    DOCK_ITEMS.filter(isDockProgram).map((item) => item.programId)
  );
}

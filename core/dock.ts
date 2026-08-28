/**
 * Dock (taskbar) layout built from program manifest flags + built-in chrome.
 */

import { getDockPins as getRegisteredDockPins } from './program-registry';

/** Pinned program entry */
export type DockProgramItem = {
  type: 'program';
  programId: string;
};

/** Built-in dock chrome (not a program) */
export type DockSpecialItem = { type: 'separator' } | { type: 'clock' } | { type: 'running' };

/** Union of all dock slot types (program pin or built-in chrome). */
export type DockItem = DockProgramItem | DockSpecialItem;

/** Build ordered dock layout from registered program pins. */
function buildDockItems(): DockItem[] {
  const pins = getRegisteredDockPins();
  const launchers = pins.filter((p) => p.role === 'launcher');
  const programs = pins.filter((p) => p.role !== 'launcher');

  const items: DockItem[] = [];
  for (const pin of launchers) {
    items.push({ type: 'program', programId: pin.programId });
  }
  if (programs.length > 0) {
    if (items.length > 0) {
      items.push({ type: 'separator' });
    }
    for (const pin of programs) {
      items.push({ type: 'program', programId: pin.programId });
    }
  }
  items.push({ type: 'running' });
  items.push({ type: 'separator' });
  items.push({ type: 'clock' });
  return items;
}

/** Full dock layout (order = display order) */
export const DOCK_ITEMS: DockItem[] = buildDockItems();

/** Type guard: dock item is a pinned program. */
export function isDockProgram(item: DockItem): item is DockProgramItem {
  return item.type === 'program';
}

/** Program ids already represented by a fixed dock pin */
export function getDockPinnedProgramIds(): Set<string> {
  return new Set(DOCK_ITEMS.filter(isDockProgram).map((item) => item.programId));
}

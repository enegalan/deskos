/**
 * Pluggable delete pipeline for desktop / folder items.
 * Programs register handlers (Trash provides the default soft-delete).
 */

/** Performs delete / move-to-trash for the given desktop item ids. */
export type DeleteItemsHandler = (itemIds: string[]) => void | Promise<void>;
/** Builds the context-menu label for a delete action. */
export type DeleteLabelFn = (count: number) => string;

/** Registered delete handler with label builder and priority. */
interface DeleteItemsProvider {
  handler: DeleteItemsHandler;
  getLabel: DeleteLabelFn;
  priority: number;
}

let deleteItemsProviders: DeleteItemsProvider[] = [];

/** Fallback delete label when no provider registers a custom one. */
const DEFAULT_LABEL: DeleteLabelFn = (count) =>
  count > 1 ? `Delete (${count} items)` : 'Delete';

/**
 * Register a handler that performs delete/move-to-trash on item ids.
 */
export function registerDeleteItemsHandler(
  handler: DeleteItemsHandler,
  options?: { getLabel?: DeleteLabelFn; priority?: number }
): () => void {
  const entry: DeleteItemsProvider = {
    handler,
    getLabel: options?.getLabel ?? DEFAULT_LABEL,
    priority: options?.priority ?? 0,
  };
  deleteItemsProviders.push(entry);
  deleteItemsProviders.sort((a, b) => b.priority - a.priority);
  return () => {
    deleteItemsProviders = deleteItemsProviders.filter((p) => p !== entry);
  };
}

/** Label for the delete menu action (highest-priority provider). */
export function getDeleteItemsLabel(count: number): string {
  const provider = deleteItemsProviders[0];
  if (!provider) return DEFAULT_LABEL(count);
  return provider.getLabel(count);
}

/** Run the highest-priority delete handler. No-op if none registered. */
export async function deleteDesktopItems(itemIds: string[]): Promise<void> {
  const uniqueIds = [...new Set(itemIds)];
  if (uniqueIds.length === 0) return;
  const provider = deleteItemsProviders[0];
  if (!provider) {
    console.warn('[delete-items] No delete handler registered');
    return;
  }
  await provider.handler(uniqueIds);
}

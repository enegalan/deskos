import type { ContextMenuManager, MenuContext, MenuItem } from '../../ContextMenuManager';

/**
 * Resolve the sidebar path from a click target inside a folder sidebar item.
 */
function getSidebarPath(target: HTMLElement): string | null {
  const item = target.closest('.folder-sidebar-item[data-drop-path]') as HTMLElement | null;
  return item?.dataset.dropPath || null;
}

/** Register context menu for folder-window sidebar locations / favorites / recent. */
export function registerFolderSidebarMenu(manager: ContextMenuManager): void {
  manager.registerProvider({
    id: 'system-folder-sidebar-menu',
    target: '.folder-sidebar-item[data-drop-path]',
    programId: 'system',
    priority: 10,
    generator: async (context: MenuContext) => {
      const items: MenuItem[] = [];
      const path = getSidebarPath(context.target);
      if (!path) return items;

      items.push({
        id: 'folder-sidebar-open',
        label: 'Open',
        icon: 'open',
        action: () => {
          if (!context.windowId) return;
          window.dispatchEvent(
            new CustomEvent('folder-navigate', {
              detail: { windowId: context.windowId, path },
            })
          );
        },
      });

      items.push({
        id: 'folder-sidebar-open-new-window',
        label: 'Open in New Window',
        icon: 'new-window',
        action: async () => {
          const { getFolderByPath } = await import('@core/desktop-shortcuts');
          const folder = getFolderByPath(path);
          window.dispatchEvent(
            new CustomEvent('open-folder', {
              detail: folder ? { folderId: folder.id } : { initialPath: path },
            })
          );
        },
      });

      const { isFavorite, addFavorite, removeFavorite } = await import('@file-system/file-system');
      const favorited = isFavorite(path);
      items.push({
        id: favorited ? 'folder-sidebar-unfavorite' : 'folder-sidebar-favorite',
        label: favorited ? 'Remove from Favorites' : 'Add to Favorites',
        icon: 'star',
        action: () => {
          if (favorited) {
            removeFavorite(path);
          } else {
            addFavorite(path);
          }
          window.dispatchEvent(new CustomEvent('desktop-shortcuts-updated'));
        },
      });

      return items;
    },
  });
}

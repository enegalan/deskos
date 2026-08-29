import type { ContextMenuManager, MenuContext, MenuItem } from '../../ContextMenuManager';

/**
 * Resolve breadcrumb path from a click target inside the folder path bar.
 */
function getBreadcrumbPath(target: HTMLElement): string | null {
  const item = target.closest('.folder-breadcrumb-item[data-path]') as HTMLElement | null;
  return item?.dataset.path || null;
}

/** Register context menu for folder-window breadcrumb segments. */
export function registerFolderBreadcrumbMenu(manager: ContextMenuManager): void {
  manager.registerProvider({
    id: 'system-folder-breadcrumb-menu',
    target: '.folder-breadcrumb-item[data-path]',
    programId: 'system',
    priority: 10,
    generator: async (context: MenuContext) => {
      const items: MenuItem[] = [];
      const path = getBreadcrumbPath(context.target);
      if (!path) return items;

      items.push({
        id: 'folder-breadcrumb-open',
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
        id: 'folder-breadcrumb-open-new-window',
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

      return items;
    },
  });
}

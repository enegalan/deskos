import type { ContextMenuManager, MenuContext, MenuItem } from '../../ContextMenuManager';

function getFolderWindowPath(target: HTMLElement): string | null {
  const host = target.closest('[data-folder-path]') as HTMLElement | null;
  return host?.dataset.folderPath || null;
}

export function registerFolderWindowMenu(manager: ContextMenuManager): void {
  manager.registerProvider({
    id: 'system-folder-window-menu',
    target: 'folder-window',
    programId: 'system',
    priority: 0,
    generator: async (context: MenuContext) => {
      const items: MenuItem[] = [];
      const path = getFolderWindowPath(context.target);
      if (!path) {
        return items;
      }

      const { getFolderByPath } = await import('@core/desktop-shortcuts');
      const canCreateFolder = path === '/Desktop' || !!getFolderByPath(path);
      if (!canCreateFolder) {
        return items;
      }

      items.push({
        id: 'folder-window-new-folder',
        label: 'New Folder',
        icon: 'new-folder',
        action: async () => {
          try {
            const { createDesktopFolder } = await import('@core/desktop-shortcuts');
            const parentPath = path === '/Desktop' ? undefined : path;
            createDesktopFolder('New Folder', undefined, undefined, parentPath);
          } catch (error) {
            console.error('[FolderWindow] Error creating folder:', error);
          }
        },
      });

      try {
        const { getClipboard, hasClipboardData } = await import('@core/clipboard');
        if (hasClipboardData()) {
          const clipboard = getClipboard();
          if (clipboard && (clipboard.type === 'desktop-items' || clipboard.type === 'folder-items')) {
            items.push({
              id: 'folder-window-separator-paste',
              type: 'separator',
              label: '',
            });
            items.push({
              id: 'folder-window-paste',
              label: clipboard.items.length > 1 ? `Paste (${clipboard.items.length} items)` : 'Paste',
              icon: 'paste',
              shortcut: 'Cmd+V',
              action: async () => {
                try {
                  const { getPasteHandler } = await import('@core/clipboard');
                  const handler = getPasteHandler();
                  handler?.();
                } catch (error) {
                  console.error('[FolderWindow] Error pasting:', error);
                }
              },
            });
          }
        }
      } catch (error) {
        console.error('[FolderWindow] Error checking clipboard:', error);
      }

      return items;
    },
  });
}

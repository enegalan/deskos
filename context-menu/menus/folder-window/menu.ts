import type { ContextMenuManager, MenuContext, MenuItem } from '../../ContextMenuManager';
import { useKernel, type FolderViewMode } from '@core/kernel';
import { dialog } from '@core/dialog';

/**
 * Read the folder path from a folder-window host element.
 *
 * @param target - Element inside a folder window
 * @returns Folder path or `null` if missing
 */
function getFolderWindowPath(target: HTMLElement): string | null {
  const host = target.closest('[data-folder-path]') as HTMLElement | null;
  return host?.dataset.folderPath || null;
}

/** Register the folder window background context menu provider */
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

      const viewMode: FolderViewMode =
        useKernel.getState().settings.folderViewMode === 'list' ? 'list' : 'grid';

      items.push({
        id: 'folder-window-view',
        label: 'View',
        icon: 'view',
        type: 'submenu',
        submenu: [
          {
            id: 'folder-window-view-grid',
            label: 'as Grid',
            icon: 'view-grid',
            type: 'radio',
            checked: viewMode === 'grid',
            group: 'folder-view-mode',
            action: () => {
              useKernel.getState().updateSettings({ folderViewMode: 'grid' });
            },
          },
          {
            id: 'folder-window-view-list',
            label: 'as List',
            icon: 'view-list',
            type: 'radio',
            checked: viewMode === 'list',
            group: 'folder-view-mode',
            action: () => {
              useKernel.getState().updateSettings({ folderViewMode: 'list' });
            },
          },
        ],
      });

      const { getFolderByPath, isWritableSpecialPath } = await import('@core/desktop-shortcuts');
      const isUserFolder = path === '/Desktop' || !!getFolderByPath(path);
      const canCreateItems = isUserFolder || isWritableSpecialPath(path);

      if (isUserFolder) {
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
      }

      if (canCreateItems) {
        items.push({
          id: 'folder-window-new-file',
          label: 'New File',
          icon: 'file',
          action: async () => {
            try {
              const fileName = await dialog.prompt('Enter file name:', '', 'New File', {
                required: true,
              });
              if (!fileName || !fileName.trim()) return;
              const { createDesktopFile } = await import('@core/desktop-shortcuts');
              const parentPath = path === '/Desktop' ? undefined : path;
              createDesktopFile(fileName.trim(), undefined, undefined, parentPath);
            } catch (error) {
              console.error('[FolderWindow] Error creating file:', error);
            }
          },
        });
        items.push({
          id: 'folder-window-upload-file',
          label: 'Upload Files…',
          icon: 'file',
          action: async () => {
            try {
              const { pickAndImportFiles } = await import('@core/file-transfer');
              const parentPath = path === '/Desktop' ? undefined : path;
              pickAndImportFiles({ parentPath });
            } catch (error) {
              console.error('[FolderWindow] Error uploading files:', error);
            }
          },
        });
      }

      try {
        const { getClipboard, hasClipboardData } = await import('@core/clipboard');
        if (hasClipboardData()) {
          const clipboard = getClipboard();
          if (
            clipboard &&
            (clipboard.type === 'desktop-items' || clipboard.type === 'folder-items')
          ) {
            items.push({
              id: 'folder-window-separator-paste',
              type: 'separator',
              label: '',
            });
            items.push({
              id: 'folder-window-paste',
              label:
                clipboard.items.length > 1 ? `Paste (${clipboard.items.length} items)` : 'Paste',
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

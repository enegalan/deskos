import type { ContextMenuManager, MenuContext, MenuItem } from '../../ContextMenuManager';
import { useKernel } from '@core/kernel';
import { ICON_SIZE_LARGE, ICON_SIZE_MEDIUM, ICON_SIZE_SMALL } from '@core/constants';
import { organizeIconsByName, organizeIconsByDate } from '@core/desktop-shortcuts';

export function registerDesktopMenu(manager: ContextMenuManager): void {
  manager.registerProvider({
    id: 'system-desktop-menu',
    target: 'desktop',
    programId: 'system',
    priority: 0,
    generator: async (_context: MenuContext) => {
      const items: MenuItem[] = [];
      
      // Static items
      items.push(
      {
        id: 'desktop-view',
        label: 'View',
        icon: 'view',
        type: 'submenu',
        submenu: [
          {
            id: 'desktop-icon-size-small',
            label: 'Icon Size: Small',
            icon: 'view',
            action: (_context) => {
              useKernel.getState().updateSettings({ iconSize: ICON_SIZE_SMALL });
            },
          },
          {
            id: 'desktop-icon-size-medium',
            label: 'Icon Size: Medium',
            icon: 'view',
            action: (_context) => {
              useKernel.getState().updateSettings({ iconSize: ICON_SIZE_MEDIUM });
            },
          },
          {
            id: 'desktop-icon-size-large',
            label: 'Icon Size: Large',
            icon: 'view',
            action: (_context) => {
              useKernel.getState().updateSettings({ iconSize: ICON_SIZE_LARGE });
            },
          },
          {
            id: 'desktop-view-separator-1',
            type: 'separator',
            label: '',
          },
          {
            id: 'desktop-show-labels',
            label: 'Show Icon Labels',
            icon: 'view',
            action: (_context) => {
              const current = useKernel.getState().settings.showIconLabels;
              useKernel.getState().updateSettings({ showIconLabels: !current });
            },
          },
          {
            id: 'desktop-view-separator-2',
            type: 'separator',
            label: '',
          },
          {
            id: 'desktop-refresh',
            label: 'Refresh',
            icon: 'refresh',
            action: (_context) => {
              window.location.reload();
            },
          },
        ],
      },
      {
        id: 'desktop-organize',
        label: 'Organize By',
        icon: 'organize',
        type: 'submenu',
        submenu: [
          {
            id: 'desktop-organize-name',
            label: 'Name',
            icon: 'organize',
            action: async (_context) => {
              await organizeIconsByName();
            },
          },
          {
            id: 'desktop-organize-date',
            label: 'Date Created',
            icon: 'organize',
            action: (_context) => {
              organizeIconsByDate();
            },
          },
        ],
      },
      {
        id: 'desktop-new-folder',
        label: 'New Folder',
        icon: 'new-folder',
        action: async (context: MenuContext) => {
          try {
            const { createDesktopFolder, findItemAtPosition, pixelToClampedGrid } = await import('@core/desktop-shortcuts');
            const desktopElement = document.querySelector('.desktop');
            if (desktopElement && context.event && 'clientX' in context.event && 'clientY' in context.event) {
              const rect = desktopElement.getBoundingClientRect();
              // Convert click coordinates to desktop-relative coordinates
              const x = context.event.clientX - rect.left;
              const y = context.event.clientY - rect.top;
              const gridPos = pixelToClampedGrid(x, y, { width: rect.width, height: rect.height });
              
              // Check if there's already an item at this position (should not happen because desktop apps fill a grid cell)
              const existingItem = findItemAtPosition(gridPos.x, gridPos.y);
              if (existingItem) {
                console.warn('[Desktop] Cannot create folder: position already occupied by', existingItem);
                return;
              }
              
              createDesktopFolder('New Folder', gridPos.x, gridPos.y);
            } else {
              createDesktopFolder('New Folder');
            }
          } catch (error) {
            console.error('[Desktop] Error creating folder:', error);
          }
        },
      },
        {
          id: 'desktop-separator-paste',
          type: 'separator',
          label: '',
        }
      );

      // Check clipboard and add Paste if available
      try {
        const { getClipboard, hasClipboardData } = await import('@core/clipboard');
        if (hasClipboardData()) {
          const clipboard = getClipboard();
          if (clipboard && clipboard.type === 'desktop-items') {
            const itemCount = clipboard.items.length;
            items.push({
              id: 'desktop-paste',
              label: itemCount > 1 ? `Paste (${itemCount} items)` : 'Paste',
              icon: 'paste',
              shortcut: 'Cmd+V',
              action: async () => {
                try {
                  const { getPasteHandler } = await import('@core/clipboard');
                  const handler = getPasteHandler();
                  if (handler) {
                    handler();
                  }
                } catch (error) {
                  console.error('[Desktop] Error pasting items:', error);
                }
              },
            },
            {
              id: 'desktop-separator-1',
              type: 'separator',
              label: '',
            });
          }
        }
      } catch (error) {
        console.error('[Desktop] Error checking clipboard:', error);
      }

      items.push(
        {
          id: 'desktop-settings',
          label: 'Settings',
          icon: 'settings',
          action: async (context: MenuContext) => {
            console.log('[Desktop] Open Settings', context);
            try {
              const { launchOrFocusProgram } = await import('@core/context');
              await launchOrFocusProgram('settings');
            } catch (error) {
              console.error('[Desktop] Error opening Settings:', error);
            }
          },
        }
      );

      return items;
    },
  });
}

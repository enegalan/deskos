import type { ContextMenuManager, MenuContext } from '../../ContextMenuManager';

/** Register the launcher item context menu provider */
export function registerLauncherItemMenu(manager: ContextMenuManager): void {
  manager.registerProvider({
    id: 'system-launcher-item-menu',
    target: '.launcher-item',
    programId: 'system',
    priority: 0,
    items: [
      {
        id: 'launcher-create-shortcut',
        label: 'Create Desktop Shortcut',
        icon: 'open',
        action: async (context: MenuContext) => {
          const programId = context.target.getAttribute('data-program-id');
          if (programId) {
            try {
              const { addDesktopShortcut } = await import('@core/desktop-shortcuts');
              addDesktopShortcut(programId);
              
              // Dispatch custom event to notify DesktopIcons to refresh
              window.dispatchEvent(new CustomEvent('desktop-shortcuts-updated'));
            } catch (error) {
              console.error('[Launcher] Error creating desktop shortcut:', error);
            }
          }
        },
      },
    ],
  });
}

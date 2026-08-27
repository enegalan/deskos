import type { ContextMenuManager, MenuContext } from '../../ContextMenuManager';

export function registerWindowMenu(manager: ContextMenuManager): void {
  manager.registerProvider({
    id: 'system-window-menu',
    target: 'window',
    programId: 'system',
    priority: 0,
    items: [
      {
        id: 'window-restore',
        label: 'Restore',
        icon: 'restore',
        action: (context: MenuContext) => {
          console.log('[Window] Restore', context);
          if (context.windowId) {
            import('@core/kernel').then(({ useKernel }) => {
              useKernel.getState().restoreWindow(context.windowId!);
            });
          }
        },
      },
      {
        id: 'window-move',
        label: 'Move',
        icon: 'open',
        action: (context: MenuContext) => {
          console.log('[Window] Move', context);
          // Move is typically handled by dragging the title bar
          // This could trigger a move mode if needed
        },
      },
      {
        id: 'window-resize',
        label: 'Resize',
        icon: 'maximize',
        action: (context: MenuContext) => {
          console.log('[Window] Resize', context);
          // Resize is typically handled by dragging the edges
          // This could trigger a resize mode if needed
        },
      },
      {
        id: 'window-separator-1',
        type: 'separator',
        label: '',
      },
      {
        id: 'window-minimize',
        label: 'Minimize',
        icon: 'minimize',
        action: (context: MenuContext) => {
          console.log('[Window] Minimize', context);
          if (context.windowId) {
            import('@core/kernel').then(({ useKernel }) => {
              useKernel.getState().minimizeWindow(context.windowId!);
            });
          }
        },
      },
      {
        id: 'window-maximize',
        label: 'Maximize',
        icon: 'maximize',
        action: (context: MenuContext) => {
          console.log('[Window] Maximize', context);
          if (context.windowId) {
            import('@core/kernel').then(({ useKernel }) => {
              const kernel = useKernel.getState();
              const window = kernel.windows.find((w) => w.id === context.windowId);
              if (window) {
                if (window.isMaximized) {
                  kernel.restoreWindow(context.windowId!);
                } else {
                  kernel.maximizeWindow(context.windowId!);
                }
              }
            });
          }
        },
      },
      {
        id: 'window-separator-2',
        type: 'separator',
        label: '',
      },
      {
        id: 'window-bring-to-front',
        label: 'Bring All to Front',
        icon: 'bring-to-front',
        action: async (context: MenuContext) => {
          if (context.programId) {
            const { useKernel } = await import('@core/kernel');
            const kernel = useKernel.getState();
            const programWindows = kernel.windows.filter((w) => w.programId === context.programId);
            programWindows.forEach((win) => {
              kernel.focusWindow(win.id);
            });
          }
        },
      },
      {
        id: 'window-separator-3',
        type: 'separator',
        label: '',
      },
      {
        id: 'window-hide',
        label: 'Hide',
        icon: 'hide',
        action: async (context: MenuContext) => {
          if (context.programId) {
            const { useKernel } = await import('@core/kernel');
            const kernel = useKernel.getState();
            const programWindows = kernel.windows.filter((w) => w.programId === context.programId);
            programWindows.forEach((win) => {
              kernel.minimizeWindow(win.id);
            });
          }
        },
      },
      {
        id: 'window-hide-others',
        label: 'Hide Others',
        icon: 'hide-others',
        action: async (context: MenuContext) => {
          if (context.programId) {
            const { useKernel } = await import('@core/kernel');
            const kernel = useKernel.getState();
            kernel.windows.forEach((win) => {
              if (win.programId !== context.programId) {
                kernel.minimizeWindow(win.id);
              }
            });
          }
        },
      },
      {
        id: 'window-show-all',
        label: 'Show All',
        icon: 'show-all',
        action: async () => {
          const { useKernel } = await import('@core/kernel');
          const kernel = useKernel.getState();
          kernel.windows.forEach((win) => {
            if (win.isMinimized) {
              kernel.restoreWindow(win.id);
            }
          });
        },
      },
      {
        id: 'window-separator-4',
        type: 'separator',
        label: '',
      },
      {
        id: 'window-close',
        label: 'Close',
        icon: 'close',
        action: (context: MenuContext) => {
          console.log('[Window] Close', context);
          if (context.windowId) {
            // Import kernel dynamically to avoid circular dependency
            import('@core/kernel').then(({ useKernel }) => {
              useKernel.getState().closeWindow(context.windowId!);
            });
          }
        },
      },
    ],
  });
}

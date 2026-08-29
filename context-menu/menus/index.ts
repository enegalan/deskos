import { ContextMenuManager } from '../ContextMenuManager';
import { registerDesktopMenu } from './desktop/menu';
import { registerDesktopIconMenu } from './desktop-icon/menu';
import { registerFolderIconMenu } from './folder-icon/menu';
import { registerFolderWindowMenu } from './folder-window/menu';
import { registerFolderWindowItemMenu } from './folder-window-item/menu';
import { registerFolderSidebarMenu } from './folder-sidebar/menu';
import { registerFolderBreadcrumbMenu } from './folder-breadcrumb/menu';
import { registerLauncherItemMenu } from './launcher-item/menu';
import { registerWindowMenu } from './window/menu';
import { registerTextMenu } from './text/menu';

/**
 * Register default system context menus (replaces providers by id — safe to call again after HMR).
 */
export function registerDefaultMenus(): void {
  const manager = ContextMenuManager.getInstance();
  console.log('[DefaultMenus] Registering default context menus...');

  registerDesktopMenu(manager);
  registerLauncherItemMenu(manager);
  registerDesktopIconMenu(manager);
  registerFolderIconMenu(manager);
  registerFolderWindowMenu(manager);
  registerFolderWindowItemMenu(manager);
  registerFolderSidebarMenu(manager);
  registerFolderBreadcrumbMenu(manager);
  registerWindowMenu(manager);
  registerTextMenu(manager);

  console.log('[DefaultMenus] Default menus registered');
}

if (import.meta.hot) {
  import.meta.hot.accept(() => {
    registerDefaultMenus();
  });
}

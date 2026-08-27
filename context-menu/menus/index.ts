import { ContextMenuManager } from '../ContextMenuManager';
import { registerDesktopMenu } from './desktop/menu';
import { registerDesktopIconMenu } from './desktop-icon/menu';
import { registerFolderIconMenu } from './folder-icon/menu';
import { registerFolderWindowMenu } from './folder-window/menu';
import { registerFolderWindowItemMenu } from './folder-window-item/menu';
import { registerLauncherItemMenu } from './launcher-item/menu';
import { registerWindowMenu } from './window/menu';
import { registerTextMenu } from './text/menu';

let defaultMenusRegistered = false;

/**
 * Register default system context menus
 */
export function registerDefaultMenus(): void {
  if (defaultMenusRegistered) {
    console.log('[DefaultMenus] Default menus already registered, skipping...');
    return;
  }

  const manager = ContextMenuManager.getInstance();
  console.log('[DefaultMenus] Registering default context menus...');

  registerDesktopMenu(manager);
  registerLauncherItemMenu(manager);
  registerDesktopIconMenu(manager);
  registerFolderIconMenu(manager);
  registerFolderWindowMenu(manager);
  registerFolderWindowItemMenu(manager);
  registerWindowMenu(manager);
  registerTextMenu(manager);

  defaultMenusRegistered = true;
  console.log('[DefaultMenus] Default menus registered');
}

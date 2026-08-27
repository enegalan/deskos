import { useKernel } from '@core/kernel';
import { WindowManager } from '@window-manager/WindowManager';
import { Taskbar } from './Taskbar';
import { ContextMenuRenderer } from '../context-menu/Renderer';
import { eventBus, SystemEvents } from '@core/event-bus';
import { useEffect, useCallback, useRef, useState } from 'react';
import { registerDefaultMenus } from '../context-menu/menus';
import { DesktopIcons } from './DesktopIcons';
import { addDesktopShortcut, pixelToGrid, getFolderById, getGridSize } from '@core/desktop-shortcuts';
import { FolderWindow } from './FolderWindow';
import { getWallpaper, isWallpaperReference } from '@core/wallpaper-storage';
import { ToastContainer } from '@components/Toast';

export function Desktop() {
  const settings = useKernel((state) => state.settings);
  const desktopRef = useRef<HTMLDivElement>(null);
  const [wallpaperUrl, setWallpaperUrl] = useState<string>('');
  const [dragGridPosition, setDragGridPosition] = useState<{ x: number; y: number } | null>(null);

  // Load wallpaper from IndexedDB if it's a reference
  useEffect(() => {
    let cancelled = false;
    
    const loadWallpaper = async () => {
      if (!settings.wallpaper) {
        console.log('[Desktop] No wallpaper set');
        if (!cancelled) {
          setWallpaperUrl('');
        }
        return;
      }

      console.log('[Desktop] Loading wallpaper:', settings.wallpaper.substring(0, 50));

      // Check if it's a wallpaper reference ID
      if (isWallpaperReference(settings.wallpaper)) {
        console.log('[Desktop] Wallpaper is a reference, loading from IndexedDB...');
        const dataUrl = await getWallpaper(settings.wallpaper);
        if (!cancelled) {
          if (dataUrl) {
            console.log('[Desktop] Wallpaper loaded from IndexedDB, length:', dataUrl.length);
            setWallpaperUrl(dataUrl);
          } else {
            console.warn('[Desktop] Wallpaper not found in IndexedDB');
            setWallpaperUrl('');
          }
        }
      } else {
        // It's a gradient or direct data URL
        if (!cancelled) {
          console.log('[Desktop] Wallpaper is direct/gradient, using directly');
          setWallpaperUrl(settings.wallpaper);
        }
      }
    };

    loadWallpaper();

    return () => {
      cancelled = true;
    };
  }, [settings.wallpaper]);

  // Determine if wallpaper is a gradient or an image URL
  const isGradient = wallpaperUrl?.startsWith('linear-gradient') ||
                     wallpaperUrl?.startsWith('radial-gradient');

  // Build background style with all properties explicitly set
  const backgroundStyle: React.CSSProperties = wallpaperUrl
    ? isGradient
      ? { 
          background: wallpaperUrl,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          backgroundAttachment: 'fixed'
        }
      : { 
          // Use backgroundImage for images to avoid conflicts
          backgroundImage: `url(${wallpaperUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          backgroundAttachment: 'fixed',
          // Explicitly reset background to avoid CSS conflicts
          background: 'transparent'
        }
    : {
        // Clear all background properties when no wallpaper
        backgroundImage: 'none',
        background: 'transparent',
        backgroundSize: 'initial',
        backgroundPosition: 'initial',
        backgroundRepeat: 'initial',
        backgroundAttachment: 'initial'
      };

  // Debug logging
  useEffect(() => {
    if (wallpaperUrl) {
      console.log('[Desktop] Applying wallpaper style:', {
        isGradient,
        isDataUrl: wallpaperUrl.startsWith('data:'),
        style: backgroundStyle,
        wallpaperUrlLength: wallpaperUrl.length
      });
    }
  }, [wallpaperUrl, backgroundStyle, isGradient]);

  // Apply accent color dynamically
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--color-accent', settings.accentColor);
    
    // Calculate hover and glow colors (only if color is in hex format)
    if (settings.accentColor.startsWith('#')) {
      const hex = settings.accentColor.replace('#', '');
      if (hex.length === 6) {
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);
        
        if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
          const hoverR = Math.min(255, r + 30);
          const hoverG = Math.min(255, g + 30);
          const hoverB = Math.min(255, b + 30);
          root.style.setProperty('--color-accent-hover', `rgb(${hoverR}, ${hoverG}, ${hoverB})`);
          root.style.setProperty('--color-accent-glow', `rgba(${r}, ${g}, ${b}, 0.3)`);
        }
      }
    }
  }, [settings.accentColor]);

  // Register default context menus and wire up events
  useEffect(() => {
    // Register default system menus
    registerDefaultMenus();

    // Wire up context menu events to event bus
    const handleMenuOpen = (e: Event) => {
      const customEvent = e as CustomEvent;
      eventBus.emit(SystemEvents.CONTEXT_MENU_OPENED, customEvent.detail);
    };

    const handleMenuClose = () => {
      eventBus.emit(SystemEvents.CONTEXT_MENU_CLOSED, {});
    };

    document.addEventListener('contextmenu:menu:open', handleMenuOpen);
    document.addEventListener('contextmenu:menu:close', handleMenuClose);

    return () => {
      document.removeEventListener('contextmenu:menu:open', handleMenuOpen);
      document.removeEventListener('contextmenu:menu:close', handleMenuClose);
    };
  }, []);

  // Handle folder opening
  useEffect(() => {
    const handleOpenFolder = (e: Event) => {
      const customEvent = e as CustomEvent<{ folderId: string }>;
      const { folderId } = customEvent.detail;
      const folder = getFolderById(folderId);
      if (folder) {
        const kernel = useKernel.getState();
        kernel.createWindow(
          'folder',
          folder.icon,
          {
            title: folder.name,
            width: 800,
            height: 600,
            component: <FolderWindow folderId={folderId} />,
          }
        );
      }
    };

    window.addEventListener('open-folder', handleOpenFolder as EventListener);
    return () => {
      window.removeEventListener('open-folder', handleOpenFolder as EventListener);
    };
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Check if dragging an item from a folder window or taskbar
    // Note: getData only works in drop event, so we check types instead
    const types = Array.from(e.dataTransfer.types);
    const hasDeskosData = types.some(type => 
      type === 'application/x-deskos-shortcut-id' || 
      type === 'application/x-deskos-folder-id' || 
      type === 'application/x-deskos-program-id'
    );
    
    if (hasDeskosData && desktopRef.current) {
      const rect = desktopRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      // Check if mouse is over a window (not just desktop)
      const elementUnderMouse = document.elementFromPoint(e.clientX, e.clientY);
      const isOverWindow = elementUnderMouse?.closest('.window-container, .folder-window-main');
      
      if (!isOverWindow) {
        desktopRef.current.classList.add('drag-over');
        const gridPos = pixelToGrid(x, y);
        setDragGridPosition(gridPos);
      } else {
        desktopRef.current.classList.remove('drag-over');
        setDragGridPosition(null);
      }
      
      // Use 'copy' for program-id (from taskbar), 'move' for others
      const hasProgramId = types.includes('application/x-deskos-program-id');
      e.dataTransfer.dropEffect = hasProgramId ? 'copy' : 'move';
    } else {
      setDragGridPosition(null);
    }
  }, []);

  // Handle drag events from folder windows and taskbar (for visual feedback only)
  // Note: We don't preventDefault here to allow the React handler to work
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      if (!desktopRef.current) return;
      
      const types = Array.from(e.dataTransfer?.types || []);
      const hasDeskosData = types.some(type => 
        type === 'application/x-deskos-shortcut-id' || 
        type === 'application/x-deskos-folder-id' || 
        type === 'application/x-deskos-program-id'
      );
      
      if (hasDeskosData) {
        const rect = desktopRef.current.getBoundingClientRect();
        const isOverDesktop = e.clientX >= rect.left && e.clientX <= rect.right &&
                             e.clientY >= rect.top && e.clientY <= rect.bottom;
        
        // Check if mouse is over a window (not just desktop)
        const elementUnderMouse = document.elementFromPoint(e.clientX, e.clientY);
        const isOverWindow = elementUnderMouse?.closest('.window-container, .folder-window-main');
        
        if (isOverDesktop && !isOverWindow) {
          desktopRef.current.classList.add('drag-over');
          
          // Calculate grid position for visual indicator
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          const gridPos = pixelToGrid(x, y);
          setDragGridPosition(gridPos);
        } else {
          desktopRef.current.classList.remove('drag-over');
          setDragGridPosition(null);
        }
      } else {
        setDragGridPosition(null);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      if (!desktopRef.current) return;
      
      // Only remove drag-over if we're actually leaving the desktop
      const rect = desktopRef.current.getBoundingClientRect();
      const isOverDesktop = e.clientX >= rect.left && e.clientX <= rect.right &&
                           e.clientY >= rect.top && e.clientY <= rect.bottom;
      
      if (!isOverDesktop) {
        desktopRef.current.classList.remove('drag-over');
        setDragGridPosition(null);
      }
    };

    const handleDragEnd = () => {
      setDragGridPosition(null);
      if (desktopRef.current) {
        desktopRef.current.classList.remove('drag-over');
      }
    };

    // Use capture phase to ensure we see the event, but don't prevent default
    // The actual drop handling is done by the React handler on the desktop element
    document.addEventListener('dragover', handleDragOver, true);
    document.addEventListener('dragleave', handleDragLeave, true);
    document.addEventListener('dragend', handleDragEnd, true);
    
    return () => {
      document.removeEventListener('dragover', handleDragOver, true);
      document.removeEventListener('dragleave', handleDragLeave, true);
      document.removeEventListener('dragend', handleDragEnd, true);
    };
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (desktopRef.current) {
      desktopRef.current.classList.remove('drag-over');
      setDragGridPosition(null);
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (desktopRef.current) {
      desktopRef.current.classList.remove('drag-over');
      setDragGridPosition(null);
    }

    const desktopRect = desktopRef.current?.getBoundingClientRect();
    if (!desktopRect) return;

    const x = e.clientX - desktopRect.left;
    const y = e.clientY - desktopRect.top;
    const gridPos = pixelToGrid(x, y);

    // Check for items from folder windows
    const shortcutId = e.dataTransfer.getData('application/x-deskos-shortcut-id');
    const folderId = e.dataTransfer.getData('application/x-deskos-folder-id');
    
    if (shortcutId || folderId) {
      console.log('[Desktop] Drop: Moving item from folder to desktop', { shortcutId, folderId, gridPos });
      
      // Item being moved from a folder to desktop
      const { getDesktopFolders, getDesktopShortcuts, updateDesktopShortcutPosition, updateFolderPosition } = await import('@core/desktop-shortcuts');
      
      // Find the parent folder that contains this item
      const folders = getDesktopFolders();
      const parentFolder = folders.find(f => f.contents.includes(shortcutId || folderId || ''));
      
      console.log('[Desktop] Drop: Parent folder found', parentFolder?.id);
      
      if (parentFolder) {
        // Remove from parent folder first
        const { removeItemFromFolder } = await import('@core/desktop-shortcuts');
        removeItemFromFolder(parentFolder.id, shortcutId || folderId || '');
        console.log('[Desktop] Drop: Removed from folder');
      }
      
      // Verify the item exists and update its position
      if (shortcutId) {
        const shortcuts = getDesktopShortcuts();
        const shortcut = shortcuts.find(s => s.id === shortcutId);
        console.log('[Desktop] Drop: Shortcut found', shortcut);
        if (shortcut) {
          // Update position on desktop
          updateDesktopShortcutPosition(shortcutId, gridPos.x, gridPos.y);
          console.log('[Desktop] Drop: Updated shortcut position', { x: gridPos.x, y: gridPos.y });
        } else {
          console.error('[Desktop] Drop: Shortcut not found:', shortcutId);
        }
      } else if (folderId) {
        const folder = folders.find(f => f.id === folderId);
        console.log('[Desktop] Drop: Folder found', folder);
        if (folder) {
          // Update position on desktop
          updateFolderPosition(folderId, gridPos.x, gridPos.y);
          console.log('[Desktop] Drop: Updated folder position', { x: gridPos.x, y: gridPos.y });
        } else {
          console.error('[Desktop] Drop: Folder not found:', folderId);
        }
      }
      
      // Dispatch custom event to notify DesktopIcons to refresh
      window.dispatchEvent(new CustomEvent('desktop-shortcuts-updated'));
      console.log('[Desktop] Drop: Dispatched desktop-shortcuts-updated event');
      return;
    }

    // Handle new program from launcher/taskbar
    const programId = e.dataTransfer.getData('application/x-deskos-program-id');
    if (programId) {
      console.log('[Desktop] Drop: Creating shortcut from taskbar/launcher', programId, gridPos);
      try {
        addDesktopShortcut(programId, gridPos.x, gridPos.y);
        // Dispatch custom event to notify DesktopIcons to refresh
        window.dispatchEvent(new CustomEvent('desktop-shortcuts-updated'));
        console.log('[Desktop] Drop: Successfully created shortcut from taskbar');
      } catch (error) {
        console.error('[Desktop] Drop: Error creating shortcut from taskbar', error);
      }
    } else {
      console.log('[Desktop] Drop: No programId found in dataTransfer');
    }
  }, []);

  const gridSize = getGridSize();

  return (
    <div
      ref={desktopRef}
      className="desktop"
      style={backgroundStyle}
      data-theme={settings.theme}
      data-program-id="system"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dragGridPosition && (
        <div
          className="desktop-icon-grid-indicator"
          style={{
            position: 'absolute',
            left: `${dragGridPosition.x}px`,
            top: `${dragGridPosition.y}px`,
            width: `${gridSize}px`,
            height: `${gridSize}px`,
            pointerEvents: 'none',
            zIndex: 9999,
          }}
        />
      )}
      <div className="desktop-icons-container">
        <DesktopIcons />
      </div>
      <WindowManager />
      <Taskbar />
      <ContextMenuRenderer />
      <ToastContainer />
    </div>
  );
}

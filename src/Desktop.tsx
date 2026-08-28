import { useKernel } from '@core/kernel';
import { restoreDesktopSession } from '@core/context';
import { WindowManager } from '@window-manager/WindowManager';
import { Taskbar } from './Taskbar';
import { ContextMenuRenderer } from '../context-menu/Renderer';
import { eventBus, SystemEvents } from '@core/event-bus';
import { useEffect, useCallback, useRef, useState } from 'react';
import { registerDefaultMenus } from '../context-menu/menus';
import { DesktopIcons } from './DesktopIcons';
import {
  addDesktopShortcut,
  pixelToClampedGrid,
  getGridMetrics,
  DESKOS_ITEM_IDS_MIME,
  readDraggedItemIds,
} from '@core/desktop-shortcuts';
import { getWallpaper, isWallpaperReference } from '@core/wallpaper-storage';
import { getWallpaperTone, type WallpaperTone } from '../wallpapers/wallpapers';
import { ToastContainer } from '@components/Toast';

/** Desktop shell: wallpaper, icons, windows, dock, context menus, and drop targets. */
export function Desktop() {
  const settings = useKernel((state) => state.settings);
  const desktopRef = useRef<HTMLDivElement>(null);
  const [wallpaperUrl, setWallpaperUrl] = useState<string>('');
  const [wallpaperTone, setWallpaperTone] = useState<WallpaperTone>('dark');
  const [dragGridPosition, setDragGridPosition] = useState<{ x: number; y: number } | null>(null);

  // Restore open windows from the last desktop session
  useEffect(() => {
    void restoreDesktopSession();
  }, []);

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

  const isGradient =
    wallpaperUrl?.startsWith('linear-gradient') || wallpaperUrl?.startsWith('radial-gradient');
  const isSolidColor = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(
    wallpaperUrl?.trim() || ''
  );

  // Build background style with all properties explicitly set
  const backgroundStyle: React.CSSProperties = wallpaperUrl
    ? isGradient
      ? {
          backgroundImage: wallpaperUrl,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          backgroundAttachment: 'fixed',
        }
      : isSolidColor
        ? {
            // Shorthand clears CSS fallback gradient on .desktop
            background: wallpaperUrl,
          }
        : {
            backgroundImage: `url(${wallpaperUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            backgroundAttachment: 'fixed',
          }
    : {};

  // Debug logging
  useEffect(() => {
    if (wallpaperUrl) {
      console.log('[Desktop] Applying wallpaper style:', {
        isGradient,
        isDataUrl: wallpaperUrl.startsWith('data:'),
        style: backgroundStyle,
        wallpaperUrlLength: wallpaperUrl.length,
      });
    }
  }, [wallpaperUrl, backgroundStyle, isGradient]);

  // Icon contrast follows wallpaper brightness, not UI theme
  useEffect(() => {
    let cancelled = false;
    getWallpaperTone(wallpaperUrl).then((tone) => {
      if (!cancelled) {
        setWallpaperTone(tone);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [wallpaperUrl]);

  // Apply accent color dynamically
  useEffect(() => {
    const root = document.documentElement;
    const accent = settings.accentColor;
    root.style.setProperty('--color-accent', accent);

    if (!accent.startsWith('#')) {
      return;
    }

    const hex = accent.replace('#', '');
    if (hex.length !== 6) {
      return;
    }

    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) {
      return;
    }

    const hoverR = Math.min(255, r + 30);
    const hoverG = Math.min(255, g + 30);
    const hoverB = Math.min(255, b + 30);
    root.style.setProperty('--color-accent-rgb', `${r}, ${g}, ${b}`);
    root.style.setProperty('--color-accent-hover', `rgb(${hoverR}, ${hoverG}, ${hoverB})`);
    root.style.setProperty('--color-accent-glow', `rgba(${r}, ${g}, ${b}, 0.3)`);
    root.style.setProperty('--color-border-focus', `rgba(${r}, ${g}, ${b}, 0.6)`);
  }, [settings.accentColor]);

  // Theme on <html> so portals (e.g. context-menu submenus) inherit light/dark tokens
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

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

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Check if dragging an item from a folder window or taskbar
    // Note: getData only works in drop event, so we check types instead
    const types = Array.from(e.dataTransfer.types);
    const hasDeskosData = types.some(
      (type) =>
        type === 'application/x-deskos-shortcut-id' ||
        type === 'application/x-deskos-folder-id' ||
        type === 'application/x-deskos-program-id' ||
        type === DESKOS_ITEM_IDS_MIME
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
        const gridPos = pixelToClampedGrid(x, y, { width: rect.width, height: rect.height });
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
      const hasDeskosData = types.some(
        (type) =>
          type === 'application/x-deskos-shortcut-id' ||
          type === 'application/x-deskos-folder-id' ||
          type === 'application/x-deskos-program-id' ||
          type === DESKOS_ITEM_IDS_MIME
      );

      if (hasDeskosData) {
        const rect = desktopRef.current.getBoundingClientRect();
        const isOverDesktop =
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom;

        // Check if mouse is over a window (not just desktop)
        const elementUnderMouse = document.elementFromPoint(e.clientX, e.clientY);
        const isOverWindow = elementUnderMouse?.closest('.window-container, .folder-window-main');

        if (isOverDesktop && !isOverWindow) {
          desktopRef.current.classList.add('drag-over');

          // Calculate grid position for visual indicator
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          const gridPos = pixelToClampedGrid(x, y, { width: rect.width, height: rect.height });
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
      const isOverDesktop =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;

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
    const gridPos = pixelToClampedGrid(x, y, {
      width: desktopRect.width,
      height: desktopRect.height,
    });

    // Check for items from folder windows
    const itemIds = readDraggedItemIds(e.dataTransfer);

    if (itemIds.length > 0) {
      console.log('[Desktop] Drop: Moving items from folder to desktop', { itemIds, gridPos });

      const {
        getDesktopFolders,
        getDesktopShortcuts,
        updateDesktopShortcutPosition,
        updateFolderPosition,
        removeItemFromFolder,
        clampGridPosition,
      } = await import('@core/desktop-shortcuts');

      const folders = getDesktopFolders();
      const shortcuts = getDesktopShortcuts();

      const primaryId = itemIds[0];
      const primaryItem =
        shortcuts.find((s) => s.id === primaryId) || folders.find((f) => f.id === primaryId);
      const primaryOrigin = primaryItem
        ? { x: primaryItem.x, y: primaryItem.y }
        : { x: gridPos.x, y: gridPos.y };

      for (const itemId of itemIds) {
        const parentFolder = folders.find((f) => f.contents.includes(itemId));
        if (parentFolder) {
          removeItemFromFolder(parentFolder.id, itemId);
        }

        const shortcut = shortcuts.find((s) => s.id === itemId);
        const folder = folders.find((f) => f.id === itemId);
        const origin = shortcut
          ? { x: shortcut.x, y: shortcut.y }
          : folder
            ? { x: folder.x, y: folder.y }
            : primaryOrigin;
        const offsetX = origin.x - primaryOrigin.x;
        const offsetY = origin.y - primaryOrigin.y;
        const pos = clampGridPosition(gridPos.x + offsetX, gridPos.y + offsetY, {
          width: desktopRect.width,
          height: desktopRect.height,
        });

        if (shortcut) {
          updateDesktopShortcutPosition(itemId, pos.x, pos.y);
        } else if (folder) {
          updateFolderPosition(itemId, pos.x, pos.y);
        }
      }

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

  const { cellWidth, cellHeight } = getGridMetrics();

  return (
    <div
      ref={desktopRef}
      className="desktop"
      style={backgroundStyle}
      data-theme={settings.theme}
      data-wallpaper-tone={wallpaperTone}
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
            width: `${cellWidth}px`,
            height: `${cellHeight}px`,
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

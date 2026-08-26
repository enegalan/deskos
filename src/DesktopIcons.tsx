import { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import { programs } from 'virtual:programs';
import { launchOrFocusProgram } from '@core/context';
import { useKernel } from '@core/kernel';
import { Icon } from '../components/Icon';
import { hasIcon, type IconName } from '@core/icons';
import {
  getDesktopShortcuts,
  getDesktopFolders,
  updateDesktopShortcutPosition,
  findItemAtPosition,
  swapItemPositions,
  pixelToGrid,
  getGridSize,
  addItemToFolder,
  isDesktopFolder,
  type DesktopShortcut,
  type DesktopFolder,
} from '@core/desktop-shortcuts';
import { registerSelectAllHandler } from '@core/selection';
import { registerCopyHandler, registerCutHandler, registerPasteHandler, copy as clipboardCopy, cut as clipboardCut, getClipboard, clearClipboard, type ClipboardItem } from '@core/clipboard';

function setDragOverTarget(itemId: string | null) {
  document.querySelectorAll('.desktop-icon').forEach((el) => {
    el.classList.remove('drag-over-target');
  });
  if (itemId) {
    const target = document.querySelector(
      `[data-shortcut-id="${itemId}"], [data-folder-id="${itemId}"]`
    );
    target?.classList.add('drag-over-target');
  }
}

interface DesktopIconProps {
  shortcut: DesktopShortcut;
  program: {
    id: string;
    name: string;
    icon: string;
  };
  onUpdate: () => void;
  isSelected: boolean;
  onSelect: (e?: React.MouseEvent, forceSingle?: boolean) => void;
}

const DesktopIcon = memo(function DesktopIcon({ shortcut, program, onUpdate, isSelected, onSelect }: DesktopIconProps) {
  const settings = useKernel((state) => state.settings);
  const [isDragging, setIsDragging] = useState(false);
  const [visualPosition, setVisualPosition] = useState({ x: shortcut.x, y: shortcut.y });
  const [gridPosition, setGridPosition] = useState<{ x: number; y: number } | null>(null);
  const [isOverFolderWindow, setIsOverFolderWindow] = useState(false);
  const iconRef = useRef<HTMLDivElement>(null);
  const lastClickTimeRef = useRef<number>(0);
  const clickTimeoutRef = useRef<number | null>(null);
  const dragStateRef = useRef<{
    isDragging: boolean;
    offsetX: number;
    offsetY: number;
    startX: number;
    startY: number;
    animationFrame: number | null;
    lastPosition: { x: number; y: number } | null;
  }>({ isDragging: false, offsetX: 0, offsetY: 0, startX: 0, startY: 0, animationFrame: null, lastPosition: null });

  const handleLaunch = useCallback(async () => {
    await launchOrFocusProgram(shortcut.programId);
  }, [shortcut.programId]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    // Don't trigger click if we were dragging
    if (dragStateRef.current.isDragging) {
      return;
    }
    
    const now = Date.now();
    const timeSinceLastClick = now - lastClickTimeRef.current;
    
    if (timeSinceLastClick < 300 && timeSinceLastClick > 0) {
      // Double click detected
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;
      }
      handleLaunch();
      lastClickTimeRef.current = 0;
    } else {
      // Single click - select the icon and wait to see if it becomes a double click
      onSelect(e);
      lastClickTimeRef.current = now;
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }
      clickTimeoutRef.current = window.setTimeout(() => {
        clickTimeoutRef.current = null;
        lastClickTimeRef.current = 0;
      }, 300);
    }
  }, [handleLaunch, onSelect]);

  // Update visual position when shortcut position changes externally
  useEffect(() => {
    if (!isDragging && !dragStateRef.current.isDragging) {
      // Only update if the position actually changed to avoid overwriting during drag
      if (visualPosition.x !== shortcut.x || visualPosition.y !== shortcut.y) {
        setVisualPosition({ x: shortcut.x, y: shortcut.y });
      }
    }
  }, [shortcut.x, shortcut.y, isDragging, visualPosition.x, visualPosition.y]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return; // Only handle left mouse button
      
      const desktopElement = document.querySelector('.desktop');
      const desktopRect = desktopElement?.getBoundingClientRect();
      if (!desktopRect || !iconRef.current) return;
      
      // Calculate offset immediately on mouse down for precise tracking
      const iconRect = iconRef.current.getBoundingClientRect();
      const iconXRelativeToDesktop = iconRect.left - desktopRect.left;
      const iconYRelativeToDesktop = iconRect.top - desktopRect.top;
      
      // Offset is the distance from click point to icon's top-left corner
      const initialOffsetX = e.clientX - desktopRect.left - iconXRelativeToDesktop;
      const initialOffsetY = e.clientY - desktopRect.top - iconYRelativeToDesktop;
      
      const startX = e.clientX;
      const startY = e.clientY;
      let hasMoved = false;
      
      const updatePosition = (moveEvent: MouseEvent) => {
        if (!iconRef.current || !desktopElement) return;
        
        // Check if icon is over a folder window - if so, don't show grid indicator
        const elementUnderMouse = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
        const folderWindowMain = elementUnderMouse?.closest('.folder-window-main');
        const isOverFolderWindow = !!folderWindowMain;
        
        // If over a folder window, don't calculate grid position or show indicator
        if (isOverFolderWindow) {
          setGridPosition(null);
          setDragOverTarget(null);
          return;
        }
        
        const gridSize = getGridSize();
        const currentDesktopRect = desktopElement.getBoundingClientRect();
        
        // Calculate position relative to desktop
        let rawX = moveEvent.clientX - currentDesktopRect.left - initialOffsetX;
        let rawY = moveEvent.clientY - currentDesktopRect.top - initialOffsetY;
        
        // Get icon dimensions for boundary checking
        const iconWidth = settings.iconSpacing;
        const iconHeight = settings.iconSpacing;
        
        // Constrain position to desktop bounds
        const minX = 0;
        const minY = 0;
        const maxX = currentDesktopRect.width - iconWidth;
        const maxY = currentDesktopRect.height - iconHeight;
        
        rawX = Math.max(minX, Math.min(maxX, rawX));
        rawY = Math.max(minY, Math.min(maxY, rawY));
        
        // Snap to grid for final positioning
        const gridPos = pixelToGrid(rawX, rawY);
        
        // Ensure grid position is also within bounds
        gridPos.x = Math.max(0, Math.min(Math.floor((currentDesktopRect.width - iconWidth) / gridSize) * gridSize, gridPos.x));
        gridPos.y = Math.max(0, Math.min(Math.floor((currentDesktopRect.height - iconHeight) / gridSize) * gridSize, gridPos.y));
        
        setVisualPosition({ x: rawX, y: rawY });
        setGridPosition(gridPos);
        dragStateRef.current.lastPosition = gridPos;
        
        const collidingItem = findItemAtPosition(gridPos.x, gridPos.y, shortcut.id);
        setDragOverTarget(collidingItem?.id ?? null);
      };
      
      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaX = Math.abs(moveEvent.clientX - startX);
        const deltaY = Math.abs(moveEvent.clientY - startY);
        
        // Only start dragging if mouse moved more than 5px
        if ((deltaX > 5 || deltaY > 5) && !hasMoved) {
          hasMoved = true;
          // Select the icon when dragging starts (force single selection)
          onSelect(undefined as any, true);
          if (iconRef.current) {
            dragStateRef.current = {
              isDragging: true,
              offsetX: initialOffsetX,
              offsetY: initialOffsetY,
              startX: shortcut.x,
              startY: shortcut.y,
              animationFrame: null,
              lastPosition: null,
            };
            setIsDragging(true);
            iconRef.current.style.zIndex = '10000';
          }
        }
        
        // Continue dragging if already started
        if (hasMoved && dragStateRef.current.isDragging) {
          // Check if mouse is over a folder window or desktop
          const elementUnderMouse = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
          const folderWindowMain = elementUnderMouse?.closest('.folder-window-main');
          const desktopElement = elementUnderMouse?.closest('.desktop');
          
          // When over a window, increase z-index of container to keep icon visible
          if (iconRef.current) {
            const container = iconRef.current.closest('.desktop-icons-container');
            if (folderWindowMain) {
              setIsOverFolderWindow(true);
              if (container) {
                container.classList.add('dragging-over-window');
              }
              iconRef.current.style.zIndex = '100000';
              folderWindowMain.classList.add('drag-over');
              iconRef.current.classList.add('dragging-over-folder');
            } else if (desktopElement) {
              setIsOverFolderWindow(false);
              if (container) {
                container.classList.remove('dragging-over-window');
              }
              iconRef.current.style.zIndex = '10000';
              desktopElement.classList.add('drag-over');
              iconRef.current.classList.add('dragging-over-desktop');
            } else {
              setIsOverFolderWindow(false);
              if (container) {
                container.classList.remove('dragging-over-window');
              }
              iconRef.current.style.zIndex = '10000';
              iconRef.current.classList.remove('dragging-over-folder', 'dragging-over-desktop');
              document.querySelectorAll('.folder-window-main, .desktop').forEach(el => {
                el.classList.remove('drag-over');
              });
            }
          }
          
          // Cancel previous animation frame if exists
          if (dragStateRef.current.animationFrame !== null) {
            cancelAnimationFrame(dragStateRef.current.animationFrame);
          }
          
          // Use requestAnimationFrame for smooth updates
          dragStateRef.current.animationFrame = requestAnimationFrame(() => {
            updatePosition(moveEvent);
          });
        }
      };
      
      const handleMouseUp = (e?: MouseEvent) => {
        // Cancel any pending animation frame
        if (dragStateRef.current.animationFrame !== null) {
          cancelAnimationFrame(dragStateRef.current.animationFrame);
          dragStateRef.current.animationFrame = null;
        }
        
        // Remove dragging-over-window class from container
        const container = iconRef.current?.closest('.desktop-icons-container');
        if (container) {
          container.classList.remove('dragging-over-window');
        }
        
        // Reset z-index
        if (iconRef.current) {
          iconRef.current.style.zIndex = '';
        }
        
        setDragOverTarget(null);
        document.querySelectorAll('.desktop-icon').forEach((el) => {
          el.classList.remove('dragging-over-folder', 'dragging-over-desktop');
        });
        
        // Remove drag-over classes from windows and desktop
        document.querySelectorAll('.folder-window-main, .desktop').forEach((el) => {
          el.classList.remove('drag-over');
        });
        
        if (hasMoved && dragStateRef.current.isDragging) {
          // Check if mouse is over a folder window
          let handledByFolderWindow = false;
          if (e) {
            const elementUnderMouse = document.elementFromPoint(e.clientX, e.clientY);
            const folderWindowMain = elementUnderMouse?.closest('.folder-window-main');
            if (folderWindowMain) {
              // Get the folder window's current path
              const folderSelection = (window as any).__folderSelection as { ids: string[]; path: string } | undefined;
              if (folderSelection?.path) {
                handledByFolderWindow = true;
                Promise.all([
                  import('@core/file-system'),
                  import('@core/desktop-shortcuts')
                ]).then(([{ resolvePath }, { getFolderByPath, addItemToFolder }]) => {
                  const resolved = resolvePath(folderSelection.path);
                  if (resolved.type === 'folder') {
                    const targetFolder = getFolderByPath(folderSelection.path);
                    if (targetFolder) {
                      // Add shortcut to the folder
                      addItemToFolder(targetFolder.id, shortcut.id);
                      // Reset visual position since item is now in folder
                      setVisualPosition({ x: shortcut.x, y: shortcut.y });
                      // Dispatch event to update folder window
                      window.dispatchEvent(new CustomEvent('desktop-shortcuts-updated'));
                    }
                  }
                });
              }
            }
          }

          // If handled by folder window, skip desktop collision check
          if (handledByFolderWindow) {
            // Reset dragging state
            dragStateRef.current.isDragging = false;
            setIsDragging(false);
            setGridPosition(null);
            setIsOverFolderWindow(false);
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp as EventListener);
            return;
          }

          const desktopElement = document.querySelector('.desktop');
          if (desktopElement && iconRef.current) {
            // Calculate final position based on last mouse position
            // Use the last calculated grid position for final placement
            const finalPos = dragStateRef.current.lastPosition;
            
            if (finalPos) {
              // Check for collision at final position with any item
              const collidingItem = findItemAtPosition(finalPos.x, finalPos.y, shortcut.id);
              
              if (collidingItem) {
                // If colliding with a folder, add the shortcut to the folder
                if (isDesktopFolder(collidingItem)) {
                  addItemToFolder(collidingItem.id, shortcut.id);
                  // Reset visual position to original position since item is now in folder
                  setVisualPosition({ x: shortcut.x, y: shortcut.y });
                } else {
                  // If colliding with another shortcut, swap positions
                  const targetX = collidingItem.x;
                  const targetY = collidingItem.y;
                  
                  swapItemPositions(shortcut.id, collidingItem.id);
                  
                  setVisualPosition({ x: targetX, y: targetY });
                }
                // Don't call onUpdate() here - addItemToFolder/swapItemPositions already dispatches the event
              } else {
                // Update position normally
                updateDesktopShortcutPosition(shortcut.id, finalPos.x, finalPos.y);
                // Update visual position to final grid position
                setVisualPosition({ x: finalPos.x, y: finalPos.y });
                // Call onUpdate for normal position updates
                onUpdate();
              }
            } else {
              // No final position, just call onUpdate
              onUpdate();
            }
            
            // Reset z-index
            if (iconRef.current) {
              iconRef.current.style.zIndex = '';
            }
            
            // Reset last position
            dragStateRef.current.lastPosition = null;
            setGridPosition(null);
          }
          
          // Reset dragging state
          dragStateRef.current.isDragging = false;
          setIsDragging(false);
          setGridPosition(null);
          setIsOverFolderWindow(false);
        }
        
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
      
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [shortcut.id, shortcut.x, shortcut.y, visualPosition, onUpdate, settings.iconSpacing, onSelect]
  );


  const displayName = shortcut.customName || program.name;
  const gridSize = getGridSize();

  return (
    <>
      {isDragging && gridPosition && !isOverFolderWindow && (
        <div
          className="desktop-icon-grid-indicator"
          style={{
            left: `${gridPosition.x}px`,
            top: `${gridPosition.y}px`,
            width: `${gridSize}px`,
            height: `${gridSize}px`,
          }}
        />
      )}
      <div
        ref={iconRef}
        className={`desktop-icon ${isDragging ? 'dragging' : ''} ${isSelected ? 'selected' : ''}`}
        style={{
          left: `${visualPosition.x}px`,
          top: `${visualPosition.y}px`,
          width: `${settings.iconSpacing}px`,
          transition: isDragging ? 'none' : 'left 0.2s ease-out, top 0.2s ease-out',
        }}
        onMouseDown={handleMouseDown}
        onClick={(e) => {
          e.stopPropagation();
          handleClick(e);
        }}
        data-program-id={shortcut.programId}
        data-shortcut-id={shortcut.id}
      >
        <div 
          className="desktop-icon-image"
          style={{
            width: `${settings.iconSize}px`,
            height: `${settings.iconSize}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {hasIcon(program.icon as IconName) ? (
            <Icon 
              name={program.icon as IconName} 
              size={settings.iconSize * 0.8}
              fallback={typeof program.icon === 'string' && !hasIcon(program.icon as IconName) ? program.icon : undefined}
            />
          ) : (
            <span style={{ fontSize: `${settings.iconSize * 0.7}px` }}>{program.icon}</span>
          )}
        </div>
        {settings.showIconLabels && (
          <div className="desktop-icon-label">{displayName}</div>
        )}
      </div>
    </>
  );
});

interface FolderIconProps {
  folder: DesktopFolder;
  onUpdate: () => void;
  onOpen: (folderId: string) => void;
  isSelected: boolean;
  onSelect: (e?: React.MouseEvent, forceSingle?: boolean) => void;
}

const FolderIcon = memo(function FolderIcon({ folder, onUpdate, onOpen, isSelected, onSelect }: FolderIconProps) {
  const settings = useKernel((state) => state.settings);
  const [isDragging, setIsDragging] = useState(false);
  const [visualPosition, setVisualPosition] = useState({ x: folder.x, y: folder.y });
  const [gridPosition, setGridPosition] = useState<{ x: number; y: number } | null>(null);
  const [isOverFolderWindow, setIsOverFolderWindow] = useState(false);
  const iconRef = useRef<HTMLDivElement>(null);
  const lastClickTimeRef = useRef<number>(0);
  const clickTimeoutRef = useRef<number | null>(null);
  const dragStateRef = useRef<{
    isDragging: boolean;
    offsetX: number;
    offsetY: number;
    startX: number;
    startY: number;
    animationFrame: number | null;
    lastPosition: { x: number; y: number } | null;
  }>({ isDragging: false, offsetX: 0, offsetY: 0, startX: 0, startY: 0, animationFrame: null, lastPosition: null });

  const handleOpen = useCallback(() => {
    onOpen(folder.id);
  }, [folder.id, onOpen]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (dragStateRef.current.isDragging) {
      return;
    }
    
    const now = Date.now();
    const timeSinceLastClick = now - lastClickTimeRef.current;
    
    if (timeSinceLastClick < 300 && timeSinceLastClick > 0) {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;
      }
      handleOpen();
      lastClickTimeRef.current = 0;
    } else {
      // Single click - select the folder and wait to see if it becomes a double click
      onSelect(e);
      lastClickTimeRef.current = now;
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }
      clickTimeoutRef.current = window.setTimeout(() => {
        clickTimeoutRef.current = null;
        lastClickTimeRef.current = 0;
      }, 300);
    }
  }, [handleOpen, onSelect]);

  useEffect(() => {
    if (!isDragging && !dragStateRef.current.isDragging) {
      // Only update if the position actually changed to avoid overwriting during drag
      if (visualPosition.x !== folder.x || visualPosition.y !== folder.y) {
        setVisualPosition({ x: folder.x, y: folder.y });
      }
    }
  }, [folder.x, folder.y, isDragging, visualPosition.x, visualPosition.y]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      
      const desktopElement = document.querySelector('.desktop');
      const desktopRect = desktopElement?.getBoundingClientRect();
      if (!desktopRect || !iconRef.current) return;
      
      const iconRect = iconRef.current.getBoundingClientRect();
      const iconXRelativeToDesktop = iconRect.left - desktopRect.left;
      const iconYRelativeToDesktop = iconRect.top - desktopRect.top;
      
      const initialOffsetX = e.clientX - desktopRect.left - iconXRelativeToDesktop;
      const initialOffsetY = e.clientY - desktopRect.top - iconYRelativeToDesktop;
      
      const startX = e.clientX;
      const startY = e.clientY;
      let hasMoved = false;
      
      const updatePosition = (moveEvent: MouseEvent) => {
        if (!desktopElement || !iconRef.current) return;
        
        // Check if icon is over a folder window - if so, don't show grid indicator
        const elementUnderMouse = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
        const folderWindowMain = elementUnderMouse?.closest('.folder-window-main');
        const isOverFolderWindow = !!folderWindowMain;
        
        // If over a folder window, don't calculate grid position or show indicator
        if (isOverFolderWindow) {
          setGridPosition(null);
          setDragOverTarget(null);
          return;
        }
        
        const gridSize = getGridSize();
        const currentDesktopRect = desktopElement.getBoundingClientRect();
        let rawX = moveEvent.clientX - currentDesktopRect.left - initialOffsetX;
        let rawY = moveEvent.clientY - currentDesktopRect.top - initialOffsetY;
        
        // Get icon dimensions for boundary checking
        const iconWidth = settings.iconSpacing;
        const iconHeight = settings.iconSpacing;
        
        // Constrain position to desktop bounds
        const minX = 0;
        const minY = 0;
        const maxX = currentDesktopRect.width - iconWidth;
        const maxY = currentDesktopRect.height - iconHeight;
        
        rawX = Math.max(minX, Math.min(maxX, rawX));
        rawY = Math.max(minY, Math.min(maxY, rawY));
        
        const gridPos = pixelToGrid(rawX, rawY);
        
        // Ensure grid position is also within bounds
        gridPos.x = Math.max(0, Math.min(Math.floor((currentDesktopRect.width - iconWidth) / gridSize) * gridSize, gridPos.x));
        gridPos.y = Math.max(0, Math.min(Math.floor((currentDesktopRect.height - iconHeight) / gridSize) * gridSize, gridPos.y));
        
        setVisualPosition({ x: rawX, y: rawY });
        setGridPosition(gridPos);
        dragStateRef.current.lastPosition = gridPos;
        
        const collidingItem = findItemAtPosition(gridPos.x, gridPos.y, folder.id);
        setDragOverTarget(collidingItem?.id ?? null);
      };
      
      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaX = Math.abs(moveEvent.clientX - startX);
        const deltaY = Math.abs(moveEvent.clientY - startY);
        
        if ((deltaX > 5 || deltaY > 5) && !hasMoved) {
          hasMoved = true;
          // Select the folder when dragging starts (force single selection)
          onSelect(undefined as any, true);
          if (iconRef.current) {
            dragStateRef.current = {
              isDragging: true,
              offsetX: initialOffsetX,
              offsetY: initialOffsetY,
              startX: folder.x,
              startY: folder.y,
              animationFrame: null,
              lastPosition: null,
            };
            setIsDragging(true);
            iconRef.current.style.zIndex = '10000';
          }
        }
        
        if (hasMoved && dragStateRef.current.isDragging) {
          // Check if mouse is over a folder window or desktop
          const elementUnderMouse = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
          const folderWindowMain = elementUnderMouse?.closest('.folder-window-main');
          const desktopElement = elementUnderMouse?.closest('.desktop');
          
          // When over a window, increase z-index of container to keep icon visible
          if (iconRef.current) {
            const container = iconRef.current.closest('.desktop-icons-container');
            if (folderWindowMain) {
              setIsOverFolderWindow(true);
              if (container) {
                container.classList.add('dragging-over-window');
              }
              iconRef.current.style.zIndex = '100000';
              folderWindowMain.classList.add('drag-over');
              iconRef.current.classList.add('dragging-over-folder');
            } else if (desktopElement) {
              setIsOverFolderWindow(false);
              if (container) {
                container.classList.remove('dragging-over-window');
              }
              iconRef.current.style.zIndex = '10000';
              desktopElement.classList.add('drag-over');
              iconRef.current.classList.add('dragging-over-desktop');
            } else {
              setIsOverFolderWindow(false);
              if (container) {
                container.classList.remove('dragging-over-window');
              }
              iconRef.current.style.zIndex = '10000';
              iconRef.current.classList.remove('dragging-over-folder', 'dragging-over-desktop');
              document.querySelectorAll('.folder-window-main, .desktop').forEach(el => {
                el.classList.remove('drag-over');
              });
            }
          }
          
          if (dragStateRef.current.animationFrame !== null) {
            cancelAnimationFrame(dragStateRef.current.animationFrame);
          }
          
          dragStateRef.current.animationFrame = requestAnimationFrame(() => {
            updatePosition(moveEvent);
          });
        }
      };
      
      const handleMouseUp = (e?: MouseEvent) => {
        if (dragStateRef.current.animationFrame !== null) {
          cancelAnimationFrame(dragStateRef.current.animationFrame);
          dragStateRef.current.animationFrame = null;
        }
        
        // Remove dragging-over-window class from container
        const container = iconRef.current?.closest('.desktop-icons-container');
        if (container) {
          container.classList.remove('dragging-over-window');
        }
        
        // Reset z-index
        if (iconRef.current) {
          iconRef.current.style.zIndex = '';
        }
        
        setDragOverTarget(null);
        document.querySelectorAll('.desktop-icon').forEach((el) => {
          el.classList.remove('dragging-over-folder', 'dragging-over-desktop');
        });
        
        // Remove drag-over classes from windows and desktop
        document.querySelectorAll('.folder-window-main, .desktop').forEach((el) => {
          el.classList.remove('drag-over');
        });
        
        if (hasMoved && dragStateRef.current.isDragging) {
          // Check if mouse is over a folder window
          let handledByFolderWindow = false;
          if (e) {
            const elementUnderMouse = document.elementFromPoint(e.clientX, e.clientY);
            const folderWindowMain = elementUnderMouse?.closest('.folder-window-main');
            if (folderWindowMain) {
              // Get the folder window's current path
              const folderSelection = (window as any).__folderSelection as { ids: string[]; path: string } | undefined;
              if (folderSelection?.path) {
                handledByFolderWindow = true;
                Promise.all([
                  import('@core/file-system'),
                  import('@core/desktop-shortcuts')
                ]).then(([{ resolvePath }, { getFolderByPath, addItemToFolder }]) => {
                  const resolved = resolvePath(folderSelection.path);
                  if (resolved.type === 'folder') {
                    const targetFolder = getFolderByPath(folderSelection.path);
                    if (targetFolder && targetFolder.id !== folder.id) {
                      // Add folder to the target folder
                      addItemToFolder(targetFolder.id, folder.id);
                      // Reset visual position since folder is now inside another folder
                      setVisualPosition({ x: folder.x, y: folder.y });
                      // Dispatch event to update folder window
                      window.dispatchEvent(new CustomEvent('desktop-shortcuts-updated'));
                    }
                  }
                });
              }
            }
          }

          // If handled by folder window, skip desktop collision check
          if (handledByFolderWindow) {
            // Reset dragging state
            dragStateRef.current.isDragging = false;
            setIsDragging(false);
            setGridPosition(null);
            setIsOverFolderWindow(false);
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp as EventListener);
            return;
          }

          const finalPos = dragStateRef.current.lastPosition;
          
          if (finalPos) {
            // Check for collision at final position with any item
            const collidingItem = findItemAtPosition(finalPos.x, finalPos.y, folder.id);
            
            if (collidingItem) {
              // If colliding with a folder, add this folder to the target folder
              if (isDesktopFolder(collidingItem)) {
                addItemToFolder(collidingItem.id, folder.id);
                // Reset visual position to original position since folder is now inside another folder
                setVisualPosition({ x: folder.x, y: folder.y });
              } else {
                // If colliding with a shortcut, swap positions
                const targetX = collidingItem.x;
                const targetY = collidingItem.y;
                
                swapItemPositions(folder.id, collidingItem.id);
                
                setVisualPosition({ x: targetX, y: targetY });
              }
              // Don't call onUpdate() here - addItemToFolder/swapItemPositions already dispatches the event
            } else {
              // Update position normally
              import('@core/desktop-shortcuts').then(({ updateFolderPosition }) => {
                updateFolderPosition(folder.id, finalPos.x, finalPos.y);
                // Update visual position to final grid position
                setVisualPosition({ x: finalPos.x, y: finalPos.y });
                // Call onUpdate for normal position updates
                onUpdate();
              });
            }
          } else {
            // No final position, just call onUpdate
            onUpdate();
          }
          
          if (iconRef.current) {
            iconRef.current.style.zIndex = '';
          }
          
          dragStateRef.current.lastPosition = null;
          setGridPosition(null);
        }
        
        // Reset dragging state
        dragStateRef.current.isDragging = false;
        setIsDragging(false);
        setGridPosition(null);
        setIsOverFolderWindow(false);
        
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp as EventListener);
      };
      
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [folder.id, folder.x, folder.y, visualPosition, onUpdate, settings.iconSpacing, onSelect]
  );

  const gridSize = getGridSize();

  return (
    <>
      {isDragging && gridPosition && !isOverFolderWindow && (
        <div
          className="desktop-icon-grid-indicator"
          style={{
            left: `${gridPosition.x}px`,
            top: `${gridPosition.y}px`,
            width: `${gridSize}px`,
            height: `${gridSize}px`,
          }}
        />
      )}
      <div
        ref={iconRef}
        className={`desktop-icon folder-icon ${isDragging ? 'dragging' : ''} ${isSelected ? 'selected' : ''}`}
        style={{
          left: `${visualPosition.x}px`,
          top: `${visualPosition.y}px`,
          width: `${settings.iconSpacing}px`,
          transition: isDragging ? 'none' : 'left 0.2s ease-out, top 0.2s ease-out',
        }}
        onMouseDown={handleMouseDown}
        onClick={(e) => {
          e.stopPropagation();
          handleClick(e);
        }}
        data-folder-id={folder.id}
      >
        <div 
          className="desktop-icon-image"
          style={{
            width: `${settings.iconSize}px`,
            height: `${settings.iconSize}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {hasIcon(folder.icon as IconName) ? (
            <Icon 
              name={folder.icon as IconName} 
              size={settings.iconSize * 0.8}
              fallback={typeof folder.icon === 'string' && !hasIcon(folder.icon as IconName) ? folder.icon : undefined}
            />
          ) : (
            <span style={{ fontSize: `${settings.iconSize * 0.7}px` }}>{folder.icon}</span>
          )}
        </div>
        {settings.showIconLabels && (
          <div className="desktop-icon-label">{folder.name}</div>
        )}
      </div>
    </>
  );
});

export function DesktopIcons() {
  const [shortcuts, setShortcuts] = useState<DesktopShortcut[]>([]);
  const [folders, setFolders] = useState<DesktopFolder[]>([]);
  const [programData, setProgramData] = useState<Record<string, { id: string; name: string; icon: string }>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lastSelectedIndexRef = useRef<number>(-1);

  const loadItems = useCallback(() => {
    const allFolders = getDesktopFolders();
    const loadedFolders = allFolders.filter(f => !f.parentPath || f.parentPath === '/Desktop');
    
    // Get all item IDs that are inside folders
    const itemsInFolders = new Set<string>();
    allFolders.forEach(folder => {
      folder.contents.forEach(itemId => {
        itemsInFolders.add(itemId);
      });
    });
    
    // Filter shortcuts to only show those not inside folders
    const allShortcuts = getDesktopShortcuts();
    const loadedShortcuts = allShortcuts.filter(s => !itemsInFolders.has(s.id));
    
    setShortcuts(loadedShortcuts);
    setFolders(loadedFolders);

    // Load program metadata for each shortcut
    const data: Record<string, { id: string; name: string; icon: string }> = {};
    loadedShortcuts.forEach((shortcut) => {
      const program = programs[shortcut.programId];
      if (program) {
        data[shortcut.id] = {
          id: shortcut.programId,
          name: program.metadata.name,
          icon: program.metadata.icon,
        };
      }
    });
    setProgramData(data);
  }, []);

  // Memoize program data lookup
  const programDataMemo = useMemo(() => programData, [programData]);

  useEffect(() => {
    loadItems();

    const handleStorageChange = () => {
      loadItems();
    };

    window.addEventListener('storage', handleStorageChange);
    
    const handleShortcutUpdate = () => {
      loadItems();
    };
    
    window.addEventListener('desktop-shortcuts-updated', handleShortcutUpdate);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('desktop-shortcuts-updated', handleShortcutUpdate);
    };
  }, [loadItems]);

  const handleUpdate = useCallback(() => {
    loadItems();
  }, [loadItems]);

  const handleOpenFolder = useCallback((folderId: string) => {
    // This will be implemented when FolderWindow is created
    // For now, just dispatch an event
    window.dispatchEvent(new CustomEvent('open-folder', { detail: { folderId } }));
  }, []);

  // Store selection state globally for context menu access
  useEffect(() => {
    (window as any).__desktopSelection = selectedIds;
    return () => {
      delete (window as any).__desktopSelection;
    };
  }, [selectedIds]);

  // Handle click on desktop to deselect
  useEffect(() => {
    const handleDesktopClick = (e: Event) => {
      const target = e.target as HTMLElement;
      // Only deselect if clicking on the desktop itself, not on icons or other elements
      if (target.classList.contains('desktop')) {
        setSelectedIds(new Set());
        lastSelectedIndexRef.current = -1;
      }
    };

    const desktopElement = document.querySelector('.desktop');
    if (desktopElement) {
      desktopElement.addEventListener('click', handleDesktopClick);
      return () => {
        desktopElement.removeEventListener('click', handleDesktopClick);
      };
    }
  }, []);

  const handleIconSelect = useCallback((id: string, e?: React.MouseEvent, forceSingle?: boolean) => {
    const isCtrlClick = !forceSingle && e && (e.ctrlKey || e.metaKey);
    const isShiftClick = !forceSingle && e && e.shiftKey;
    
    if (isShiftClick && lastSelectedIndexRef.current >= 0) {
      // Range selection
      const allItems = [
        ...shortcuts.map((s, i) => ({ id: s.id, type: 'shortcut' as const, index: i })),
        ...folders.map((f, i) => ({ id: f.id, type: 'folder' as const, index: shortcuts.length + i })),
      ];
      
      const currentIndex = allItems.findIndex(item => item.id === id);
      if (currentIndex >= 0) {
        const start = Math.min(lastSelectedIndexRef.current, currentIndex);
        const end = Math.max(lastSelectedIndexRef.current, currentIndex);
        const newSelection = new Set(selectedIds);
        for (let i = start; i <= end; i++) {
          newSelection.add(allItems[i].id);
        }
        setSelectedIds(newSelection);
      }
    } else if (isCtrlClick) {
      // Toggle selection
      const newSelection = new Set(selectedIds);
      if (newSelection.has(id)) {
        newSelection.delete(id);
      } else {
        newSelection.add(id);
      }
      setSelectedIds(newSelection);
      const allItems = [
        ...shortcuts.map((s, i) => ({ id: s.id, type: 'shortcut' as const, index: i })),
        ...folders.map((f, i) => ({ id: f.id, type: 'folder' as const, index: shortcuts.length + i })),
      ];
      lastSelectedIndexRef.current = allItems.findIndex(item => item.id === id);
    } else {
      // Single selection
      setSelectedIds(new Set([id]));
      const allItems = [
        ...shortcuts.map((s, i) => ({ id: s.id, type: 'shortcut' as const, index: i })),
        ...folders.map((f, i) => ({ id: f.id, type: 'folder' as const, index: shortcuts.length + i })),
      ];
      lastSelectedIndexRef.current = allItems.findIndex(item => item.id === id);
    }
  }, [selectedIds, shortcuts, folders]);

  // Select All handler
  const handleSelectAll = useCallback(() => {
    const allItemIds = [
      ...shortcuts.map(s => s.id),
      ...folders.map(f => f.id),
    ];
    setSelectedIds(new Set(allItemIds));
    if (allItemIds.length > 0) {
      const allItems = [
        ...shortcuts.map((s, i) => ({ id: s.id, type: 'shortcut' as const, index: i })),
        ...folders.map((f, i) => ({ id: f.id, type: 'folder' as const, index: shortcuts.length + i })),
      ];
      lastSelectedIndexRef.current = allItems.length - 1;
    }
  }, [shortcuts, folders]);

  // Copy handler
  const handleCopy = useCallback(() => {
    console.log('[DesktopIcons] Copy: Handler called, selectedIds:', selectedIds.size);
    if (selectedIds.size === 0) {
      console.log('[DesktopIcons] Copy: No selection');
      return;
    }

    const items: ClipboardItem[] = [];
    selectedIds.forEach(id => {
      const shortcut = shortcuts.find(s => s.id === id);
      const folder = folders.find(f => f.id === id);
      if (shortcut) {
        items.push({ id: shortcut.id, type: 'shortcut' });
      } else if (folder) {
        items.push({ id: folder.id, type: 'folder' });
      }
    });

    if (items.length > 0) {
      console.log('[DesktopIcons] Copy: Copying', items.length, 'items');
      clipboardCopy({
        type: 'desktop-items',
        items,
        operation: 'copy',
      });
      console.log('[DesktopIcons] Copy: Clipboard saved', getClipboard());
    } else {
      console.log('[DesktopIcons] Copy: No valid items to copy');
    }
  }, [selectedIds, shortcuts, folders]);

  // Cut handler
  const handleCut = useCallback(() => {
    if (selectedIds.size === 0) return;

    const items: ClipboardItem[] = [];
    selectedIds.forEach(id => {
      const shortcut = shortcuts.find(s => s.id === id);
      const folder = folders.find(f => f.id === id);
      if (shortcut) {
        items.push({ id: shortcut.id, type: 'shortcut' });
      } else if (folder) {
        items.push({ id: folder.id, type: 'folder' });
      }
    });

    if (items.length > 0) {
      clipboardCut({
        type: 'desktop-items',
        items,
        operation: 'cut',
      });
    }
  }, [selectedIds, shortcuts, folders]);

  // Paste handler
  const handlePaste = useCallback(async () => {
    console.log('[DesktopIcons] Paste: Handler called');
    
    // Check if there's an active folder window - if so, let FolderWindow handle it
    const kernel = useKernel.getState();
    if (kernel.activeWindowId) {
      const activeWindow = kernel.windows.find(w => w.id === kernel.activeWindowId);
      if (activeWindow && activeWindow.programId === 'folder') {
        console.log('[DesktopIcons] Paste: Active folder window detected, skipping desktop paste');
        return;
      }
    }
    
    const clipboard = getClipboard();
    console.log('[DesktopIcons] Paste: Clipboard data', clipboard);
    if (!clipboard || clipboard.items.length === 0) {
      console.log('[DesktopIcons] Paste: No clipboard data');
      return;
    }

    // Only handle desktop-items clipboard
    if (clipboard.type !== 'desktop-items') {
      console.log('[DesktopIcons] Paste: Wrong clipboard type', clipboard.type);
      return;
    }

    const { addDesktopShortcut, getDesktopShortcuts, getDesktopFolders, getGridSize, findNextAvailablePosition, createDesktopFolder, getFolderById } = await import('@core/desktop-shortcuts');
    const gridSize = getGridSize();
    const allShortcuts = getDesktopShortcuts();
    const allFolders = getDesktopFolders();

    try {
      if (clipboard.operation === 'copy') {
        console.log('[DesktopIcons] Paste: Copying', clipboard.items.length, 'items');
        // Create copies of items
        for (const item of clipboard.items) {
          if (item.type === 'shortcut') {
            const shortcut = allShortcuts.find(s => s.id === item.id);
            if (shortcut) {
              console.log('[DesktopIcons] Paste: Copying shortcut', shortcut.id);
              const position = findNextAvailablePosition(
                [...allShortcuts, ...allFolders].map(i => ({ x: i.x, y: i.y }))
              );
              console.log('[DesktopIcons] Paste: New position', position);
              addDesktopShortcut(shortcut.programId, position.x, position.y, shortcut.customName);
            } else {
              console.warn('[DesktopIcons] Paste: Shortcut not found', item.id);
            }
          } else if (item.type === 'folder') {
            const folder = getFolderById(item.id);
            if (folder) {
              console.log('[DesktopIcons] Paste: Copying folder', folder.id);
              const position = findNextAvailablePosition(
                [...allShortcuts, ...allFolders].map(i => ({ x: i.x, y: i.y }))
              );
              console.log('[DesktopIcons] Paste: New position', position);
              createDesktopFolder(folder.name, position.x, position.y);
            } else {
              console.warn('[DesktopIcons] Paste: Folder not found', item.id);
            }
          }
        }
      } else if (clipboard.operation === 'cut') {
        // Move items to new positions
        for (const item of clipboard.items) {
          if (item.type === 'shortcut') {
            const shortcut = allShortcuts.find(s => s.id === item.id);
            if (shortcut) {
              const position = findNextAvailablePosition(
                [...allShortcuts, ...allFolders].map(i => ({ x: i.x, y: i.y }))
              );
              updateDesktopShortcutPosition(item.id, position.x, position.y);
            }
          } else if (item.type === 'folder') {
            const folder = getFolderById(item.id);
            if (folder) {
              const position = findNextAvailablePosition(
                [...allShortcuts, ...allFolders].map(i => ({ x: i.x, y: i.y }))
              );
              const { updateFolderPosition } = await import('@core/desktop-shortcuts');
              updateFolderPosition(item.id, position.x, position.y);
            }
          }
        }
        // Clear selection and clipboard after cut
        setSelectedIds(new Set());
        clearClipboard();
      }

      // Reload items to reflect changes
      loadItems();
      window.dispatchEvent(new CustomEvent('desktop-shortcuts-updated'));
    } catch (error) {
      console.error('[DesktopIcons] Error pasting items:', error);
    }
  }, [loadItems]);

  // Register keyboard shortcut handlers
  useEffect(() => {
    console.log('[DesktopIcons] Registering handlers');
    const unregisterSelectAll = registerSelectAllHandler(handleSelectAll);
    const unregisterCopy = registerCopyHandler(() => {
      console.log('[DesktopIcons] Copy handler called from shortcut');
      handleCopy();
    });
    const unregisterCut = registerCutHandler(handleCut);
    const unregisterPaste = registerPasteHandler(() => {
      console.log('[DesktopIcons] Paste handler called from shortcut');
      handlePaste();
    });

    return () => {
      unregisterSelectAll();
      unregisterCopy();
      unregisterCut();
      unregisterPaste();
    };
  }, [handleSelectAll, handleCopy, handleCut, handlePaste]);

  return (
    <div className="desktop-icons">
      {shortcuts.map((shortcut) => {
        const program = programDataMemo[shortcut.id];
        if (!program) return null;
        
        return (
          <DesktopIcon
            key={shortcut.id}
            shortcut={shortcut}
            program={program}
            onUpdate={handleUpdate}
            isSelected={selectedIds.has(shortcut.id)}
            onSelect={(e) => handleIconSelect(shortcut.id, e)}
          />
        );
      })}
      {folders.map((folder) => (
        <FolderIcon
          key={folder.id}
          folder={folder}
          onUpdate={handleUpdate}
          onOpen={handleOpenFolder}
            isSelected={selectedIds.has(folder.id)}
            onSelect={(e) => handleIconSelect(folder.id, e)}
        />
      ))}
    </div>
  );
}

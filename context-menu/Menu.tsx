import { useEffect, useRef, useState, useCallback, useLayoutEffect } from 'react';
import { MenuItem } from './MenuItem';
import { ContextMenuManager, type MenuItem as MenuItemType } from './ContextMenuManager';

/** Props for the floating context menu root. */
interface MenuProps {
  items: MenuItemType[];
  position: { x: number; y: number };
  onClose: () => void;
}

/** Root context menu: keyboard navigation, submenu open state, and item list */
export function Menu({ items, position, onClose }: MenuProps) {
  const menuRef = useRef<HTMLUListElement>(null);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [openSubmenuId, setOpenSubmenuId] = useState<string | null>(null);
  const [keyboardState, setKeyboardState] = useState({ lastKey: null as string | null, lastKeyTime: 0, searchString: '' });

  // Get enabled items for navigation
  const enabledItems = items.filter((item) => item.enabled !== false && item.visible !== false);

  // Set initial focus
  useEffect(() => {
    if (enabledItems.length > 0 && !activeItemId) {
      setActiveItemId(enabledItems[0].id);
    }
  }, [enabledItems, activeItemId]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!menuRef.current) return;

      const currentIndex = enabledItems.findIndex((item) => item.id === activeItemId);
      let newIndex = currentIndex;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          e.stopPropagation();
          newIndex = currentIndex < enabledItems.length - 1 ? currentIndex + 1 : 0;
          setActiveItemId(enabledItems[newIndex].id);
          setOpenSubmenuId(null);
          break;

        case 'ArrowUp':
          e.preventDefault();
          e.stopPropagation();
          newIndex = currentIndex > 0 ? currentIndex - 1 : enabledItems.length - 1;
          setActiveItemId(enabledItems[newIndex].id);
          setOpenSubmenuId(null);
          break;

        case 'ArrowRight':
          e.preventDefault();
          e.stopPropagation();
          if (activeItemId) {
            const activeItem = items.find((item) => item.id === activeItemId);
            if (activeItem && activeItem.type === 'submenu' && activeItem.submenu) {
              setOpenSubmenuId(activeItem.id);
              // Focus first item in submenu
              if (activeItem.submenu.length > 0) {
                const firstEnabled = activeItem.submenu.find((item) => item.enabled !== false);
                if (firstEnabled) {
                  // Submenu will handle its own focus
                }
              }
            }
          }
          break;

        case 'ArrowLeft':
          e.preventDefault();
          e.stopPropagation();
          if (openSubmenuId) {
            setOpenSubmenuId(null);
          } else {
            onClose();
          }
          break;

        case 'Enter':
        case ' ':
          e.preventDefault();
          e.stopPropagation();
          if (activeItemId) {
            const activeItem = items.find((item) => item.id === activeItemId);
            if (activeItem) {
              const manager = ContextMenuManager.getInstance();
              manager.handleMenuItemSelect(activeItem);
            }
          }
          break;

        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          if (openSubmenuId) {
            setOpenSubmenuId(null);
          } else {
            onClose();
          }
          break;

        default:
          // Type-to-select
          if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            const now = Date.now();
            const timeSinceLastKey = now - keyboardState.lastKeyTime;
            const searchString =
              timeSinceLastKey < 1000 && keyboardState.lastKey === e.key
                ? keyboardState.searchString + e.key
                : e.key.toLowerCase();

            setKeyboardState({
              lastKey: e.key,
              lastKeyTime: now,
              searchString,
            });

            // Find next item starting with search string
            const searchLower = searchString.toLowerCase();
            let foundIndex = -1;

            // Search from current position forward
            for (let i = currentIndex + 1; i < enabledItems.length; i++) {
              if (enabledItems[i].label.toLowerCase().startsWith(searchLower)) {
                foundIndex = i;
                break;
              }
            }

            // If not found, search from beginning
            if (foundIndex === -1) {
              for (let i = 0; i <= currentIndex; i++) {
                if (enabledItems[i].label.toLowerCase().startsWith(searchLower)) {
                  foundIndex = i;
                  break;
                }
              }
            }

            if (foundIndex >= 0) {
              setActiveItemId(enabledItems[foundIndex].id);
              setOpenSubmenuId(null);
            }
          }
          break;
      }
    },
    [activeItemId, enabledItems, items, openSubmenuId, keyboardState, onClose]
  );

  // Register keyboard handler
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  const handleItemSelect = useCallback(
    (item: MenuItemType) => {
      const manager = ContextMenuManager.getInstance();
      manager.handleMenuItemSelect(item);
    },
    []
  );

  const handleItemMouseEnter = useCallback((item: MenuItemType) => {
    setActiveItemId(item.id);
    if (item.type === 'submenu') {
      setOpenSubmenuId(item.id);
    }
  }, []);

  const closeTimeoutRef = useRef<Map<string, number>>(new Map());

  const handleItemMouseLeave = useCallback((item: MenuItemType) => {
    // Cancel any existing timeout for this item
    const existingTimeout = closeTimeoutRef.current.get(item.id);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Close submenu if mouse leaves the item
    // Use a delay to allow mouse to move to submenu
    const timeoutId = window.setTimeout(() => {
      // Check if submenu is still the open one and mouse is not over it
      setOpenSubmenuId((currentOpenId) => {
        if (currentOpenId === item.id && item.type === 'submenu') {
          // Verify mouse is not over submenu
          const submenu = document.querySelector('.context-menu-submenu') as HTMLElement;
          if (submenu) {
            // Check if submenu has mouse-over flag
            if (submenu.dataset.mouseOver === 'true') {
              // Mouse is over submenu, don't close
              return currentOpenId;
            }
          }
          return null;
        }
        return currentOpenId;
      });
      closeTimeoutRef.current.delete(item.id);
    }, 300); // 300ms delay to allow mouse movement to submenu (longer for safety)

    closeTimeoutRef.current.set(item.id, timeoutId);
  }, []);

  const handleSubmenuOpen = useCallback((item: MenuItemType) => {
    setOpenSubmenuId(item.id);
  }, []);

  const handleSubmenuClose = useCallback(() => {
    setOpenSubmenuId(null);
  }, []);

  // Update aria-activedescendant
  useEffect(() => {
    if (menuRef.current && activeItemId) {
      menuRef.current.setAttribute('aria-activedescendant', `context-menu-item-${activeItemId}`);
    }
  }, [activeItemId]);

  // Final safety check after DOM update: ensure menu never exceeds viewport
  useLayoutEffect(() => {
    if (!menuRef.current || typeof window === 'undefined') return;
    
    const menu = menuRef.current;
    const rect = menu.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const margin = 20;
    
    // If menu bottom exceeds viewport, adjust position
    if (rect.bottom > viewportHeight - margin) {
      const overflow = rect.bottom - (viewportHeight - margin);
      const currentTop = parseFloat(menu.style.top) || rect.top;
      const newTop = Math.max(0, currentTop - overflow);
      menu.style.top = `${newTop}px`;
    }
    
    // Also ensure menu doesn't go above viewport
    if (rect.top < 0) {
      menu.style.top = '0px';
    }
  }, [items, position]);

  return (
    <ul
      ref={menuRef}
      role="menu"
      className="context-menu"
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: 'translate3d(0, 0, 0)',
      }}
      aria-activedescendant={activeItemId ? `context-menu-item-${activeItemId}` : undefined}
    >
      {items.map((item) => (
        <MenuItem
          key={item.id}
          item={item}
          isActive={activeItemId === item.id}
          isSubmenuOpen={openSubmenuId === item.id}
          onSelect={handleItemSelect}
          onMouseEnter={handleItemMouseEnter}
          onMouseLeave={() => handleItemMouseLeave(item)}
          onSubmenuOpen={handleSubmenuOpen}
          onSubmenuClose={handleSubmenuClose}
        />
      ))}
    </ul>
  );
}

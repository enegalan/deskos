import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MenuItem as MenuItemType } from './ContextMenuManager';
import type { MenuPosition } from './positioning';
import { Icon } from '../components/Icon';
import { hasIcon, type IconName } from '@core/icons';

interface MenuItemProps {
  item: MenuItemType;
  isActive: boolean;
  isSubmenuOpen: boolean;
  onSelect: (item: MenuItemType) => void;
  onMouseEnter: (item: MenuItemType) => void;
  onMouseLeave: (item: MenuItemType) => void;
  onSubmenuOpen?: (item: MenuItemType) => void;
  onSubmenuClose?: () => void;
}

/** Single context menu row (action, checkbox, separator, or submenu trigger) */
export function MenuItem({
  item,
  isActive,
  isSubmenuOpen,
  onSelect,
  onMouseEnter,
  onMouseLeave,
  onSubmenuOpen,
  onSubmenuClose,
}: MenuItemProps) {
  const itemRef = useRef<HTMLLIElement>(null);

  // Update aria-activedescendant when active
  useEffect(() => {
    if (isActive && itemRef.current) {
      itemRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [isActive]);

  if (item.type === 'separator') {
    return <li role="separator" className="context-menu-separator" />;
  }

  const isDisabled = item.enabled === false;
  const isChecked = item.checked === true;
  const hasSubmenu = item.type === 'submenu' && item.submenu && item.submenu.length > 0;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDisabled) {
      if (hasSubmenu && !isSubmenuOpen) {
        onSubmenuOpen?.(item);
      } else {
        onSelect(item);
      }
    }
  };

  const handleMouseEnter = () => {
    if (!isDisabled) {
      onMouseEnter(item);
      if (hasSubmenu && !isSubmenuOpen) {
        onSubmenuOpen?.(item);
      }
    }
  };

  const handleMouseLeave = (e: React.MouseEvent) => {
    // Check if mouse is moving to submenu
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (hasSubmenu && isSubmenuOpen && relatedTarget) {
      // If mouse is moving to submenu, don't close
      const submenu = relatedTarget.closest('.context-menu-submenu');
      if (submenu) {
        return; // Keep submenu open
      }
    }
    onMouseLeave(item);
  };

  // Determine ARIA role
  let role: string;
  if (item.type === 'checkbox') {
    role = 'menuitemcheckbox';
  } else if (item.type === 'radio') {
    role = 'menuitemradio';
  } else {
    role = 'menuitem';
  }

  return (
    <li
      ref={itemRef}
      role={role}
      id={`context-menu-item-${item.id}`}
      className={`context-menu-item ${isActive ? 'active' : ''} ${isDisabled ? 'disabled' : ''} ${hasSubmenu ? 'has-submenu' : ''} ${isSubmenuOpen ? 'submenu-open' : ''}`}
      aria-disabled={isDisabled}
      aria-checked={item.type === 'checkbox' || item.type === 'radio' ? isChecked : undefined}
      aria-haspopup={hasSubmenu ? 'menu' : undefined}
      aria-expanded={hasSubmenu ? isSubmenuOpen : undefined}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <span className="context-menu-item-content">
        {item.icon && (
          <span className="context-menu-item-icon">
            {hasIcon(item.icon as IconName) ? (
              <Icon name={item.icon as IconName} size={16} />
            ) : (
              <span>{item.icon}</span>
            )}
          </span>
        )}
        <span className="context-menu-item-label">{item.label}</span>
        {item.shortcut && (
          <span className="context-menu-item-shortcut">{item.shortcut}</span>
        )}
        {hasSubmenu && (
          <span className="context-menu-item-arrow" aria-hidden="true">
            <Icon name="arrow-right" size={10} />
          </span>
        )}
      </span>
      {hasSubmenu && isSubmenuOpen && item.submenu && itemRef.current && (
        <Submenu
          items={item.submenu}
          parentItem={itemRef.current}
          parentItemId={item.id}
          onSelect={onSelect}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          onClose={() => onSubmenuClose?.()}
        />
      )}
    </li>
  );
}

interface SubmenuProps {
  items: MenuItemType[];
  parentItem: HTMLLIElement | null;
  parentItemId: string;
  onSelect: (item: MenuItemType) => void;
  onMouseEnter: (item: MenuItemType) => void;
  onMouseLeave: (item: MenuItemType) => void;
  onClose: () => void;
}

/** Nested submenu portal positioned relative to its parent item */
function Submenu({ items, parentItem, parentItemId, onSelect, onMouseEnter, onMouseLeave, onClose }: SubmenuProps) {
  const submenuRef = useRef<HTMLUListElement>(null);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const closeTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!parentItem || !submenuRef.current) {
      return;
    }

    // Calculate position after submenu is rendered and measured
    const calculatePosition = () => {
      if (!parentItem || !submenuRef.current) return;

      // Get parent item position relative to viewport
      const parentRect = parentItem.getBoundingClientRect();
      const parentMenu = parentItem.closest('.context-menu') as HTMLElement;
      
      // Measure submenu while hidden
      submenuRef.current.style.visibility = 'hidden';
      submenuRef.current.style.position = 'fixed';
      submenuRef.current.style.left = '0';
      submenuRef.current.style.top = '0';
      submenuRef.current.style.width = 'auto';
      
      // Force layout calculation
      const submenuWidth = submenuRef.current.offsetWidth || 200;
      const submenuHeight = submenuRef.current.offsetHeight || 100;
      
      const viewport = {
        width: window.innerWidth,
        height: window.innerHeight,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
      };

      // Position: right edge of parent item - 2px overlap (no gap, slight overlap)
      let x = parentRect.right - 2;
      let y = parentRect.top;

      // Check if would overflow right - flip to left
      if (x + submenuWidth > viewport.width) {
        if (parentMenu) {
          const parentMenuRect = parentMenu.getBoundingClientRect();
          x = parentMenuRect.left - submenuWidth + 2; // Overlap on left side too
        } else {
          x = parentRect.left - submenuWidth + 2;
        }
        // Don't go off left edge
        if (x < 0) {
          x = 2;
        }
      }

      // Check if would overflow bottom
      if (y + submenuHeight > viewport.height) {
        y = Math.max(0, viewport.height - submenuHeight);
      }

      // Don't go off top edge
      if (y < 0) {
        y = 0;
      }

      setPosition({
        x,
        y,
        flippedX: x < parentRect.right,
        flippedY: false,
        shiftX: 0,
        shiftY: 0,
      });
    };

    // Use double RAF to ensure layout is complete
    requestAnimationFrame(() => {
      requestAnimationFrame(calculatePosition);
    });
  }, [parentItem]);

  // Render with calculated position
  const style: React.CSSProperties = position
    ? {
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: 'translate3d(0, 0, 0)',
        visibility: 'visible',
        zIndex: 7000, // Above taskbar (6000) but using CSS variable
      }
    : {
        position: 'fixed',
        left: '0',
        top: '0',
        visibility: 'hidden',
        pointerEvents: 'none',
      };

  // Handle mouse enter/leave on submenu
  const handleSubmenuMouseEnter = () => {
    // Mark that mouse is over submenu
    if (submenuRef.current) {
      submenuRef.current.dataset.mouseOver = 'true';
    }
    
    // Cancel any pending close
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  const handleSubmenuMouseLeave = (e: React.MouseEvent) => {
    // Mark that mouse left submenu
    if (submenuRef.current) {
      submenuRef.current.dataset.mouseOver = 'false';
    }
    
    // Check if mouse is moving back to parent item
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (relatedTarget && parentItem) {
      const isMovingToParent = parentItem.contains(relatedTarget) || relatedTarget.closest(`#context-menu-item-${parentItemId}`);
      if (isMovingToParent) {
        return; // Don't close if moving back to parent
      }
    }
    
    // Close submenu after a short delay
    closeTimeoutRef.current = window.setTimeout(() => {
      onClose();
    }, 200);
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  const submenuContent = (
    <ul
      ref={submenuRef}
      role="menu"
      className="context-menu-submenu"
      style={style}
      onMouseEnter={handleSubmenuMouseEnter}
      onMouseLeave={handleSubmenuMouseLeave}
    >
      {items.map((subItem) => (
        <MenuItem
          key={subItem.id}
          item={subItem}
          isActive={false}
          isSubmenuOpen={false}
          onSelect={onSelect}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
        />
      ))}
    </ul>
  );

  // Render submenu in a portal to avoid positioning issues
  return createPortal(submenuContent, document.body);
}

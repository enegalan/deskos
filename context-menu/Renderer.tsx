import { useEffect, useRef, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Menu } from './Menu';
import { ContextMenuManager } from './ContextMenuManager';
import {
  calculateMenuPosition,
  getViewportInfo,
  getTriggerCoordinates,
  measureMenuDimensions,
  type MenuPosition,
  type MenuDimensions,
} from './positioning';
import type { MenuItem, MenuContext } from './ContextMenuManager';

/** Internal render state for the context menu portal. */
interface RendererState {
  isVisible: boolean;
  items: MenuItem[];
  position: MenuPosition | null;
  dimensions: MenuDimensions | null;
}

/**
 * Renderer component that handles menu positioning and rendering
 */
export function ContextMenuRenderer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRootRef = useRef<Root | null>(null);
  const measureElementRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<RendererState>({
    isVisible: false,
    items: [],
    position: null,
    dimensions: null,
  });

  useEffect(() => {
    const manager = ContextMenuManager.getInstance();
    const container = containerRef.current;
    if (!container) return;

    // Initialize manager with container
    manager.initialize(container);

    // Listen for menu open events
    const handleMenuOpen = (e: Event) => {
      const customEvent = e as CustomEvent<{ context: MenuContext; items: MenuItem[] }>;
      const { context, items } = customEvent.detail;

      // Phase 1: Measurement
      // Create off-screen element for measurement
      if (!measureElementRef.current) {
        const measureEl = document.createElement('div');
        measureEl.className = 'context-menu context-menu-measure';
        measureEl.style.visibility = 'hidden';
        measureEl.style.position = 'absolute';
        measureEl.style.top = '-9999px';
        measureEl.style.left = '-9999px';
        document.body.appendChild(measureEl);
        measureElementRef.current = measureEl;
      }

      // Render menu off-screen for measurement
      const measureRoot = createRoot(measureElementRef.current);
      measureRoot.render(
        <ul role="menu" className="context-menu">
          {items.map((item) => (
            <li key={item.id} className="context-menu-item">
              <span className="context-menu-item-content">
                {item.icon && <span className="context-menu-item-icon">{item.icon}</span>}
                <span className="context-menu-item-label">{item.label}</span>
                {item.shortcut && (
                  <span className="context-menu-item-shortcut">{item.shortcut}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      );

      // Wait for render, then measure
      requestAnimationFrame(() => {
        if (!measureElementRef.current) return;

        const dimensions = measureMenuDimensions(measureElementRef.current);
        const triggerCoords = getTriggerCoordinates(context.event);
        const viewport = getViewportInfo(context.target);

        // Phase 2: Calculation
        const position = calculateMenuPosition(
          triggerCoords.x,
          triggerCoords.y,
          dimensions,
          viewport,
          {
            offsetX: 0,
            offsetY: 0,
            preferRight: true,
            preferBottom: true,
          }
        );

        // Phase 3: Application (using requestAnimationFrame for smooth rendering)
        requestAnimationFrame(() => {
          setState({
            isVisible: true,
            items,
            position,
            dimensions,
          });

          // Clean up measurement element
          measureRoot.unmount();
          if (measureElementRef.current) {
            document.body.removeChild(measureElementRef.current);
            measureElementRef.current = null;
          }

          // Update manager state
          manager.updateRenderState({
            isOpen: true,
            isPositioning: false,
            position,
            dimensions,
          });
        });
      });
    };

    const handleMenuClose = () => {
      setState({
        isVisible: false,
        items: [],
        position: null,
        dimensions: null,
      });

      // Unmount menu
      if (menuRootRef.current) {
        menuRootRef.current.unmount();
        menuRootRef.current = null;
      }

      manager.updateRenderState({
        isOpen: false,
        isPositioning: false,
        activeItemId: null,
        openSubmenuId: null,
        position: null,
        dimensions: null,
      });
    };

    document.addEventListener('contextmenu:menu:open', handleMenuOpen);
    document.addEventListener('contextmenu:menu:close', handleMenuClose);

    return () => {
      document.removeEventListener('contextmenu:menu:open', handleMenuOpen);
      document.removeEventListener('contextmenu:menu:close', handleMenuClose);
    };
  }, []);

  // Render menu when visible
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (state.isVisible && state.position) {
      // Create or reuse root
      if (!menuRootRef.current) {
        menuRootRef.current = createRoot(container);
      }

      menuRootRef.current.render(
        <Menu
          items={state.items}
          position={{ x: state.position.x, y: state.position.y }}
          onClose={() => {
            const manager = ContextMenuManager.getInstance();
            manager.closeMenu();
          }}
        />
      );
    } else if (menuRootRef.current) {
      // Unmount when hidden
      menuRootRef.current.unmount();
      menuRootRef.current = null;
    }
  }, [state.isVisible, state.items, state.position]);

  return <div ref={containerRef} className="context-menu-container" />;
}

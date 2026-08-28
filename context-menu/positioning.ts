/** Computed menu position with flip/shift metadata. */
export interface MenuPosition {
  x: number;
  y: number;
  flippedX: boolean;
  flippedY: boolean;
  shiftX: number;
  shiftY: number;
}

/** Measured menu width and height (px). */
export interface MenuDimensions {
  width: number;
  height: number;
}

/** Viewport size and scroll offset used for menu collision detection. */
export interface ViewportInfo {
  width: number;
  height: number;
  scrollX: number;
  scrollY: number;
}

/**
 * Calculate optimal menu position with collision detection and flipping
 */
export function calculateMenuPosition(
  triggerX: number,
  triggerY: number,
  menuDimensions: MenuDimensions,
  viewport: ViewportInfo,
  options: {
    offsetX?: number;
    offsetY?: number;
    preferRight?: boolean;
    preferBottom?: boolean;
  } = {}
): MenuPosition {
  const { offsetX = 0, offsetY = 0, preferRight = true } = options;

  let x = triggerX + offsetX;
  let y = triggerY + offsetY;
  let flippedX = false;
  let flippedY = false;
  let shiftX = 0;
  let shiftY = 0;

  // Horizontal collision detection
  if (x + menuDimensions.width > viewport.width + viewport.scrollX) {
    // Would overflow right edge
    if (preferRight) {
      // Try flipping to left
      const flippedXPos = triggerX - menuDimensions.width - offsetX;
      if (flippedXPos >= viewport.scrollX) {
        x = flippedXPos;
        flippedX = true;
      } else {
        // Can't flip, shift to fit
        x = viewport.width + viewport.scrollX - menuDimensions.width;
        shiftX = x - (triggerX + offsetX);
      }
    } else {
      // Shift to fit
      x = viewport.width + viewport.scrollX - menuDimensions.width;
      shiftX = x - (triggerX + offsetX);
    }
  } else if (x < viewport.scrollX) {
    // Would overflow left edge
    x = viewport.scrollX;
    shiftX = x - (triggerX + offsetX);
  }

  // Vertical collision detection - ULTRA AGGRESSIVE APPROACH
  // Get actual viewport height - this is the absolute truth
  const actualViewportHeight = typeof window !== 'undefined' ? window.innerHeight : viewport.height;
  const margin = 20; // Generous margin
  
  // Calculate where menu bottom would be if placed below trigger
  const menuBottomIfBelow = triggerY + offsetY + menuDimensions.height;
  
  // Calculate maximum allowed Y position (viewport height minus margin)
  const maxAllowedY = actualViewportHeight - margin;
  
  // DECISION: If menu would go below maxAllowedY, ALWAYS flip above
  // Also flip if trigger is in the bottom 200px (very conservative zone)
  const triggerInBottomZone = triggerY > (actualViewportHeight - 200);
  const wouldExceedMax = menuBottomIfBelow > maxAllowedY;
  
  if (triggerInBottomZone || wouldExceedMax) {
    // FORCE flip above - no exceptions
    let flippedYPos = triggerY - menuDimensions.height - offsetY;
    
    // Clamp to viewport top if needed
    if (flippedYPos < 0) {
      flippedYPos = 0;
      shiftY = flippedYPos - (triggerY - menuDimensions.height - offsetY);
    } else {
      shiftY = 0;
    }
    
    y = flippedYPos;
    flippedY = true;
  } else {
    // Try to place below trigger
    y = triggerY + offsetY;
    
    // Clamp to viewport top
    if (y < 0) {
      y = 0;
      shiftY = y - (triggerY + offsetY);
    } else {
      shiftY = 0;
    }
  }
  
  // ABSOLUTE FINAL ENFORCEMENT: y + height MUST be <= window.innerHeight
  // This is the last line of defense - no exceptions
  if (typeof window !== 'undefined') {
    const finalMenuBottom = y + menuDimensions.height;
    const viewportHeight = window.innerHeight;
    
    if (finalMenuBottom > viewportHeight) {
      // CRITICAL: Menu would be cut off, force flip above
      let forcedY = triggerY - menuDimensions.height - offsetY;
      
      // If menu is taller than viewport, position at top
      if (menuDimensions.height > viewportHeight) {
        forcedY = 0;
      } else if (forcedY < 0) {
        forcedY = 0;
      }
      
      // Final verification: ensure forced position is valid
      if (forcedY + menuDimensions.height > viewportHeight) {
        forcedY = Math.max(0, viewportHeight - menuDimensions.height);
      }
      
      y = forcedY;
      flippedY = true;
      shiftY = y - (triggerY - menuDimensions.height - offsetY);
    }
    
    // One more check: ensure y is never negative
    if (y < 0) {
      y = 0;
      if (flippedY) {
        shiftY = y - (triggerY - menuDimensions.height - offsetY);
      } else {
        shiftY = y - (triggerY + offsetY);
      }
    }
  }

  return {
    x,
    y,
    flippedX,
    flippedY,
    shiftX,
    shiftY,
  };
}

/**
 * Calculate submenu position relative to parent menu item
 */
export function calculateSubmenuPosition(
  parentItemRect: DOMRect,
  parentMenuRect: DOMRect,
  submenuDimensions: MenuDimensions,
  viewport: ViewportInfo,
  options: {
    offsetX?: number;
    offsetY?: number;
    preferRight?: boolean;
  } = {}
): MenuPosition {
  const { offsetX = 2, offsetY = 0, preferRight = true } = options;

  // Default: open to the right of parent item, aligned with top
  // Use right edge of parent item + small offset
  let x = parentItemRect.right + offsetX;
  let y = parentItemRect.top + offsetY;
  let flippedX = false;
  let flippedY = false;
  let shiftX = 0;
  let shiftY = 0;

  // Check if submenu would overflow right edge
  const wouldOverflowRight = x + submenuDimensions.width > viewport.width + viewport.scrollX;
  
  if (wouldOverflowRight) {
    if (preferRight) {
      // Try opening to the left of parent menu (flip to left side)
      const leftX = parentMenuRect.left - submenuDimensions.width - offsetX;
      if (leftX >= viewport.scrollX) {
        // Can fit on the left
        x = leftX;
        flippedX = true;
      } else {
        // Can't fit on left either, shift to fit within viewport
        x = Math.max(viewport.scrollX, viewport.width + viewport.scrollX - submenuDimensions.width);
        shiftX = x - (parentItemRect.right + offsetX);
      }
    } else {
      // Shift to fit
      x = Math.max(viewport.scrollX, viewport.width + viewport.scrollX - submenuDimensions.width);
      shiftX = x - (parentItemRect.right + offsetX);
    }
  }

  // Check if submenu would overflow left edge (after potential flip)
  if (x < viewport.scrollX) {
    x = viewport.scrollX;
    shiftX = x - (flippedX ? (parentMenuRect.left - submenuDimensions.width - offsetX) : (parentItemRect.right + offsetX));
  }

  // Check if submenu would overflow bottom edge (accounting for dock)
  const dockHeight = 100;
  const availableHeight = viewport.height - dockHeight;
  const wouldOverflowBottom = y + submenuDimensions.height > availableHeight + viewport.scrollY;
  if (wouldOverflowBottom) {
    // Shift upward to fit above dock
    const maxY = availableHeight + viewport.scrollY - submenuDimensions.height;
    if (maxY >= viewport.scrollY) {
      y = maxY;
      shiftY = y - (parentItemRect.top + offsetY);
    } else {
      // Can't fit, align with top of viewport
      y = viewport.scrollY;
      shiftY = y - (parentItemRect.top + offsetY);
    }
  }
  
  // Final check: ensure submenu doesn't go below viewport
  if (y + submenuDimensions.height > viewport.height + viewport.scrollY) {
    y = viewport.height + viewport.scrollY - submenuDimensions.height;
    shiftY = y - (parentItemRect.top + offsetY);
  }

  // Check if submenu would overflow top edge
  if (y < viewport.scrollY) {
    y = viewport.scrollY;
    shiftY = y - (parentItemRect.top + offsetY);
  }

  return {
    x,
    y,
    flippedX,
    flippedY,
    shiftX,
    shiftY,
  };
}

/**
 * Get viewport information
 */
export function getViewportInfo(element?: HTMLElement): ViewportInfo {
  if (element) {
    // Check if element is inside a window (.window class)
    // If so, use browser viewport since menu is rendered with position: fixed
    const windowElement = element.closest('.window');
    if (windowElement) {
      // Element is inside a window, use browser viewport
      return {
        width: window.innerWidth,
        height: window.innerHeight,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
      };
    }

    // Get clipping container (window, dialog, etc.)
    const scrollContainer = findScrollContainer(element);
    if (scrollContainer) {
      return {
        width: scrollContainer.clientWidth,
        height: scrollContainer.clientHeight,
        scrollX: scrollContainer.scrollLeft,
        scrollY: scrollContainer.scrollTop,
      };
    }
  }

  // Fallback to window viewport
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  };
}

/**
 * Find the nearest scroll container
 */
function findScrollContainer(element: HTMLElement): HTMLElement | null {
  let parent = element.parentElement;
  while (parent && parent !== document.body) {
    const overflow = window.getComputedStyle(parent).overflow;
    if (overflow === 'auto' || overflow === 'scroll' || overflow === 'hidden') {
      return parent;
    }
    parent = parent.parentElement;
  }
  return null;
}

/**
 * Measure menu dimensions (for off-screen measurement)
 */
export function measureMenuDimensions(menuElement: HTMLElement): MenuDimensions {
  // Use getBoundingClientRect for accurate measurements
  const rect = menuElement.getBoundingClientRect();
  return {
    width: rect.width,
    height: rect.height,
  };
}

/**
 * Get trigger coordinates from event
 */
export function getTriggerCoordinates(
  event: MouseEvent | KeyboardEvent | TouchEvent
): { x: number; y: number } {
  if ('clientX' in event && 'clientY' in event) {
    return { x: event.clientX, y: event.clientY };
  }
  if ('touches' in event && event.touches.length > 0) {
    return { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }
  // Fallback for keyboard events
  const target = event.target as HTMLElement;
  if (target) {
    const rect = target.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  }
  return { x: 0, y: 0 };
}

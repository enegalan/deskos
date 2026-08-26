
/**
 * Menu item types following WAI-ARIA patterns
 */
export type MenuItemType = 'action' | 'checkbox' | 'radio' | 'separator' | 'submenu';

/**
 * Context object passed to dynamic menu generators
 */
export interface MenuContext {
  /** The original trigger event (MouseEvent, KeyboardEvent, or TouchEvent) */
  event: MouseEvent | KeyboardEvent | TouchEvent;
  /** The target element that triggered the menu */
  target: HTMLElement;
  /** Current selection state (for file operations, etc.) */
  selection?: unknown;
  /** Additional context data from the target element */
  data?: Record<string, unknown>;
  /** Program ID that owns the target element */
  programId?: string;
  /** Window ID containing the target element */
  windowId?: string;
}

/**
 * Individual menu item definition
 */
export interface MenuItem {
  /** Unique identifier for this item */
  id: string;
  /** Display label */
  label: string;
  /** Optional icon (emoji, SVG, or image URL) */
  icon?: string;
  /** Item type */
  type?: MenuItemType;
  /** Whether the item is enabled (default: true) */
  enabled?: boolean;
  /** Whether the item is visible (default: true) */
  visible?: boolean;
  /** For checkbox/radio: whether checked */
  checked?: boolean;
  /** For radio: group name */
  group?: string;
  /** Keyboard shortcut hint (e.g., "Ctrl+C") */
  shortcut?: string;
  /** Action callback - executed when item is selected */
  action?: (context: MenuContext) => void | Promise<void>;
  /** Submenu items (for type="submenu") */
  submenu?: MenuItem[];
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Menu item generator function for dynamic content
 */
export type MenuItemGenerator = (context: MenuContext) => MenuItem[] | Promise<MenuItem[]>;

/**
 * Context menu provider registration
 */
export interface ContextMenuProvider {
  /** Unique provider identifier */
  id: string;
  /** Target selector (e.g., "desktop", "window", "file", or CSS selector) */
  target: string;
  /** Static menu items */
  items?: MenuItem[];
  /** Dynamic menu item generator */
  generator?: MenuItemGenerator;
  /** Priority for augmentation (higher = earlier in list) */
  priority?: number;
  /** Program ID that registered this provider */
  programId?: string;
}

/**
 * Lifecycle hooks for context menu events
 */
export interface ContextMenuHooks {
  /** Called before menu opens - can modify menu tree */
  onBeforeOpen?: (context: MenuContext, items: MenuItem[]) => MenuItem[] | void;
  /** Called after menu is fully rendered and positioned */
  onAfterOpen?: (context: MenuContext) => void;
  /** Called when a menu item is selected - return false to prevent default action */
  onMenuItemSelect?: (item: MenuItem, context: MenuContext) => boolean | void;
  /** Called before menu closes */
  onBeforeClose?: (context: MenuContext) => void;
  /** Called after menu is completely dismissed */
  onAfterClose?: (context: MenuContext) => void;
}

/**
 * Position calculation result
 */
export interface MenuPosition {
  x: number;
  y: number;
  /** Whether menu was flipped horizontally */
  flippedX: boolean;
  /** Whether menu was flipped vertically */
  flippedY: boolean;
  /** Applied shift offset */
  shiftX: number;
  shiftY: number;
}

/**
 * Menu dimensions
 */
export interface MenuDimensions {
  width: number;
  height: number;
}

/**
 * Viewport information for collision detection
 */
export interface ViewportInfo {
  width: number;
  height: number;
  scrollX: number;
  scrollY: number;
}

/**
 * IPC message for sandboxed callback execution
 */
export interface MenuActionMessage {
  type: 'context-menu:action';
  programId: string;
  actionId: string;
  context: SerializedMenuContext;
}

/**
 * Serialized version of MenuContext for IPC
 */
export interface SerializedMenuContext {
  targetId?: string;
  targetTag?: string;
  targetClasses?: string[];
  selection?: unknown;
  data?: Record<string, unknown>;
  programId?: string;
  windowId?: string;
  triggerType: 'mouse' | 'keyboard' | 'touch';
  coordinates?: { x: number; y: number };
}

/**
 * Haptic feedback patterns
 */
export type HapticPattern = 'trigger' | 'success' | 'error';

/**
 * Menu render state
 */
export interface MenuRenderState {
  isOpen: boolean;
  isPositioning: boolean;
  activeItemId: string | null;
  openSubmenuId: string | null;
  position: MenuPosition | null;
  dimensions: MenuDimensions | null;
}

/**
 * Keyboard navigation state
 */
export interface KeyboardState {
  lastKey: string | null;
  lastKeyTime: number;
  searchString: string;
}

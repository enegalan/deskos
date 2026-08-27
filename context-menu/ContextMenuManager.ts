import type { MenuPosition, MenuDimensions } from './positioning';

export type MenuItemType = 'action' | 'checkbox' | 'radio' | 'separator' | 'submenu';

export interface MenuContext {
  event: MouseEvent | KeyboardEvent | TouchEvent;
  target: HTMLElement;
  selection?: unknown;
  data?: Record<string, unknown>;
  programId?: string;
  windowId?: string;
}

export interface MenuItem {
  id: string;
  label: string;
  icon?: string;
  type?: MenuItemType;
  enabled?: boolean;
  visible?: boolean;
  checked?: boolean;
  group?: string;
  shortcut?: string;
  action?: (context: MenuContext) => void | Promise<void>;
  submenu?: MenuItem[];
  metadata?: Record<string, unknown>;
}

export type MenuItemGenerator = (context: MenuContext) => MenuItem[] | Promise<MenuItem[]>;

export interface ContextMenuProvider {
  id: string;
  target: string;
  items?: MenuItem[];
  generator?: MenuItemGenerator;
  priority?: number;
  programId?: string;
}

export type HapticPattern = 'trigger' | 'success' | 'error';

export interface MenuRenderState {
  isOpen: boolean;
  isPositioning: boolean;
  activeItemId: string | null;
  openSubmenuId: string | null;
  position: MenuPosition | null;
  dimensions: MenuDimensions | null;
}

/**
 * Singleton manager for the DeskOS context menu system.
 * Handles event interception, provider registration, and menu lifecycle.
 */
export class ContextMenuManager {
  private static instance: ContextMenuManager | null = null;

  private providers: Map<string, ContextMenuProvider[]> = new Map();
  private renderState: MenuRenderState = {
    isOpen: false,
    isPositioning: false,
    activeItemId: null,
    openSubmenuId: null,
    position: null,
    dimensions: null,
  };

  private currentContext: MenuContext | null = null;
  private menuContainer: HTMLElement | null = null;
  private longPressTimer: number | null = null;
  private longPressThreshold = 500; // ms

  private boundHandlers: {
    contextmenu?: (e: MouseEvent) => void;
    keydown?: (e: KeyboardEvent) => void;
    click?: (e: MouseEvent) => void;
    blur?: () => void;
    touchstart?: (e: TouchEvent) => void;
    touchend?: (e: TouchEvent) => void;
    touchcancel?: (e: TouchEvent) => void;
  } = {};

  private constructor() {
    // Private constructor for singleton pattern
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): ContextMenuManager {
    if (!ContextMenuManager.instance) {
      ContextMenuManager.instance = new ContextMenuManager();
    }
    return ContextMenuManager.instance;
  }

  /**
   * Initialize the manager and register global event listeners
   */
  initialize(container: HTMLElement): void {
    if (this.menuContainer) {
      console.warn('[ContextMenuManager] Already initialized');
      return;
    }

    this.menuContainer = container;
    this.registerGlobalListeners();
  }

  /**
   * Register global event listeners for context menu triggers
   */
  private registerGlobalListeners(): void {
    // Right-click context menu
    this.boundHandlers.contextmenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target) {
        return;
      }

      // Check if this is a native interactive element without a specific provider
      const isNativeInteractive = this.isNativeInteractiveElement(target);
      if (isNativeInteractive && !this.hasSpecificProvider(target)) {
        // Prevent any context menu (system or native) for native interactive elements
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Also check if clicking inside an interactive element
      const closestInteractive = target.closest('input, textarea, button, select, a[href]');
      if (closestInteractive && closestInteractive !== target && !this.hasSpecificProvider(target)) {
        // Prevent any context menu
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Prevent default and show custom menu
      e.preventDefault();
      e.stopPropagation();
      this.handleContextMenuTrigger(e);
    };

    // Shift+F10 keyboard shortcut
    this.boundHandlers.keydown = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key === 'F10') {
        e.preventDefault();
        e.stopPropagation();
        const target = document.activeElement as HTMLElement;
        if (target) {
          this.handleKeyboardTrigger(e, target);
        }
      } else if (e.key === 'Escape' && this.renderState.isOpen) {
        this.closeMenu();
      }
    };

    // Click outside to close
    // Use bubble phase so MenuItem can handle clicks first
    this.boundHandlers.click = (e: MouseEvent) => {
      if (this.renderState.isOpen) {
        const target = e.target as HTMLElement;
        // Check if click is inside menu container or any context menu element
        const isInsideMenu = (this.menuContainer && this.menuContainer.contains(target)) || 
                           target.closest('.context-menu') !== null ||
                           target.closest('.context-menu-item') !== null ||
                           target.closest('.context-menu-submenu') !== null ||
                           target.closest('.context-menu-container') !== null;
        
        if (!isInsideMenu) {
          // Use setTimeout to allow the click event to propagate to MenuItem first
          // If the click is on a menu item, it will handle it and close the menu
          // If not, we close it here
          setTimeout(() => {
            if (this.renderState.isOpen) {
              this.closeMenu();
            }
          }, 0);
        }
      }
    };

    // Window blur to close
    this.boundHandlers.blur = () => {
      if (this.renderState.isOpen) {
        this.closeMenu();
      }
    };

    // Long-press for touch devices
    this.boundHandlers.touchstart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (touch) {
        const target = e.target as HTMLElement;
        this.startLongPressTimer(e, target, touch.clientX, touch.clientY);
      }
    };

    this.boundHandlers.touchend = () => {
      this.cancelLongPressTimer();
    };

    this.boundHandlers.touchcancel = () => {
      this.cancelLongPressTimer();
    };

    // Register all listeners
    document.addEventListener('contextmenu', this.boundHandlers.contextmenu);
    document.addEventListener('keydown', this.boundHandlers.keydown);
    // Use bubble phase instead of capture phase so MenuItem can handle clicks first
    document.addEventListener('click', this.boundHandlers.click, false);
    window.addEventListener('blur', this.boundHandlers.blur);
    document.addEventListener('touchstart', this.boundHandlers.touchstart);
    document.addEventListener('touchend', this.boundHandlers.touchend);
    document.addEventListener('touchcancel', this.boundHandlers.touchcancel);
  }

  /**
   * Check if element is an interactive native element that should use browser's default context menu
   */
  private isNativeInteractiveElement(element: HTMLElement): boolean {
    const tagName = element.tagName.toLowerCase();
    return tagName === 'input' || 
           tagName === 'textarea' || 
           tagName === 'button' || 
           tagName === 'select' ||
           (tagName === 'a' && element.hasAttribute('href'));
  }

  /**
   * Check if element has a specific context menu provider registered
   */
  private hasSpecificProvider(element: HTMLElement): boolean {
    // Check if there's a provider that specifically targets this element or its classes/ID
    for (const [targetSelector] of this.providers.entries()) {
      // Skip semantic targets (desktop, window, file) - these are too broad
      if (targetSelector === 'desktop' || targetSelector === 'window' || targetSelector === 'file') {
        continue;
      }
      
      // Check if this element matches a specific CSS selector provider
      try {
        if (element.matches(targetSelector) || element.closest(targetSelector) === element) {
          return true;
        }
      } catch {
        // Invalid selector, skip
      }
    }
    return false;
  }

  /**
   * Handle contextmenu event
   */
  private handleContextMenuTrigger(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target) {
      console.warn('[ContextMenuManager] No target element for contextmenu event');
      return;
    }

    // Check if this is a native interactive element
    if (this.isNativeInteractiveElement(target)) {
      // Only show custom menu if there's a specific provider for this element
      if (!this.hasSpecificProvider(target)) {
        // Allow browser's default context menu for native interactive elements
        return;
      }
    }

    // Also check if clicking inside an interactive element (e.g., clicking on a span inside an input wrapper)
    const closestInteractive = target.closest('input, textarea, button, select, a[href]');
    if (closestInteractive && closestInteractive !== target) {
      // We're inside an interactive element, check if there's a specific provider
      if (!this.hasSpecificProvider(target)) {
        return;
      }
    }

    // Close any existing menu first
    if (this.renderState.isOpen) {
      this.closeMenu();
    }

    const context = this.createMenuContext(event, target);
    console.log('[ContextMenuManager] Context menu triggered:', {
      target: target.tagName,
      classes: Array.from(target.classList),
      programId: context.programId,
      windowId: context.windowId,
    });
    this.openMenu(context);
  }

  /**
   * Handle keyboard trigger (Shift+F10)
   */
  private handleKeyboardTrigger(event: KeyboardEvent, target: HTMLElement): void {
    if (this.renderState.isOpen) {
      this.closeMenu();
    }

    const context = this.createMenuContext(event, target);
    this.openMenu(context);
  }

  /**
   * Handle long-press trigger for touch devices
   */
  private startLongPressTimer(
    _event: TouchEvent,
    target: HTMLElement,
    x: number,
    y: number
  ): void {
    this.cancelLongPressTimer();

    this.longPressTimer = window.setTimeout(() => {
      this.triggerHapticFeedback('trigger');
      const syntheticEvent = new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
      });
      const context = this.createMenuContext(syntheticEvent, target);
      this.openMenu(context);
      this.longPressTimer = null;
    }, this.longPressThreshold);
  }

  private cancelLongPressTimer(): void {
    if (this.longPressTimer !== null) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  /**
   * Create MenuContext from trigger event
   */
  private createMenuContext(
    event: MouseEvent | KeyboardEvent | TouchEvent,
    target: HTMLElement
  ): MenuContext {
    // For desktop icons, find the actual .desktop-icon element (may be parent if clicked on child)
    let actualTarget: HTMLElement = target;
    const desktopIcon = target.closest('.desktop-icon') as HTMLElement;
    if (desktopIcon) {
      actualTarget = desktopIcon;
    }
    
    // Find program ID from target element
    let programId: string | undefined;
    let windowId: string | undefined;

    let element: HTMLElement | null = actualTarget;
    while (element && element !== document.body) {
      if (element.dataset.programId) {
        programId = element.dataset.programId;
      }
      if (element.dataset.windowId) {
        windowId = element.dataset.windowId;
      }
      element = element.parentElement;
    }

    return {
      event,
      target: actualTarget,
      selection: this.getSelectionState(),
      data: this.extractElementData(actualTarget),
      programId,
      windowId,
    };
  }

  /**
   * Extract selection state (for future file operations, etc.)
   */
  private getSelectionState(): unknown {
    // Check for desktop icon selection
    const desktopSelection = (window as any).__desktopSelection as Set<string> | undefined;
    if (desktopSelection && desktopSelection.size > 0) {
      return {
        type: 'desktop-icons',
        ids: Array.from(desktopSelection),
        count: desktopSelection.size,
      };
    }
    
    // Check for text selection
    const selection = window.getSelection();
    if (selection && selection.toString().trim()) {
      return {
        type: 'text',
        text: selection.toString(),
        range: selection.getRangeAt(0),
      };
    }
    return undefined;
  }

  /**
   * Extract data attributes from element
   */
  private extractElementData(element: HTMLElement): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    for (const attr of element.attributes) {
      if (attr.name.startsWith('data-')) {
        const key = attr.name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        try {
          data[key] = JSON.parse(attr.value);
        } catch {
          data[key] = attr.value;
        }
      }
    }
    return data;
  }

  /**
   * Open context menu
   */
  async openMenu(context: MenuContext): Promise<void> {
    if (this.renderState.isOpen) {
      this.closeMenu();
    }

    this.currentContext = context;

    // Find matching providers
    const providers = this.findProviders(context.target, context);
    if (providers.length === 0) {
      return; // No menu to show
    }

    // Generate menu items
    try {
      const items = await this.generateMenuItems(providers, context);
      if (items.length === 0) {
        return; // No items to show
      }

      this.currentContext = context;
      this.renderState.isOpen = true;
      this.renderState.isPositioning = true;

      // Trigger render (will be handled by Renderer)
      this.emit('menu:open', { context, items });

      requestAnimationFrame(() => {
        this.renderState.isPositioning = false;
      });
    } catch (error) {
      console.error('[ContextMenuManager] Error generating menu:', error);
    }
  }

  /**
   * Close context menu
   */
  closeMenu(): void {
    if (!this.renderState.isOpen) {
      return;
    }

    this.renderState.isOpen = false;
    this.renderState.activeItemId = null;
    this.renderState.openSubmenuId = null;
    this.currentContext = null;

    this.emit('menu:close', {});
  }

  /**
   * Find providers matching the target element
   */
  private findProviders(target: HTMLElement, context?: MenuContext): ContextMenuProvider[] {
    const matches: ContextMenuProvider[] = [];

    // Check semantic targets first
    for (const [targetSelector, providers] of this.providers.entries()) {
      if (this.matchesTarget(target, targetSelector, context)) {
        matches.push(...providers);
      }
    }

    // Sort by priority (higher first)
    matches.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    // Debug logging
    if (matches.length === 0) {
      console.log('[ContextMenuManager] No providers found for target:', {
        tag: target.tagName,
        classes: Array.from(target.classList),
        id: target.id,
        dataset: { ...target.dataset },
      });
    }

    return matches;
  }

  /**
   * Check if element matches target selector
   */
  private matchesTarget(element: HTMLElement, selector: string, context?: MenuContext): boolean {
    // Semantic targets
    if (selector === 'desktop') {
      // Check if element is inside desktop or is desktop itself
      const isInsideDesktop = element.classList.contains('desktop') || element.closest('.desktop') !== null;
      if (!isInsideDesktop) {
        return false;
      }
      // Exclude desktop menu when clicking on icons or folders (including their children)
      const isIcon = element.classList.contains('desktop-icon') || 
                     element.classList.contains('folder-icon') ||
                     element.closest('.desktop-icon') !== null ||
                     element.closest('.folder-icon') !== null;
      if (isIcon) {
        return false;
      }
      
      // Also check if there's an icon at the click coordinates
      if (context?.event && 'clientX' in context.event && 'clientY' in context.event) {
        const desktopElement = document.querySelector('.desktop');
        if (desktopElement) {
          // Use elementFromPoint to check if there's an icon at these coordinates
          const elementAtPoint = document.elementFromPoint(context.event.clientX, context.event.clientY);
          if (elementAtPoint) {
            const iconAtPoint = elementAtPoint.closest('.desktop-icon, .folder-icon');
            if (iconAtPoint) {
              return false;
            }
          }
        }
      }
      
      return true;
    }
    if (selector === 'window') {
      const isInsideWindow = element.classList.contains('window') || element.closest('.window') !== null;
      if (!isInsideWindow) {
        return false;
      }
      // Exclude native interactive elements from window menu
      if (this.isNativeInteractiveElement(element)) {
        return false;
      }
      // Also exclude if clicking inside an interactive element
      const closestInteractive = element.closest('input, textarea, button, select, a[href]');
      if (closestInteractive && closestInteractive !== element) {
        return false;
      }
      return true;
    }
    if (selector === 'file') {
      return element.dataset.type === 'file' || element.classList.contains('file');
    }

    // CSS selector
    try {
      return element.matches(selector) || element.closest(selector) !== null;
    } catch {
      return false;
    }
  }

  /**
   * Generate menu items from providers
   */
  private async generateMenuItems(
    providers: ContextMenuProvider[],
    context: MenuContext
  ): Promise<MenuItem[]> {
    const items: MenuItem[] = [];
    const timeout = 200; // ms

    for (const provider of providers) {
      if (provider.items) {
        // Static items - deep clone to preserve functions
        const clonedItems = provider.items.map(item => ({
          ...item,
          submenu: item.submenu ? item.submenu.map(subItem => ({ ...subItem })) : undefined,
        }));
        items.push(...clonedItems);
      } else if (provider.generator) {
        // Dynamic items with timeout protection
        try {
          const generatorPromise = Promise.resolve(provider.generator(context));
          const timeoutPromise = new Promise<MenuItem[]>((resolve) => {
            setTimeout(() => resolve([]), timeout);
          });

          const generatedItems = await Promise.race([generatorPromise, timeoutPromise]);
          items.push(...generatedItems);
        } catch (error) {
          console.error(`[ContextMenuManager] Generator error for provider ${provider.id}:`, error);
        }
      }
    }

    // Filter out disabled/invisible items (but preserve actions)
    return items.filter((item) => item.visible !== false && item.enabled !== false);
  }

  /**
   * Register a context menu provider
   */
  registerProvider(provider: ContextMenuProvider): () => void {
    const target = provider.target;
    if (!this.providers.has(target)) {
      this.providers.set(target, []);
    }

    const providers = this.providers.get(target)!;
    
    // Check if provider with same ID already exists
    const existingIndex = providers.findIndex((p) => p.id === provider.id);
    if (existingIndex >= 0) {
      console.warn('[ContextMenuManager] Provider with ID already exists, replacing:', provider.id);
      providers[existingIndex] = provider;
    } else {
      providers.push(provider);
    }

    console.log('[ContextMenuManager] Provider registered:', {
      id: provider.id,
      target: provider.target,
      programId: provider.programId,
      itemCount: provider.items?.length || 0,
      totalProviders: providers.length,
      replaced: existingIndex >= 0,
    });

    // Return unregister function
    return () => {
      const list = this.providers.get(target);
      if (list) {
        const index = list.indexOf(provider);
        if (index >= 0) {
          list.splice(index, 1);
        }
        if (list.length === 0) {
          this.providers.delete(target);
        }
      }
    };
  }

  /**
   * Update render state (called by Renderer)
   */
  updateRenderState(updates: Partial<MenuRenderState>): void {
    this.renderState = { ...this.renderState, ...updates };
  }

  /**
   * Handle menu item selection
   */
  async handleMenuItemSelect(item: MenuItem): Promise<void> {
    const context = this.currentContext;
    if (!context) return;

    // Execute action
    if (item.action) {
      try {
        const result = item.action(context);
        // Handle both sync and async actions
        if (result instanceof Promise) {
          await result;
        }
        this.triggerHapticFeedback('success');
      } catch (error) {
        console.error('[ContextMenuManager] Action error:', error);
        this.triggerHapticFeedback('error');
      }
    }

    // Close menu after action (unless it's a submenu trigger)
    if (item.type !== 'submenu') {
      this.closeMenu();
    }
  }

  /**
   * Trigger haptic feedback
   */
  triggerHapticFeedback(pattern: HapticPattern): void {
    if (!('vibrate' in navigator)) {
      return; // Not supported
    }

    const patterns: Record<HapticPattern, number | number[]> = {
      trigger: 10,
      success: [20, 50, 20],
      error: 100,
    };

    navigator.vibrate(patterns[pattern]);
  }

  /**
   * Emit event (for integration with event bus)
   */
  private emit(event: string, payload: unknown): void {
    // Will be integrated with event bus in integration phase
    const customEvent = new CustomEvent(`contextmenu:${event}`, { detail: payload });
    document.dispatchEvent(customEvent);
  }

  /**
   * Cleanup and destroy manager
   */
  destroy(): void {
    // Remove event listeners
    if (this.boundHandlers.contextmenu) {
      document.removeEventListener('contextmenu', this.boundHandlers.contextmenu);
    }
    if (this.boundHandlers.keydown) {
      document.removeEventListener('keydown', this.boundHandlers.keydown);
    }
    if (this.boundHandlers.click) {
      document.removeEventListener('click', this.boundHandlers.click, false);
    }
    if (this.boundHandlers.blur) {
      window.removeEventListener('blur', this.boundHandlers.blur);
    }
    if (this.boundHandlers.touchstart) {
      document.removeEventListener('touchstart', this.boundHandlers.touchstart);
    }
    if (this.boundHandlers.touchend) {
      document.removeEventListener('touchend', this.boundHandlers.touchend);
    }
    if (this.boundHandlers.touchcancel) {
      document.removeEventListener('touchcancel', this.boundHandlers.touchcancel);
    }

    this.cancelLongPressTimer();
    this.closeMenu();

    this.providers.clear();
    this.menuContainer = null;
  }
}

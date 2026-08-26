/**
 * Accessibility utilities for context menu system
 */

/**
 * Get ARIA role for menu item based on type
 */
export function getMenuItemRole(type?: string): string {
  switch (type) {
    case 'checkbox':
      return 'menuitemcheckbox';
    case 'radio':
      return 'menuitemradio';
    case 'separator':
      return 'separator';
    default:
      return 'menuitem';
  }
}

/**
 * Create accessible label for menu item
 */
export function getAccessibleLabel(item: { label: string; shortcut?: string; checked?: boolean }): string {
  let label = item.label;
  if (item.checked !== undefined) {
    label = `${item.checked ? 'Checked' : 'Unchecked'} ${label}`;
  }
  if (item.shortcut) {
    label = `${label}, ${item.shortcut}`;
  }
  return label;
}

/**
 * Announce menu state to screen readers
 */
export function announceToScreenReader(message: string): void {
  const announcement = document.createElement('div');
  announcement.setAttribute('role', 'status');
  announcement.setAttribute('aria-live', 'polite');
  announcement.setAttribute('aria-atomic', 'true');
  announcement.className = 'sr-only';
  announcement.style.position = 'absolute';
  announcement.style.left = '-10000px';
  announcement.style.width = '1px';
  announcement.style.height = '1px';
  announcement.style.overflow = 'hidden';
  announcement.textContent = message;

  document.body.appendChild(announcement);

  // Remove after announcement
  setTimeout(() => {
    document.body.removeChild(announcement);
  }, 1000);
}

/**
 * Restore focus to original element
 */
export function restoreFocus(element: HTMLElement | null): void {
  if (element && typeof element.focus === 'function') {
    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      try {
        element.focus();
      } catch (error) {
        // Element may not be focusable
        console.warn('[Accessibility] Could not restore focus:', error);
      }
    });
  }
}

/**
 * Check if element is focusable
 */
export function isFocusable(element: HTMLElement): boolean {
  const tagName = element.tagName.toLowerCase();
  const tabIndex = element.getAttribute('tabindex');

  // Native focusable elements
  if (
    tagName === 'input' ||
    tagName === 'button' ||
    tagName === 'select' ||
    tagName === 'textarea' ||
    tagName === 'a' ||
    (tagName === 'area' && element.hasAttribute('href'))
  ) {
    return !element.hasAttribute('disabled');
  }

  // Elements with tabindex
  if (tabIndex !== null) {
    const index = parseInt(tabIndex, 10);
    return index >= 0;
  }

  return false;
}

/**
 * Get next focusable element in DOM order
 */
export function getNextFocusable(element: HTMLElement, reverse = false): HTMLElement | null {
  const allElements = Array.from(
    document.querySelectorAll<HTMLElement>('*')
  ).filter(isFocusable);

  const currentIndex = allElements.indexOf(element);
  if (currentIndex === -1) return null;

  const nextIndex = reverse ? currentIndex - 1 : currentIndex + 1;
  if (nextIndex < 0 || nextIndex >= allElements.length) {
    return reverse ? allElements[allElements.length - 1] : allElements[0];
  }

  return allElements[nextIndex];
}

/**
 * Theme management utilities for context menu
 */

/**
 * Get CSS variable value
 */
export function getCSSVariable(name: string, element?: HTMLElement): string {
  const target = element || document.documentElement;
  return getComputedStyle(target).getPropertyValue(name).trim();
}

/**
 * Set CSS variable value
 */
export function setCSSVariable(name: string, value: string, element?: HTMLElement): void {
  const target = element || document.documentElement;
  target.style.setProperty(name, value);
}

/**
 * Context menu theme variables
 */
export const MenuThemeVariables = {
  bg: '--menu-bg',
  text: '--menu-text',
  itemHover: '--menu-item-hover',
  itemActive: '--menu-item-active',
  itemDisabled: '--menu-item-disabled',
  shadow: '--menu-shadow',
  radius: '--menu-radius',
  border: '--menu-border',
  separator: '--menu-separator',
} as const;

/**
 * Apply theme overrides to a container element
 */
export function applyMenuTheme(
  container: HTMLElement,
  overrides: Partial<Record<string, string>>
): () => void {
  const originalValues: Record<string, string> = {};

  for (const [key, value] of Object.entries(overrides)) {
    const varName = key.startsWith('--') ? key : `--menu-${key}`;
    originalValues[varName] = getCSSVariable(varName, container);
    setCSSVariable(varName, value, container);
  }

  // Return cleanup function
  return () => {
    for (const [varName, originalValue] of Object.entries(originalValues)) {
      setCSSVariable(varName, originalValue, container);
    }
  };
}

/**
 * Get current theme mode
 */
export function getThemeMode(): 'light' | 'dark' {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

/**
 * Watch for theme changes
 */
export function watchThemeMode(callback: (mode: 'light' | 'dark') => void): () => void {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
        callback(getThemeMode());
      }
    }
  });

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });

  // Initial call
  callback(getThemeMode());

  // Return cleanup function
  return () => observer.disconnect();
}

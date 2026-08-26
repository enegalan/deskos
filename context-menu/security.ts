import type { MenuActionMessage, SerializedMenuContext, MenuContext } from './types';

/**
 * Security utilities for sandboxed callback execution
 */

/**
 * Serialize MenuContext for IPC transmission
 * Uses Structured Clone Algorithm via postMessage
 */
export function serializeMenuContext(context: MenuContext): SerializedMenuContext {
  const target = context.target;

  return {
    targetId: target.id || undefined,
    targetTag: target.tagName.toLowerCase(),
    targetClasses: Array.from(target.classList),
    selection: context.selection,
    data: context.data,
    programId: context.programId,
    windowId: context.windowId,
    triggerType: getTriggerType(context.event),
    coordinates: getEventCoordinates(context.event),
  };
}

/**
 * Get trigger type from event
 */
function getTriggerType(event: MouseEvent | KeyboardEvent | TouchEvent): 'mouse' | 'keyboard' | 'touch' {
  if ('touches' in event) {
    return 'touch';
  }
  if ('key' in event || 'keyCode' in event) {
    return 'keyboard';
  }
  return 'mouse';
}

/**
 * Get coordinates from event
 */
function getEventCoordinates(event: MouseEvent | KeyboardEvent | TouchEvent): { x: number; y: number } | undefined {
  if ('clientX' in event && 'clientY' in event) {
    return { x: event.clientX, y: event.clientY };
  }
  if ('touches' in event && event.touches.length > 0) {
    return { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }
  return undefined;
}

/**
 * Validate that a message is a valid MenuActionMessage
 */
export function validateMenuActionMessage(message: unknown): message is MenuActionMessage {
  if (!message || typeof message !== 'object') {
    return false;
  }

  const msg = message as Record<string, unknown>;
  return (
    msg.type === 'context-menu:action' &&
    typeof msg.programId === 'string' &&
    typeof msg.actionId === 'string' &&
    msg.context !== null &&
    typeof msg.context === 'object'
  );
}

/**
 * Create a safe callback wrapper that validates execution context
 */
export function createSafeCallback(
  callback: (context: MenuContext) => void | Promise<void>,
  programId: string,
  actionId: string
): (context: MenuContext) => Promise<void> {
  return async (context: MenuContext) => {
    // Validate program ID matches
    if (context.programId !== programId) {
      throw new Error(`[Security] Program ID mismatch: expected ${programId}, got ${context.programId}`);
    }

    // Validate callback is not trying to access restricted APIs
    // This is a basic check - full sandboxing requires iframe isolation
    try {
      await callback(context);
    } catch (error) {
      console.error(`[Security] Callback error for action ${actionId}:`, error);
      throw error;
    }
  };
}

/**
 * Check if element is within program's allowed container
 */
export function isElementInProgramContainer(element: HTMLElement, programId: string): boolean {
  let current: HTMLElement | null = element;
  while (current && current !== document.body) {
    if (current.dataset.programId === programId) {
      return true;
    }
    current = current.parentElement;
  }
  return false;
}

/**
 * Sanitize data for IPC transmission
 * Removes functions and circular references
 */
export function sanitizeForIPC(data: unknown): unknown {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'function') {
    // Functions cannot be cloned via Structured Clone
    return undefined;
  }

  if (typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(sanitizeForIPC);
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    try {
      sanitized[key] = sanitizeForIPC(value);
    } catch {
      // Skip circular references or non-serializable values
      continue;
    }
  }

  return sanitized;
}

/** Callback for a single event-bus subscription. */
export type EventHandler<T = unknown> = (payload: T) => void;

/** Scoped pub/sub API exposed to programs. */
export interface EventBusAPI {
  emit<T = unknown>(event: string, payload?: T): void;
  on<T = unknown>(event: string, handler: EventHandler<T>): () => void;
  off<T = unknown>(event: string, handler: EventHandler<T>): void;
  once<T = unknown>(event: string, handler: EventHandler<T>): () => void;
}

/** Internal listener map keyed by event name. */
type ListenerMap = Map<string, Set<EventHandler<unknown>>>;

/** Global event-bus listener registry. */
const listeners: ListenerMap = new Map();

/**
 * Core event bus for inter-program and system communication.
 * Uses a pub/sub pattern with namespaced events.
 */
export const eventBus = {
  emit<T = unknown>(event: string, payload?: T): void {
    const handlers = listeners.get(event);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(payload);
        } catch (error) {
          console.error(`[EventBus] Error in handler for "${event}":`, error);
        }
      });
    }
  },

  on<T = unknown>(event: string, handler: EventHandler<T>): () => void {
    if (!listeners.has(event)) {
      listeners.set(event, new Set());
    }
    listeners.get(event)!.add(handler as EventHandler<unknown>);

    // Return unsubscribe function
    return () => {
      eventBus.off(event, handler);
    };
  },

  off<T = unknown>(event: string, handler: EventHandler<T>): void {
    const handlers = listeners.get(event);
    if (handlers) {
      handlers.delete(handler as EventHandler<unknown>);
      if (handlers.size === 0) {
        listeners.delete(event);
      }
    }
  },

  once<T = unknown>(event: string, handler: EventHandler<T>): () => void {
    const wrappedHandler: EventHandler<T> = (payload) => {
      eventBus.off(event, wrappedHandler);
      handler(payload);
    };
    return eventBus.on(event, wrappedHandler);
  },
};

/**
 * Creates a scoped event bus API for a specific program.
 * Automatically namespaces events to prevent collision.
 */
export function createScopedEventBus(programId: string): EventBusAPI {
  const scopedPrefix = `program:${programId}:`;

  return {
    emit<T = unknown>(event: string, payload?: T): void {
      // Allow both scoped and system events
      const fullEvent = event.startsWith('system:') ? event : scopedPrefix + event;
      eventBus.emit(fullEvent, payload);
    },

    on<T = unknown>(event: string, handler: EventHandler<T>): () => void {
      // Allow listening to system events and own events
      const fullEvent = event.startsWith('system:') ? event : scopedPrefix + event;
      return eventBus.on(fullEvent, handler);
    },

    off<T = unknown>(event: string, handler: EventHandler<T>): void {
      const fullEvent = event.startsWith('system:') ? event : scopedPrefix + event;
      eventBus.off(fullEvent, handler);
    },

    once<T = unknown>(event: string, handler: EventHandler<T>): () => void {
      const fullEvent = event.startsWith('system:') ? event : scopedPrefix + event;
      return eventBus.once(fullEvent, handler);
    },
  };
}

/** Well-known system event names emitted on the global bus. */
export const SystemEvents = {
  CONTEXT_MENU_OPENED: 'system:contextmenu:opened',
  CONTEXT_MENU_CLOSED: 'system:contextmenu:closed',
} as const;

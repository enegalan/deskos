/** Scoped key-value storage API for a program. */
export interface StorageAPI {
  getItem<T = unknown>(key: string): T | null;
  setItem<T = unknown>(key: string, value: T): void;
  removeItem(key: string): void;
  clear(): void;
  keys(): string[];
}

/** Prefix for all DeskOS localStorage keys. */
const STORAGE_PREFIX = 'deskos';

/**
 * Creates a scoped storage instance for a specific program.
 * All keys are automatically prefixed with the program ID to prevent collision.
 */
export function createScopedStorage(programId: string): StorageAPI {
  const prefix = `${STORAGE_PREFIX}:${programId}:`;

  return {
    getItem<T = unknown>(key: string): T | null {
      try {
        const fullKey = prefix + key;
        const value = localStorage.getItem(fullKey);
        if (value === null) return null;
        return JSON.parse(value) as T;
      } catch {
        return null;
      }
    },

    setItem<T = unknown>(key: string, value: T): void {
      try {
        const fullKey = prefix + key;
        localStorage.setItem(fullKey, JSON.stringify(value));
      } catch (error) {
        console.error(`[Storage] Failed to set item "${key}":`, error);
        throw error;
      }
    },

    removeItem(key: string): void {
      const fullKey = prefix + key;
      localStorage.removeItem(fullKey);
    },

    clear(): void {
      // Only clear keys belonging to this program
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key));
    },

    keys(): string[] {
      const programKeys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) {
          // Return key without prefix
          programKeys.push(key.slice(prefix.length));
        }
      }
      return programKeys;
    },
  };
}

/**
 * Creates a Proxy-wrapped storage instance that validates all operations.
 * Ensures programs cannot escape their assigned scope.
 */
export function createSecureScopedStorage(programId: string): StorageAPI {
  const storage = createScopedStorage(programId);

  return new Proxy(storage, {
    get(target, prop: keyof StorageAPI) {
      const value = target[prop];
      if (typeof value === 'function') {
        return (...args: unknown[]) => {
          // Validate key doesn't try to escape scope with ../ or absolute paths
          if (args[0] && typeof args[0] === 'string') {
            const key = args[0];
            if (key.includes('..') || key.startsWith('/') || key.includes(':')) {
              throw new Error(`Invalid storage key: "${key}"`);
            }
          }
          return (value as (...args: unknown[]) => unknown).apply(target, args);
        };
      }
      return value;
    },
  });
}

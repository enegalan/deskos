import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
  type ReactNode,
} from 'react';
import { getWindowSessionState, setWindowSessionState } from './session';

/** Context for the current window id. */
const WindowIdContext = createContext<string | null>(null);

/** Provides the current window id to program content for session state. */
export function WindowSessionProvider({
  windowId,
  children,
}: {
  windowId: string;
  children: ReactNode;
}) {
  return <WindowIdContext.Provider value={windowId}>{children}</WindowIdContext.Provider>;
}

/** Returns the window id for the enclosing {@link WindowSessionProvider}. */
export function useWindowId(): string {
  const windowId = useContext(WindowIdContext);
  if (!windowId) {
    throw new Error('useWindowId must be used within WindowSessionProvider');
  }
  return windowId;
}

/** Options for the useWindowSessionState hook. */
export interface UseWindowSessionStateOptions<T, S = T> {
  /** Transform persisted value back into runtime state on restore. */
  revive?: (saved: S) => T;
  /** Transform runtime state before persisting. */
  serialize?: (value: T) => S;
}

/**
 * Drop-in useState replacement that persists per-window state in the desktop session.
 * Use this for any program state that should survive reloads.
 */
export function useWindowSessionState<T, S = T>(
  key: string,
  initial: T | (() => T),
  options?: UseWindowSessionStateOptions<T, S>
): [T, Dispatch<SetStateAction<T>>] {
  const windowId = useWindowId();

  const serializeRef = useRef(options?.serialize);
  serializeRef.current = options?.serialize;

  const [state, setState] = useState<T>(() => {
    const saved = getWindowSessionState(windowId, key);
    if (saved !== undefined) {
      if (options?.revive) {
        return options.revive(saved as S);
      }
      return saved as T;
    }
    return typeof initial === 'function' ? (initial as () => T)() : initial;
  });

  useEffect(() => {
    const serialize = serializeRef.current;
    const value = serialize ? serialize(state) : state;
    setWindowSessionState(windowId, key, value);
  }, [windowId, key, state]);

  return [state, setState];
}

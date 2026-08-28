/**
 * Dynamic program icon resolvers — apps can switch icons based on runtime state.
 */

/** programId → resolver (returns icon name) */
const iconResolvers = new Map<string, () => string>();

/**
 * Register a dynamic icon resolver for a program.
 *
 * @param programId - Program id
 * @param resolver - Return the icon name to display
 * @returns Unregister function
 */
export function registerProgramIconResolver(programId: string, resolver: () => string): () => void {
  iconResolvers.set(programId, resolver);
  return () => {
    if (iconResolvers.get(programId) === resolver) {
      iconResolvers.delete(programId);
    }
  };
}

/**
 * Resolve the display icon for a program (falls back to static metadata icon).
 */
export function resolveProgramIcon(programId: string, fallbackIcon: string): string {
  const resolver = iconResolvers.get(programId);
  if (!resolver) return fallbackIcon;
  try {
    return resolver();
  } catch (error) {
    console.error(`[program-icons] resolveIcon failed for ${programId}:`, error);
    return fallbackIcon;
  }
}

/**
 * Notify shell UI that a program's icon may have changed.
 */
export function notifyProgramIconChanged(programId: string): void {
  window.dispatchEvent(new CustomEvent('program-icon-updated', { detail: { programId } }));
}

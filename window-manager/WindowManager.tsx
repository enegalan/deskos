import { useEffect } from 'react';
import { useKernel } from '@core/kernel';
import { Window } from './Window';
import { flushSessionPersist } from '@core/session';

/** Renders all open windows from kernel state in stacking order */
export function WindowManager() {
  const windows = useKernel((state) => state.windows);
  const windowOrder = useKernel((state) => state.windowOrder);
  const persistAllWindowLayouts = useKernel((state) => state.persistAllWindowLayouts);
  const persistSession = useKernel((state) => state.persistSession);

  useEffect(() => {
    const onBeforeUnload = () => {
      persistAllWindowLayouts();
      flushSessionPersist();
      persistSession();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [persistAllWindowLayouts, persistSession]);

  return (
    <div className="window-manager">
      {windows.map((win) => (
        <Window key={win.id} window={win} windowOrder={windowOrder} />
      ))}
    </div>
  );
}

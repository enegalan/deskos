import { useKernel } from '@core/kernel';
import { Window } from './Window';

/** Renders all open windows from kernel state in stacking order */
export function WindowManager() {
  const windows = useKernel((state) => state.windows);
  const windowOrder = useKernel((state) => state.windowOrder);

  return (
    <div className="window-manager">
      {windows.map((win) => (
        <Window key={win.id} window={win} windowOrder={windowOrder} />
      ))}
    </div>
  );
}

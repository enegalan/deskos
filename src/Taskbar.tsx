import { useState, useEffect, Fragment } from 'react';
import { useKernel } from '@core/kernel';
import { formatDockClock } from '@core/dock-clock';
import { programList } from 'virtual:programs';
import { launchOrFocusProgram } from '@core/context';
import { resolveProgramIcon } from '@core/program-icons';
import { getDockRole } from '@core/program-registry';
import { DOCK_ITEMS, getDockPinnedProgramIds } from '@core/dock';
import { Icon } from '../components/Icon';
import { hasIcon, type IconName } from '@core/icons';

/** Bottom dock: layout driven by `DOCK_ITEMS` (programs, separators, running, clock). */
export function Taskbar() {
  const windows = useKernel((state) => state.windows);
  const activeWindowId = useKernel((state) => state.activeWindowId);
  const focusWindow = useKernel((state) => state.focusWindow);
  const restoreWindow = useKernel((state) => state.restoreWindow);
  const settings = useKernel((state) => state.settings);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [iconRevision, setIconRevision] = useState(0);

  const handleLaunchProgram = async (programId: string) => {
    await launchOrFocusProgram(programId);
  };

  const handleWindowClick = (windowId: string, isMinimized: boolean) => {
    if (isMinimized) {
      restoreWindow(windowId);
    }
    focusWindow(windowId);
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const refreshIcons = () => setIconRevision((n) => n + 1);
    window.addEventListener('program-icon-updated', refreshIcons);
    return () => window.removeEventListener('program-icon-updated', refreshIcons);
  }, []);

  const windowsByProgram = new Map<string, typeof windows>();
  windows.forEach((win) => {
    if (!windowsByProgram.has(win.programId)) {
      windowsByProgram.set(win.programId, []);
    }
    windowsByProgram.get(win.programId)!.push(win);
  });

  const resolveProgram = (programId: string) => programList.find((p) => p.id === programId);

  const pinnedProgramIds = getDockPinnedProgramIds();
  const runningProgramIds = Array.from(windowsByProgram.keys()).filter(
    (programId) => !pinnedProgramIds.has(programId)
  );

  const renderProgramButton = (programId: string, variant: 'launcher' | 'program' | 'window') => {
    const program = resolveProgram(programId);
    if (!program) return null;

    const programWindows = windowsByProgram.get(programId) || [];
    const hasWindows = programWindows.length > 0;
    const isActive = programWindows.some((w) => w.id === activeWindowId);
    const isRunning = hasWindows;
    const isLauncher = variant === 'launcher';
    const isRunningSlot = variant === 'window';
    const iconName = resolveProgramIcon(programId, program.icon);
    void iconRevision;

    return (
      <button
        key={programId}
        className={`dock-item ${isLauncher ? 'dock-launcher' : isRunningSlot ? 'dock-window' : 'dock-program'} ${isRunning ? 'running' : ''} ${isActive ? 'active' : ''}`}
        onClick={() => {
          if (isRunningSlot) {
            const activeWin = programWindows.find((w) => w.id === activeWindowId);
            if (activeWin) {
              handleWindowClick(activeWin.id, activeWin.isMinimized);
            } else {
              handleWindowClick(programWindows[0].id, programWindows[0].isMinimized);
            }
            return;
          }
          handleLaunchProgram(programId);
        }}
        title={isRunningSlot ? programWindows.map((w) => w.title).join(', ') : program.name}
        draggable={!isLauncher}
        onDragStart={
          isLauncher
            ? undefined
            : (e) => {
                e.dataTransfer.setData('application/x-deskos-program-id', programId);
                e.dataTransfer.effectAllowed = 'copy';
              }
        }
        data-program-id={programId}
      >
        <div className="dock-icon-wrapper">
          {hasIcon(iconName as IconName) ? (
            <Icon
              name={(isLauncher ? iconName || 'launcher' : iconName) as IconName}
              size={48}
              color={isLauncher || isRunningSlot ? 'rgba(255, 255, 255, 0.9)' : undefined}
              fallback={
                typeof iconName === 'string' && !hasIcon(iconName as IconName)
                  ? iconName
                  : undefined
              }
            />
          ) : (
            <span>{isLauncher ? iconName || '⊞' : iconName}</span>
          )}
        </div>
        {(isRunningSlot || hasWindows) && <div className="dock-indicator" />}
      </button>
    );
  };

  return (
    <div className="dock">
      <div className="dock-container">
        {DOCK_ITEMS.map((item, index) => {
          if (item.type === 'separator') {
            return <div key={`separator-${index}`} className="dock-separator" />;
          }

          if (item.type === 'clock') {
            return (
              <div key={`clock-${index}`} className="dock-tray">
                <span className="dock-clock">{formatDockClock(currentTime, settings)}</span>
              </div>
            );
          }

          if (item.type === 'running') {
            return (
              <Fragment key={`running-${index}`}>
                {runningProgramIds.map((programId) => renderProgramButton(programId, 'window'))}
              </Fragment>
            );
          }

          const variant = getDockRole(item.programId) === 'launcher' ? 'launcher' : 'program';
          return renderProgramButton(item.programId, variant);
        })}
      </div>
    </div>
  );
}

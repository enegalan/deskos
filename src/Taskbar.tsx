import { useState, useEffect, useRef, Fragment } from 'react';
import { useKernel, type WindowState } from '@core/kernel';
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
  const [pickerProgramId, setPickerProgramId] = useState<string | null>(null);
  const dockRef = useRef<HTMLDivElement>(null);

  const activateWindow = (windowId: string, isMinimized: boolean) => {
    if (isMinimized) {
      restoreWindow(windowId);
    }
    focusWindow(windowId);
    setPickerProgramId(null);
  };

  const handleProgramClick = async (programId: string, programWindows: WindowState[]) => {
    if (programWindows.length === 0) {
      await launchOrFocusProgram(programId);
      setPickerProgramId(null);
      return;
    }

    if (programWindows.length === 1) {
      activateWindow(programWindows[0].id, programWindows[0].isMinimized);
      return;
    }

    // Multiple windows: toggle picker so the user can choose which to restore/focus.
    setPickerProgramId((current) => (current === programId ? null : programId));
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

  useEffect(() => {
    if (!pickerProgramId) return;
    const programWindows = windows.filter((w) => w.programId === pickerProgramId);
    if (programWindows.length < 2) {
      setPickerProgramId(null);
      return;
    }
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (target && dockRef.current?.contains(target)) return;
      setPickerProgramId(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPickerProgramId(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [pickerProgramId, windows]);

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
    const showPicker = pickerProgramId === programId && programWindows.length > 1;
    void iconRevision;

    return (
      <div key={programId} className="dock-item-slot">
        <button
          type="button"
          className={`dock-item ${isLauncher ? 'dock-launcher' : isRunningSlot ? 'dock-window' : 'dock-program'} ${isRunning ? 'running' : ''} ${isActive ? 'active' : ''}`}
          onClick={() => {
            void handleProgramClick(programId, programWindows);
          }}
          title={
            programWindows.length > 1
              ? `${program.name} (${programWindows.length} windows)`
              : program.name
          }
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
          {(isRunningSlot || hasWindows) && (
            <div
              className={`dock-indicator${programWindows.length > 1 ? ' dock-indicator-multi' : ''}`}
            />
          )}
        </button>

        {showPicker && (
          <div className="dock-window-picker" role="menu">
            {programWindows.map((win) => (
              <button
                key={win.id}
                type="button"
                role="menuitem"
                className={`dock-window-picker-item${win.id === activeWindowId ? ' active' : ''}${
                  win.isMinimized ? ' minimized' : ''
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  activateWindow(win.id, win.isMinimized);
                }}
              >
                <span className="dock-window-picker-title">{win.title}</span>
                {win.isMinimized && <span className="dock-window-picker-badge">Minimized</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="dock" ref={dockRef}>
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

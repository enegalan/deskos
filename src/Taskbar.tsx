import { useState, useEffect } from 'react';
import { useKernel } from '@core/kernel';
import { programList } from 'virtual:programs';
import { launchOrFocusProgram } from '@core/context';
import { getDockLauncher, getDockPins, getDockPinnedProgramIds } from '../dock/dock';
import { Icon } from '../components/Icon';
import { hasIcon, type IconName } from '@core/icons';

/** Bottom dock: launcher, pinned apps, running windows, and clock tray. */
export function Taskbar() {
  const windows = useKernel((state) => state.windows);
  const activeWindowId = useKernel((state) => state.activeWindowId);
  const focusWindow = useKernel((state) => state.focusWindow);
  const restoreWindow = useKernel((state) => state.restoreWindow);
  const settings = useKernel((state) => state.settings);
  const [currentTime, setCurrentTime] = useState(new Date());

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

  const formatTime = (date: Date): string => {
    const options: Intl.DateTimeFormatOptions = {
      timeZone: settings.timezone,
      hour12: settings.timeFormat === '12h',
      hour: '2-digit',
      minute: '2-digit',
    };

    if (settings.showDate) {
      options.year = 'numeric';
      options.month = 'short';
      options.day = 'numeric';
    }

    return new Intl.DateTimeFormat('en-US', options).format(date);
  };

  // Group windows by program
  const windowsByProgram = new Map<string, typeof windows>();
  windows.forEach((win) => {
    if (!windowsByProgram.has(win.programId)) {
      windowsByProgram.set(win.programId, []);
    }
    windowsByProgram.get(win.programId)!.push(win);
  });

  // Get unique programs with windows
  const programsWithWindows = Array.from(windowsByProgram.keys());

  const resolveProgram = (programId: string) =>
    programList.find((p) => p.id === programId);

  const dockLauncher = getDockLauncher();
  const launcherProgram = dockLauncher
    ? resolveProgram(dockLauncher.programId)
    : undefined;
  const launcherWindows = dockLauncher
    ? windowsByProgram.get(dockLauncher.programId) || []
    : [];
  const launcherHasWindows = launcherWindows.length > 0;
  const launcherIsActive = launcherWindows.some((w) => w.id === activeWindowId);

  const programShortcuts = getDockPins();
  const pinnedProgramIds = getDockPinnedProgramIds();

  // Unpinned running apps only (pins stay in place with their own indicator)
  const runningProgramIds = programsWithWindows.filter(
    (programId) => !pinnedProgramIds.has(programId)
  );

  return (
    <div className="dock">
      <div className="dock-container">
        {dockLauncher && (
          <button
            className={`dock-item dock-launcher ${launcherIsActive ? 'active' : ''}`}
            onClick={() => handleLaunchProgram(dockLauncher.programId)}
            title={launcherProgram?.name || 'Launcher'}
          >
            <div className="dock-icon-wrapper">
              {hasIcon((launcherProgram?.icon || 'launcher') as IconName) ? (
                <Icon
                  name={(launcherProgram?.icon || 'launcher') as IconName}
                  size={48}
                  color="rgba(255, 255, 255, 0.9)"
                />
              ) : (
                <span>{launcherProgram?.icon || '⊞'}</span>
              )}
            </div>
            {launcherHasWindows && <div className="dock-indicator" />}
          </button>
        )}

        {/* Separator */}
        {(programShortcuts.length > 0 || runningProgramIds.length > 0) && (
          <div className="dock-separator" />
        )}

        {programShortcuts.map((item) => {
          const program = resolveProgram(item.programId);
          if (!program) return null;

          const programWindows = windowsByProgram.get(item.programId) || [];
          const hasWindows = programWindows.length > 0;
          const isActive = programWindows.some((w) => w.id === activeWindowId);

          return (
            <button
              key={item.programId}
              className={`dock-item dock-program ${isActive ? 'active' : ''}`}
              onClick={() => handleLaunchProgram(item.programId)}
              title={program.name}
              draggable={true}
              onDragStart={(e) => {
                e.dataTransfer.setData('application/x-deskos-program-id', item.programId);
                e.dataTransfer.effectAllowed = 'copy';
              }}
              data-program-id={item.programId}
            >
              <div className="dock-icon-wrapper">
                {hasIcon(program.icon as IconName) ? (
                  <Icon
                    name={program.icon as IconName}
                    size={48}
                    fallback={
                      typeof program.icon === 'string' && !hasIcon(program.icon as IconName)
                        ? program.icon
                        : undefined
                    }
                  />
                ) : (
                  <span>{program.icon}</span>
                )}
              </div>
              {hasWindows && <div className="dock-indicator" />}
            </button>
          );
        })}

        {runningProgramIds.map((programId) => {
          const programWindows = windowsByProgram.get(programId)!;
          const isActive = programWindows.some((w) => w.id === activeWindowId);
          const program = resolveProgram(programId);

          if (!program) return null;

          return (
            <button
              key={programId}
              className={`dock-item dock-window ${isActive ? 'active' : ''}`}
              onClick={() => {
                const activeWin = programWindows.find((w) => w.id === activeWindowId);
                if (activeWin) {
                  handleWindowClick(activeWin.id, activeWin.isMinimized);
                } else {
                  handleWindowClick(programWindows[0].id, programWindows[0].isMinimized);
                }
              }}
              title={programWindows.map((w) => w.title).join(', ')}
              draggable={true}
              onDragStart={(e) => {
                e.dataTransfer.setData('application/x-deskos-program-id', programId);
                e.dataTransfer.effectAllowed = 'copy';
              }}
              data-program-id={programId}
            >
              <div className="dock-icon-wrapper">
                {hasIcon(program.icon as IconName) ? (
                  <Icon
                    name={program.icon as IconName}
                    size={48}
                    color="rgba(255, 255, 255, 0.9)"
                    fallback={
                      typeof program.icon === 'string' && !hasIcon(program.icon as IconName)
                        ? program.icon
                        : undefined
                    }
                  />
                ) : (
                  <span>{program.icon}</span>
                )}
              </div>
              <div className="dock-indicator" />
            </button>
          );
        })}

        <div className="dock-separator" />

        <div className="dock-tray">
          <span className="dock-clock">{formatTime(currentTime)}</span>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useKernel } from '@core/kernel';
import { programList } from 'virtual:programs';
import { launchOrFocusProgram } from '@core/context';
import { Icon } from '../components/Icon';
import { hasIcon, type IconName } from '@core/icons';

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
  const programsWithWindowsSet = new Set(programsWithWindows);

  // Filter program shortcuts to exclude those that already have windows open
  const programShortcuts = programList
    .slice(0, 6)
    .filter((program) => !programsWithWindowsSet.has(program.id));

  return (
    <div className="dock">
      <div className="dock-container">
        {/* Launcher button */}
        <button
          className="dock-item dock-launcher"
          onClick={() => handleLaunchProgram('launcher')}
          title="Launcher"
        >
          <div className="dock-icon-wrapper">
            {hasIcon('launcher' as IconName) ? (
              <Icon name="launcher" size={48} color="rgba(255, 255, 255, 0.9)" />
            ) : (
              <span>⊞</span>
            )}
          </div>
        </button>

        {/* Separator */}
        {(programShortcuts.length > 0 || programsWithWindows.length > 0) && (
          <div className="dock-separator" />
        )}

        {/* Program shortcuts (first 6, excluding those with open windows) */}
        {programShortcuts.map((program) => {
          const programWindows = windowsByProgram.get(program.id) || [];
          const hasWindows = programWindows.length > 0;
          const isActive = programWindows.some((w) => w.id === activeWindowId);

          return (
            <button
              key={program.id}
              className={`dock-item dock-program ${isActive ? 'active' : ''}`}
              onClick={() => handleLaunchProgram(program.id)}
              title={program.name}
              draggable={true}
              onDragStart={(e) => {
                e.dataTransfer.setData('application/x-deskos-program-id', program.id);
                e.dataTransfer.effectAllowed = 'copy';
              }}
              data-program-id={program.id}
            >
              <div className="dock-icon-wrapper">
                {hasIcon(program.icon as IconName) ? (
                  <Icon 
                    name={program.icon as IconName} 
                    size={48}
                    fallback={typeof program.icon === 'string' && !hasIcon(program.icon as IconName) ? program.icon : undefined}
                  />
                ) : (
                  <span>{program.icon}</span>
                )}
              </div>
              {hasWindows && (
                <div className="dock-indicator" />
              )}
            </button>
          );
        })}

        {/* Windows grouped by program */}
        {programsWithWindows.map((programId) => {
          const programWindows = windowsByProgram.get(programId)!;
          const isActive = programWindows.some((w) => w.id === activeWindowId);
          const program = programList.find((p) => p.id === programId);
          
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
                    fallback={typeof program.icon === 'string' && !hasIcon(program.icon as IconName) ? program.icon : undefined}
                  />
                ) : (
                  <span>{program.icon}</span>
                )}
              </div>
              <div className="dock-indicator" />
            </button>
          );
        })}

        {/* Separator before tray */}
        <div className="dock-separator" />

        {/* Tray with clock */}
        <div className="dock-tray">
          <span className="dock-clock">
            {formatTime(currentTime)}
          </span>
        </div>
      </div>
    </div>
  );
}

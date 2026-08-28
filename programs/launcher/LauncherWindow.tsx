import { useState, useMemo, memo, useEffect } from 'react';
import type { ProgramContext } from '@core/context';
import { programList } from 'virtual:programs';
import { launchOrFocusProgram } from '@core/context';
import { isHiddenFromLauncher } from '@core/program-registry';
import { resolveProgramIcon } from '@core/program-icons';
import { Icon } from '../../components/Icon';
import { hasIcon, type IconName } from '@core/icons';

/** Props for the program launcher window. */
interface LauncherWindowProps {
  /** Program context (used to close the launcher after launch) */
  ctx: ProgramContext;
}

/** App launcher UI: searchable program grid; closes itself after launching. */
export const LauncherWindow = memo(function LauncherWindow({ ctx }: LauncherWindowProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [iconRevision, setIconRevision] = useState(0);

  useEffect(() => {
    const refresh = () => setIconRevision((n) => n + 1);
    window.addEventListener('program-icon-updated', refresh);
    return () => window.removeEventListener('program-icon-updated', refresh);
  }, []);

  const visiblePrograms = useMemo(() => programList.filter((p) => !isHiddenFromLauncher(p.id)), []);

  const filteredPrograms = useMemo(() => {
    if (!searchQuery.trim()) {
      return visiblePrograms;
    }
    const query = searchQuery.toLowerCase();
    return visiblePrograms.filter(
      (p) => p.name.toLowerCase().includes(query) || p.id.toLowerCase().includes(query)
    );
  }, [searchQuery, visiblePrograms]);

  const handleLaunchProgram = async (programId: string) => {
    await launchOrFocusProgram(programId);

    // Close the launcher after launching
    const windows = ctx.window.getWindows();
    if (windows.length > 0) {
      ctx.window.close(windows[0].id);
    }
  };

  void iconRevision;

  return (
    <div className="launcher-container">
      <div className="launcher-search-wrapper">
        <input
          type="text"
          className="launcher-search"
          placeholder="Search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          autoFocus
        />
      </div>

      <div className="launcher-grid">
        {filteredPrograms.map((program) => {
          const iconName = resolveProgramIcon(program.id, program.icon);
          return (
            <button
              key={program.id}
              className="launcher-item"
              onClick={() => handleLaunchProgram(program.id)}
              draggable={true}
              onDragStart={(e) => {
                e.dataTransfer.setData('application/x-deskos-program-id', program.id);
                e.dataTransfer.effectAllowed = 'copy';
              }}
              data-program-id={program.id}
            >
              <div className="launcher-item-icon">
                {hasIcon(iconName as IconName) ? (
                  <Icon
                    name={iconName as IconName}
                    size={56}
                    fallback={
                      typeof iconName === 'string' && !hasIcon(iconName as IconName)
                        ? iconName
                        : undefined
                    }
                  />
                ) : (
                  <span>{iconName}</span>
                )}
              </div>
              <div className="launcher-item-name">{program.name}</div>
            </button>
          );
        })}

        {filteredPrograms.length === 0 && (
          <div className="launcher-empty">
            <div className="launcher-empty-text">No results found</div>
          </div>
        )}
      </div>
    </div>
  );
});

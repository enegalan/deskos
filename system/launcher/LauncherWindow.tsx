import { useState, useMemo, memo } from 'react';
import type { ProgramContext } from '@core/types';
import { programList } from 'virtual:programs';
import { launchOrFocusProgram } from '@core/context';
import { Icon } from '../../components/Icon';
import { hasIcon, type IconName } from '@core/icons';

interface LauncherWindowProps {
  ctx: ProgramContext;
}

export const LauncherWindow = memo(function LauncherWindow({ ctx }: LauncherWindowProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredPrograms = useMemo(() => {
    if (!searchQuery.trim()) {
      // Filter out the launcher itself from the list
      return programList.filter((p) => p.id !== 'launcher');
    }
    const query = searchQuery.toLowerCase();
    return programList.filter(
      (p) =>
        p.id !== 'launcher' &&
        (p.name.toLowerCase().includes(query) || p.id.toLowerCase().includes(query))
    );
  }, [searchQuery]);

  const handleLaunchProgram = async (programId: string) => {
    await launchOrFocusProgram(programId);

    // Close the launcher after launching
    const windows = ctx.window.getWindows();
    if (windows.length > 0) {
      ctx.window.close(windows[0].id);
    }
  };

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
        {filteredPrograms.map((program) => (
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
              {hasIcon(program.icon as IconName) ? (
                <Icon 
                  name={program.icon as IconName} 
                  size={56}
                  fallback={typeof program.icon === 'string' && !hasIcon(program.icon as IconName) ? program.icon : undefined}
                />
              ) : (
                <span>{program.icon}</span>
              )}
            </div>
            <div className="launcher-item-name">{program.name}</div>
          </button>
        ))}

        {filteredPrograms.length === 0 && (
          <div className="launcher-empty">
            <div className="launcher-empty-text">No results found</div>
          </div>
        )}
      </div>
    </div>
  );
});

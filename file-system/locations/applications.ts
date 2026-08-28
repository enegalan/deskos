import { programs } from 'virtual:programs';
import { isHiddenFromApplications } from '../../core/program-registry';
import type { SpecialLocationInfo } from '../file-system';
import type { DesktopItem } from '../../core/desktop-shortcuts';

/** Special location: installed applications (program shortcuts). */
export const location: SpecialLocationInfo = {
  path: '/Applications',
  name: 'Applications',
  icon: 'folder',
  order: 6,
  getItems: () => {
    const shortcuts: DesktopItem[] = [];
    Object.keys(programs).forEach((programId) => {
      if (isHiddenFromApplications(programId)) return;
      const program = programs[programId];
      if (program) {
        shortcuts.push({
          id: `app-${programId}`,
          programId,
          x: 0,
          y: 0,
          customName: program.metadata.name,
        });
      }
    });
    return shortcuts;
  },
};

import type { SpecialLocationInfo } from '../file-system';

/** Special location: downloads folder (placeholder). */
export const location: SpecialLocationInfo = {
  path: '/Downloads',
  name: 'Downloads',
  icon: 'download',
  order: 2,
  getItems: () => [],
};

import type { SpecialLocationInfo } from '../file-system';

/** Special location: music folder (placeholder). */
export const location: SpecialLocationInfo = {
  path: '/Music',
  name: 'Music',
  icon: 'music',
  order: 3,
  getItems: () => [],
};

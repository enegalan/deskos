import type { SpecialLocationInfo } from '../file-system';

/** Special location: videos folder (placeholder). */
export const location: SpecialLocationInfo = {
  path: '/Videos',
  name: 'Videos',
  icon: 'video',
  order: 4,
  getItems: () => [],
};

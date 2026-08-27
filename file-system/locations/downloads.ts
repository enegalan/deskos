import type { SpecialLocationInfo } from '../file-system';

export const location: SpecialLocationInfo = {
  path: '/Downloads',
  name: 'Downloads',
  icon: 'download',
  order: 2,
  getItems: () => [],
};

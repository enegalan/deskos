import type { SpecialLocationInfo } from '../file-system';

export const location: SpecialLocationInfo = {
  path: '/Music',
  name: 'Music',
  icon: 'music',
  order: 3,
  getItems: () => [],
};

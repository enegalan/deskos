import type { SpecialLocationInfo } from '../file-system';

export const location: SpecialLocationInfo = {
  path: '/Documents',
  name: 'Documents',
  icon: 'file',
  order: 1,
  getItems: () => [],
};

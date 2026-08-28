import type { SpecialLocationInfo } from '../file-system';

/** Special location: user documents folder (placeholder). */
export const location: SpecialLocationInfo = {
  path: '/Documents',
  name: 'Documents',
  icon: 'file',
  order: 1,
  getItems: () => [],
};

import type { SpecialLocationInfo } from '../file-system';

/** Special location: images folder (placeholder). */
export const location: SpecialLocationInfo = {
  path: '/Images',
  name: 'Images',
  icon: 'image',
  order: 5,
  getItems: () => [],
};

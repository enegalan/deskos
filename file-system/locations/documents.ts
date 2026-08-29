import type { SpecialLocationInfo } from '../file-system';
import { getWritableSpecialLocationItems } from '../../core/desktop-shortcuts';

/** Special location: user documents folder. */
export const location: SpecialLocationInfo = {
  path: '/Documents',
  name: 'Documents',
  icon: 'file',
  order: 1,
  getItems: () => getWritableSpecialLocationItems('/Documents'),
};

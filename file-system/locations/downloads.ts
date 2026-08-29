import type { SpecialLocationInfo } from '../file-system';
import { getWritableSpecialLocationItems } from '../../core/desktop-shortcuts';

/** Special location: user downloads folder. */
export const location: SpecialLocationInfo = {
  path: '/Downloads',
  name: 'Downloads',
  icon: 'download',
  order: 2,
  getItems: () => getWritableSpecialLocationItems('/Downloads'),
};

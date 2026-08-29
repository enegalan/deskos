import type { SpecialLocationInfo } from '../file-system';
import { getWritableSpecialLocationItems } from '../../core/desktop-shortcuts';

/** Special location: user music folder. */
export const location: SpecialLocationInfo = {
  path: '/Music',
  name: 'Music',
  icon: 'music',
  order: 3,
  getItems: () => getWritableSpecialLocationItems('/Music'),
};

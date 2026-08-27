import type { SpecialLocationInfo } from '../file-system';
import { getItemsByPath } from '../../core/desktop-shortcuts';

export const location: SpecialLocationInfo = {
  path: '/Desktop',
  name: 'Desktop',
  icon: 'desktop',
  order: 0,
  getItems: () => getItemsByPath('/Desktop'),
};

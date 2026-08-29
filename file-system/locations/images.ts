import type { SpecialLocationInfo } from '../file-system';
import {
  ensureMediaLibrarySeeded,
  getWritableSpecialLocationItems,
} from '../../core/desktop-shortcuts';
import { images } from 'virtual:images';

/**
 * Special location: images folder. Lists library images (seeded from `public/img/`)
 * plus any items moved into `/Images`.
 */
export const location: SpecialLocationInfo = {
  path: '/Images',
  name: 'Images',
  icon: 'image',
  order: 5,
  getItems: () => {
    ensureMediaLibrarySeeded('image', images);
    return getWritableSpecialLocationItems('/Images');
  },
};

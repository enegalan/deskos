import type { SpecialLocationInfo } from '../file-system';
import { ensureMediaLibrarySeeded, getLibraryMediaItems } from '../../core/desktop-shortcuts';
import { images } from 'virtual:images';

/**
 * Special location: images folder. Lists persisted image files whose home is
 * `/Images` (seeded once from `public/img/` via `vite-plugin-images`).
 */
export const location: SpecialLocationInfo = {
  path: '/Images',
  name: 'Images',
  icon: 'image',
  order: 5,
  getItems: () => {
    ensureMediaLibrarySeeded('image', images);
    return getLibraryMediaItems('/Images');
  },
};

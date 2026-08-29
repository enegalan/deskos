import type { SpecialLocationInfo } from '../file-system';
import {
  ensureMediaLibrarySeeded,
  getWritableSpecialLocationItems,
} from '../../core/desktop-shortcuts';
import { videos } from 'virtual:videos';

/**
 * Special location: videos folder. Lists library videos (seeded from `public/video/`)
 * plus any items moved into `/Videos`.
 */
export const location: SpecialLocationInfo = {
  path: '/Videos',
  name: 'Videos',
  icon: 'video',
  order: 4,
  getItems: () => {
    ensureMediaLibrarySeeded('video', videos);
    return getWritableSpecialLocationItems('/Videos');
  },
};

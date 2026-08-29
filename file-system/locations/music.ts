import type { SpecialLocationInfo } from '../file-system';
import {
  ensureMediaLibrarySeeded,
  getWritableSpecialLocationItems,
} from '../../core/desktop-shortcuts';
import { music } from 'virtual:music';

/**
 * Special location: music folder. Lists library tracks (seeded from `public/music/`)
 * plus any items moved into `/Music`.
 */
export const location: SpecialLocationInfo = {
  path: '/Music',
  name: 'Music',
  icon: 'music',
  order: 3,
  getItems: () => {
    ensureMediaLibrarySeeded('audio', music);
    return getWritableSpecialLocationItems('/Music');
  },
};

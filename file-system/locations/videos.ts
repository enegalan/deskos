import type { SpecialLocationInfo } from '../file-system';
import { ensureMediaLibrarySeeded, getLibraryMediaItems } from '../../core/desktop-shortcuts';
import { videos } from 'virtual:videos';

/**
 * Special location: videos folder. Lists persisted video files whose home is
 * `/Videos` (seeded once from `public/video/` via `vite-plugin-videos`).
 */
export const location: SpecialLocationInfo = {
  path: '/Videos',
  name: 'Videos',
  icon: 'video',
  order: 4,
  getItems: () => {
    ensureMediaLibrarySeeded('video', videos);
    return getLibraryMediaItems('/Videos');
  },
};

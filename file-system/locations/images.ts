import type { SpecialLocationInfo } from '../file-system';
import type { DesktopImageItem } from '../../core/desktop-shortcuts';
import { images } from 'virtual:images';

/**
 * Special location: images folder. Lists every image found under `public/img/`
 * (DeskOS has no upload/create feature, so the folder is read-only). The file
 * list is produced at build time by `vite-plugin-images`.
 */
export const location: SpecialLocationInfo = {
  path: '/Images',
  name: 'Images',
  icon: 'image',
  order: 5,
  getItems: () =>
    images.map<DesktopImageItem>((img, i) => ({
      id: `image-${img.name}`,
      name: img.name,
      kind: 'image',
      imageUrl: img.url,
      icon: 'image',
      x: 0,
      y: i,
    })),
};

import { defineProgram } from '@core/program';
import { launchOrFocusProgram } from '@core/context';
import { isSessionRestoreActive } from '@core/session';
import { PhotosWindow } from './PhotosWindow';

/** One image the previewer can show. */
type ImageEntry = { src: string; name: string };

/**
 * A preview request: the exact set of images to browse (only what the user
 * selected) plus which one to show first. Queued before the window mounts.
 */
type ImageOpenRequest = { images: ImageEntry[]; startIndex: number };

/** Pending preview requests consumed on the next program launch. */
const pendingOpens: ImageOpenRequest[] = [];

if (typeof window !== 'undefined') {
  window.addEventListener('open-image', (e) => {
    const detail = (e as CustomEvent<Partial<ImageOpenRequest>>).detail;
    const images = (detail?.images ?? []).filter((img): img is ImageEntry => !!img?.src);
    if (images.length === 0) return;

    const startIndex = Math.min(Math.max(detail?.startIndex ?? 0, 0), images.length - 1);
    pendingOpens.push({ images, startIndex });
    void launchOrFocusProgram('photos', true);
  });
}

/**
 * Hidden image previewer. It is not shown in the Launcher or the
 * `/Applications` folder and is not pinned to the dock — it opens only when
 * something dispatches an `open-image` event (e.g. the "Preview" action on
 * one or more images inside a folder window). Each window browses only the
 * images passed in that event: one selected image shows on its own, several
 * selected images become a carousel.
 */
export default defineProgram({
  id: 'photos',
  name: 'Photos',
  icon: 'image',
  hideFromLauncher: true,
  hideFromApplications: true,
  allowMultipleWindows: true,
  launch: (ctx) => {
    const request = pendingOpens.shift();
    // Fresh launches need a queued open-image request. Session restore has no
    // queue — the window is recreated and PhotosWindow loads images from
    // persisted window session state instead.
    if (!request && !isSessionRestoreActive()) return;

    const first = request?.images[request.startIndex] ?? request?.images[0];

    ctx.window.create({
      title: first?.name ?? 'Photos',
      width: 900,
      height: 620,
      minWidth: 360,
      minHeight: 260,
      component: (
        <PhotosWindow
          ctx={ctx}
          initialImages={request?.images}
          initialStartIndex={request?.startIndex}
        />
      ),
    });
  },
});

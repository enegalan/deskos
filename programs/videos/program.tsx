import { defineProgram } from '@core/program';
import { launchOrFocusProgram } from '@core/context';
import { isSessionRestoreActive } from '@core/session';
import { VideosWindow } from './VideosWindow';

/** One video the player can show. */
type VideoEntry = { src: string; name: string };

/**
 * A play request: the exact set of videos to browse (only what the user
 * selected) plus which one to show first. Queued before the window mounts.
 */
type VideoOpenRequest = { videos: VideoEntry[]; startIndex: number };

/** Pending play requests consumed on the next program launch. */
const pendingOpens: VideoOpenRequest[] = [];

if (typeof window !== 'undefined') {
  window.addEventListener('open-video', (e) => {
    const detail = (e as CustomEvent<Partial<VideoOpenRequest>>).detail;
    const videos = (detail?.videos ?? []).filter((vid): vid is VideoEntry => !!vid?.src);
    if (videos.length === 0) return;

    const startIndex = Math.min(Math.max(detail?.startIndex ?? 0, 0), videos.length - 1);
    pendingOpens.push({ videos, startIndex });
    void launchOrFocusProgram('videos', true);
  });
}

/**
 * Hidden video player. It is not shown in the Launcher or the
 * `/Applications` folder and is not pinned to the dock — it opens only when
 * something dispatches an `open-video` event (e.g. the "Play" action on
 * one or more videos inside a folder window). Each window browses only the
 * videos passed in that event: one selected video plays on its own, several
 * selected videos become a playlist.
 */
export default defineProgram({
  id: 'videos',
  name: 'Videos',
  icon: 'video',
  hideFromLauncher: true,
  hideFromApplications: true,
  allowMultipleWindows: true,
  launch: (ctx) => {
    const request = pendingOpens.shift();
    // Fresh launches need a queued open-video request. Session restore has no
    // queue — the window is recreated and VideosWindow loads videos from
    // persisted window session state instead.
    if (!request && !isSessionRestoreActive()) return;

    const first = request?.videos[request.startIndex] ?? request?.videos[0];

    ctx.window.create({
      title: first?.name ?? 'Videos',
      width: 900,
      height: 620,
      minWidth: 360,
      minHeight: 260,
      component: (
        <VideosWindow
          ctx={ctx}
          initialVideos={request?.videos}
          initialStartIndex={request?.startIndex}
        />
      ),
    });
  },
});

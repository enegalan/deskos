import { defineProgram } from '@core/program';
import { launchOrFocusProgram } from '@core/context';
import { isSessionRestoreActive } from '@core/session';
import { MusicWindow } from './MusicWindow';

/** One track the player can play. */
type TrackEntry = { src: string; name: string };

/**
 * A play request: the exact set of tracks to browse (only what the user
 * selected) plus which one to play first. Queued before the window mounts.
 */
type AudioOpenRequest = { tracks: TrackEntry[]; startIndex: number };

/** Pending play requests consumed on the next program launch. */
const pendingOpens: AudioOpenRequest[] = [];

if (typeof window !== 'undefined') {
  window.addEventListener('open-audio', (e) => {
    const detail = (e as CustomEvent<Partial<AudioOpenRequest>>).detail;
    const tracks = (detail?.tracks ?? []).filter((t): t is TrackEntry => !!t?.src);
    if (tracks.length === 0) return;

    const startIndex = Math.min(Math.max(detail?.startIndex ?? 0, 0), tracks.length - 1);
    pendingOpens.push({ tracks, startIndex });
    void launchOrFocusProgram('music', true);
  });
}

/**
 * Hidden music player. It is not shown in the Launcher or the
 * `/Applications` folder and is not pinned to the dock — it opens only when
 * something dispatches an `open-audio` event (e.g. the "Play" action on
 * one or more tracks inside a folder window). Each window browses only the
 * tracks passed in that event: one selected track plays on its own, several
 * selected tracks become a playlist.
 */
export default defineProgram({
  id: 'music',
  name: 'Music',
  icon: 'music',
  hideFromLauncher: true,
  hideFromApplications: true,
  allowMultipleWindows: true,
  launch: (ctx) => {
    const request = pendingOpens.shift();
    // Fresh launches need a queued open-audio request. Session restore has no
    // queue — the window is recreated and MusicWindow loads tracks from
    // persisted window session state instead.
    if (!request && !isSessionRestoreActive()) return;

    const first = request?.tracks[request.startIndex] ?? request?.tracks[0];

    ctx.window.create({
      title: first?.name ?? 'Music',
      width: 480,
      height: 220,
      minWidth: 320,
      minHeight: 160,
      component: (
        <MusicWindow
          ctx={ctx}
          initialTracks={request?.tracks}
          initialStartIndex={request?.startIndex}
        />
      ),
    });
  },
});

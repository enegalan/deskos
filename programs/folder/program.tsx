import { defineProgram } from '@core/program';
import { launchOrFocusProgram } from '@core/context';
import { getFolderById } from '@core/desktop-shortcuts';
import { FolderWindow } from '../../src/FolderWindow';

/** Open-folder request queued before the folder program window mounts. */
type FolderOpenRequest = {
  folderId?: string;
  initialPath?: string;
};

/** Pending folder open requests consumed on folder program launch. */
const pendingOpens: FolderOpenRequest[] = [];

/** Queue a folder open request and launch (or focus) the folder program. */
function queueFolderOpen(request: FolderOpenRequest): void {
  pendingOpens.push(request);
  void launchOrFocusProgram('folder', true);
}

if (typeof window !== 'undefined') {
  window.addEventListener('open-folder', (e) => {
    const detail = (e as CustomEvent<{ folderId: string }>).detail;
    if (detail?.folderId) {
      queueFolderOpen({ folderId: detail.folderId });
    }
  });
}

/** Folder browser — opens desktop folders and special locations. */
export default defineProgram({
  id: 'folder',
  name: 'Folder',
  icon: 'folder',
  hideFromLauncher: true,
  hideFromApplications: true,
  allowMultipleWindows: true,
  launch: (ctx) => {
    const request = pendingOpens.shift() || {};
    const folder = request.folderId ? getFolderById(request.folderId) : undefined;
    ctx.window.create({
      title: folder?.name || 'Folder',
      width: 800,
      height: 600,
      component: (
        <FolderWindow
          ctx={ctx}
          folderId={request.folderId}
          initialPath={request.initialPath}
        />
      ),
    });
  },
});

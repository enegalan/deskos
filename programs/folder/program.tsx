import { defineProgram } from '@core/program';
import { launchOrFocusProgram } from '@core/context';
import { getFolderById } from '@core/desktop-shortcuts';
import { FolderWindow } from '../../src/FolderWindow';

/** Open-folder request queued before the folder program window mounts. */
type FolderOpenRequest = {
  folderId?: string;
  initialPath?: string;
};

/** Shared across HMR so open-folder never stacks duplicate listeners. */
type FolderOpenBridge = {
  pending: FolderOpenRequest[];
  queue: (request: FolderOpenRequest) => void;
};

const BRIDGE_KEY = '__deskosFolderOpenBridge';

function getFolderOpenBridge(): FolderOpenBridge {
  const win = window as Window & { [BRIDGE_KEY]?: FolderOpenBridge };
  if (!win[BRIDGE_KEY]) {
    const bridge: FolderOpenBridge = {
      pending: [],
      queue(request) {
        bridge.pending.push(request);
        void launchOrFocusProgram('folder', true);
      },
    };
    win[BRIDGE_KEY] = bridge;
    window.addEventListener('open-folder', (e) => {
      const detail = (e as CustomEvent<{ folderId?: string; initialPath?: string }>).detail;
      if (detail?.folderId || detail?.initialPath) {
        win[BRIDGE_KEY]!.queue({ folderId: detail.folderId, initialPath: detail.initialPath });
      }
    });
  } else {
    // Keep queue pointing at latest launchOrFocusProgram after HMR.
    win[BRIDGE_KEY].queue = (request) => {
      win[BRIDGE_KEY]!.pending.push(request);
      void launchOrFocusProgram('folder', true);
    };
  }
  return win[BRIDGE_KEY];
}

if (typeof window !== 'undefined') {
  getFolderOpenBridge();
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
    const bridge = getFolderOpenBridge();
    const request = bridge.pending.shift() || {};
    const folder = request.folderId ? getFolderById(request.folderId) : undefined;
    const pathLabel = request.initialPath?.split('/').filter(Boolean).pop();
    ctx.window.create({
      title: folder?.name || pathLabel || 'Folder',
      width: 800,
      height: 600,
      component: (
        <FolderWindow ctx={ctx} folderId={request.folderId} initialPath={request.initialPath} />
      ),
    });
  },
});

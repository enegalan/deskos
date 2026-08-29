import { defineProgram } from '@core/program';
import { launchOrFocusProgram } from '@core/context';
import { isSessionRestoreActive } from '@core/session';
import { TextEditorWindow } from './TextEditorWindow';

/** Pending text-file open requests consumed on the next program launch. */
type TextOpenRequest = { fileId: string };

const pendingOpens: TextOpenRequest[] = [];

if (typeof window !== 'undefined') {
  window.addEventListener('open-text-file', (e) => {
    const detail = (e as CustomEvent<Partial<TextOpenRequest>>).detail;
    if (!detail?.fileId) return;
    pendingOpens.push({ fileId: detail.fileId });
    void launchOrFocusProgram('text-editor', true);
  });
}

/** Text Editor: edit user-created VFS files, or a blank untitled buffer from the dock. */
export default defineProgram({
  id: 'text-editor',
  name: 'Text Editor',
  icon: 'file',
  dock: { pin: true, order: 12 },
  allowMultipleWindows: true,
  launch: (ctx) => {
    const request = pendingOpens.shift();
    if (!request && !isSessionRestoreActive()) {
      ctx.window.create({
        title: 'Untitled',
        width: 720,
        height: 520,
        minWidth: 360,
        minHeight: 240,
        component: <TextEditorWindow ctx={ctx} />,
      });
      return;
    }

    ctx.window.create({
      title: 'Text Editor',
      width: 720,
      height: 520,
      minWidth: 360,
      minHeight: 240,
      component: <TextEditorWindow ctx={ctx} fileId={request?.fileId} />,
    });
  },
});

import { defineProgram } from '@core/program';
import { emptyTrash, isTrashEmpty } from '@core/trash';
import { TrashWindow } from './TrashWindow';

/** Trash program: browse soft-deleted items, restore or purge. */
export default defineProgram({
  id: 'trash',
  name: 'Trash',
  icon: 'trash',
  resolveIcon: () => (isTrashEmpty() ? 'trash' : 'trash-full'),
  allowMultipleWindows: false,
  iconContextMenu: () => [
    {
      id: 'trash-empty',
      label: 'Empty Trash',
      icon: 'delete',
      enabled: !isTrashEmpty(),
      action: () => {
        if (isTrashEmpty()) return;
        if (!confirm('Are you sure you want to permanently erase the items in the Trash?')) {
          return;
        }
        emptyTrash();
      },
    },
  ],
  launch: (ctx) => {
    ctx.window.create({
      title: 'Trash',
      width: 640,
      height: 440,
      minWidth: 360,
      minHeight: 280,
      component: <TrashWindow ctx={ctx} />,
    });
  },
});

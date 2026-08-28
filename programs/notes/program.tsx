import { defineProgram } from '@core/program';
import { NotesWindow } from './NotesWindow';

/** Notes program definition: opens a Notes window on launch. */
export default defineProgram({
  id: 'notes',
  name: 'Notes',
  icon: 'notes',
  dock: { pin: true, order: 10 },
  launch: (ctx) => {
    ctx.window.create({
      title: 'Notes',
      width: 700,
      height: 500,
      minWidth: 400,
      minHeight: 300,
      component: <NotesWindow ctx={ctx} />,
    });
  },
});

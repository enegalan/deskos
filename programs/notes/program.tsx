import { defineProgram } from '@core/program';
import { NotesWindow } from './NotesWindow';

export default defineProgram({
  id: 'notes',
  name: 'Notes',
  icon: 'notes',
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

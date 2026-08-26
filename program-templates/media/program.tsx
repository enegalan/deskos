import { defineProgram } from '@core/program';
import { MediaWindow } from './MediaWindow';

export default defineProgram({
  id: '__PROGRAM_ID__',
  name: '__PROGRAM_NAME__',
  icon: '🎵',
  launch: (ctx) => {
    ctx.window.create({
      title: '__PROGRAM_NAME__',
      width: 500,
      height: 400,
      minWidth: 350,
      minHeight: 250,
      component: <MediaWindow ctx={ctx} />,
    });
  },
});

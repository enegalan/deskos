import { defineProgram } from '@core/program';
import { MainWindow } from './MainWindow';

export default defineProgram({
  id: '__PROGRAM_ID__',
  name: '__PROGRAM_NAME__',
  icon: '📦',
  launch: (ctx) => {
    ctx.window.create({
      title: '__PROGRAM_NAME__',
      width: 600,
      height: 400,
      component: <MainWindow ctx={ctx} />,
    });
  },
});

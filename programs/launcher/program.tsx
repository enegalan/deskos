import { defineProgram } from '@core/program';
import { LauncherWindow } from './LauncherWindow';

/** Launcher program definition: opens the app launcher window on launch. */
export default defineProgram({
  id: 'launcher',
  name: 'Launcher',
  icon: 'launcher',
  launch: (ctx) => {
    ctx.window.create({
      title: 'Launcher',
      width: 650,
      height: 550,
      minWidth: 500,
      minHeight: 400,
      component: <LauncherWindow ctx={ctx} />,
    });
  },
});

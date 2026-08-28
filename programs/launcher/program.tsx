import { defineProgram } from '@core/program';
import { LauncherWindow } from './LauncherWindow';

/** Launcher program definition: opens the app launcher window on launch. */
export default defineProgram({
  id: 'launcher',
  name: 'Launcher',
  icon: 'launcher',
  hideFromLauncher: true,
  dock: { pin: true, order: 0, role: 'launcher' },
  shortcuts: [
    { key: 'N', metaKey: true, description: 'New window', action: 'launch' },
    { key: 'T', metaKey: true, description: 'New tab', action: 'launch' },
  ],
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

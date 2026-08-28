import { defineProgram } from '@core/program';
import { BrowserWindow } from './BrowserWindow';

/** Browser program definition: opens the browser window. */
export default defineProgram({
  id: 'browser',
  name: 'Browser',
  icon: 'globe',
  dock: { pin: true, order: 15 },
  launch: (ctx) => {
    ctx.window.create({
      title: 'Browser',
      width: 960,
      height: 640,
      minWidth: 480,
      minHeight: 320,
      component: <BrowserWindow ctx={ctx} />,
    });
  },
});

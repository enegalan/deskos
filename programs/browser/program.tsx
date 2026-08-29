import { defineProgram } from '@core/program';
import { launchOrFocusProgram } from '@core/context';
import { isSessionRestoreActive } from '@core/session';
import { BrowserWindow } from './BrowserWindow';

/** Pending URL open requests (local files / media opened in the browser). */
type BrowserOpenRequest = { url: string; title?: string };

const pendingOpens: BrowserOpenRequest[] = [];

if (typeof window !== 'undefined') {
  window.addEventListener('open-browser-url', (e) => {
    const detail = (e as CustomEvent<Partial<BrowserOpenRequest>>).detail;
    if (!detail?.url) return;
    pendingOpens.push({ url: detail.url, title: detail.title });
    void launchOrFocusProgram('browser', true);
  });
}

/** Browser program definition: opens the browser window. */
export default defineProgram({
  id: 'browser',
  name: 'Browser',
  icon: 'globe',
  dock: { pin: true, order: 15 },
  launch: (ctx) => {
    const request = pendingOpens.shift();
    if (!request && !isSessionRestoreActive()) {
      ctx.window.create({
        title: 'Browser',
        width: 960,
        height: 640,
        minWidth: 480,
        minHeight: 320,
        component: <BrowserWindow ctx={ctx} />,
      });
      return;
    }

    ctx.window.create({
      title: request?.title ?? 'Browser',
      width: 960,
      height: 640,
      minWidth: 480,
      minHeight: 320,
      component: (
        <BrowserWindow ctx={ctx} initialUrl={request?.url} initialTitle={request?.title} />
      ),
    });
  },
});

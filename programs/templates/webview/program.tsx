import { defineProgram } from '@core/program';
import { WebViewWindow } from './WebViewWindow';

export default defineProgram({
  id: '__PROGRAM_ID__',
  name: '__PROGRAM_NAME__',
  icon: '🌐',
  launch: (ctx) => {
    ctx.window.create({
      title: '__PROGRAM_NAME__',
      width: 900,
      height: 600,
      minWidth: 400,
      minHeight: 300,
      component: <WebViewWindow ctx={ctx} defaultUrl="https://example.com" />,
    });
  },
});

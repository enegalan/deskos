import { defineProgram } from '@core/program';
import { SettingsWindow } from './SettingsWindow';

export default defineProgram({
  id: 'settings',
  name: 'Settings',
  icon: 'settings',
  launch: (ctx) => {
    ctx.window.create({
      title: 'Settings',
      width: 450,
      height: 350,
      minWidth: 350,
      minHeight: 250,
      component: <SettingsWindow ctx={ctx} />,
    });
  },
});

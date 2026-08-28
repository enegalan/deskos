import { defineProgram } from '@core/program';
import { launchOrFocusProgram } from '@core/context';
import { SettingsWindow } from './SettingsWindow';

/** Settings program definition: opens a Settings window on launch. */
export default defineProgram({
  id: 'settings',
  name: 'Settings',
  icon: 'settings',
  dock: { pin: true, order: 20 },
  shortcuts: [{ key: 'COMMA', metaKey: true, description: 'Settings', action: 'launch' }],
  desktopMenuItems: () => [
    {
      id: 'desktop-settings',
      label: 'Settings',
      icon: 'settings',
      action: () => launchOrFocusProgram('settings'),
    },
  ],
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

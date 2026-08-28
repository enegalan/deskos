# DeskOS

DeskOS is a modular web-based desktop environment with windows, applications, and real multitasking — all running in the browser.

## Philosophy

DeskOS is a **Source-First** desktop environment where the operating system and its applications are unified within a single, forkable codebase. By treating programs as internal first-class modules rather than external packages, DeskOS collapses the distinction between developer and user, repositioning the desktop as a personal repository that is continuously evolved through direct source modification.

## Quick Start

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/deskos.git
cd deskos

# Install dependencies
npm install

# Start the development server
npm run dev
```

Open http://localhost:3000 to see your DeskOS desktop.

## Create your app

1. Copy a template from `programs/templates/` into `programs/<your-app-id>/`.
2. Edit `program.tsx` — that file is your app's entry point and configuration.
3. Build your UI in React components (see the template's `*Window.tsx` file).
4. Save. In dev mode the app shows up in the Launcher automatically.

Your app folder is self-contained. You do not need to register it anywhere else.

```
programs/
├── my-app/
│   ├── program.tsx      # id, name, icon, launch, optional extras
│   └── MyAppWindow.tsx  # your React UI
└── templates/           # starting points (base, webview, media)
```

## Minimal app

```tsx
import { defineProgram } from '@core/program';
import { MyWindow } from './MyWindow';

export default defineProgram({
  id: 'my-app',
  name: 'My App',
  icon: 'package', // built-in icon name or emoji
  launch: (ctx) => {
    ctx.window.create({
      title: 'My App',
      width: 600,
      height: 400,
      component: <MyWindow ctx={ctx} />,
    });
  },
});
```

Pass `ctx` to your window component. Everything your app can do goes through that object.

## App configuration (`defineProgram`)

Fields you set in `program.tsx`. Required ones must be present; the rest are optional.

| Field                  | Required | Default       | What it does                                                                              | Example                                               |
| ---------------------- | -------- | ------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `id`                   | yes      | —             | Unique id (match your folder name).                                                       | `'my-app'`                                            |
| `name`                 | yes      | —             | Shown in the Launcher and as the default window title.                                    | `'My App'`                                            |
| `icon`                 | yes      | —             | Launcher, desktop shortcut, and taskbar icon (built-in name or emoji).                    | `'package'` or `'🚀'`                                 |
| `launch`               | yes      | —             | Called when the app opens; create your window here.                                       | `(ctx) => ctx.window.create({ … })`                   |
| `allowMultipleWindows` | no       | `false`       | `false`: reopening focuses the existing window. `true`: each launch opens another window. | `true`                                                |
| `dock`                 | no       | not pinned    | Pin to the taskbar. Lower `order` = further left.                                         | `{ pin: true, order: 10 }`                            |
| `shortcuts`            | no       | none          | Global keyboard shortcuts (see below).                                                    | `[{ key: 'N', metaKey: true, action: 'launch-new' }]` |
| `hideFromLauncher`     | no       | `false`       | Hide from the Launcher grid.                                                              | `true`                                                |
| `hideFromApplications` | no       | `false`       | Hide from the `/Applications` folder.                                                     | `true`                                                |
| `protectedShortcut`    | no       | `false`       | Desktop shortcut cannot be deleted.                                                       | `true`                                                |
| `desktopMenuItems`     | no       | none          | Extra items on the **desktop background** right-click menu.                               | `() => [{ id: '…', label: '…', action: () => {} }]`   |
| `iconContextMenu`      | no       | none          | Extra items on **your app's desktop shortcut** right-click menu.                          | `() => [{ id: '…', label: '…', action: () => {} }]`   |
| `resolveIcon`          | no       | static `icon` | Return a different icon at runtime (e.g. empty vs full).                                  | `() => (isFull ? 'trash-full' : 'trash')`             |

Example with optional fields:

```tsx
export default defineProgram({
  id: 'my-app',
  name: 'My App',
  icon: 'package',
  dock: { pin: true, order: 10 },
  shortcuts: [{ key: 'N', metaKey: true, description: 'New window', action: 'launch-new' }],
  launch: (ctx) => {
    ctx.window.create({
      title: 'My App',
      width: 600,
      height: 400,
      component: <MyWindow ctx={ctx} />,
    });
  },
});
```

### Taskbar pin

```tsx
dock: { pin: true, order: 10 },
```

### Keyboard shortcuts

```tsx
shortcuts: [
  { key: 'N', metaKey: true, description: 'New window', action: 'launch-new' },
  { key: 'COMMA', metaKey: true, description: 'Settings', action: 'launch' },
],
```

| Field         | Required | Default    | Notes                                                             |
| ------------- | -------- | ---------- | ----------------------------------------------------------------- |
| `key`         | yes      | —          | `'N'`, `'COMMA'`, `'DELETE'`, etc.                                |
| `metaKey`     | no       | `true`     | Cmd on macOS. Use `ctrlKey` / `shiftKey` / `altKey` as needed.    |
| `action`      | no       | `'launch'` | `'launch'` — focus or open; `'launch-new'` — always a new window. |
| `description` | no       | —          | Shown in shortcut help (optional).                                |

### Desktop menus

Add entries to the desktop background menu:

```tsx
import { launchOrFocusProgram } from '@core/context';

desktopMenuItems: () => [
  {
    id: 'open-my-app',
    label: 'My App',
    icon: 'package',
    action: () => launchOrFocusProgram('my-app'),
  },
],
```

Add entries when the user right-clicks your app's desktop shortcut:

```tsx
iconContextMenu: () => [
  { id: 'refresh', label: 'Refresh', icon: 'open', action: () => { /* … */ } },
],
```

## What you can do in your app (`ctx`)

### Windows

```tsx
const windowId = ctx.window.create({
  title: 'My App',
  width: 600,
  height: 400,
  minWidth: 320,
  minHeight: 200,
  component: <MyWindow ctx={ctx} />,
});

ctx.window.close(windowId);
ctx.window.focus(windowId);
ctx.window.minimize(windowId);
ctx.window.maximize(windowId);
ctx.window.restore(windowId);
ctx.window.setTitle(windowId, 'New Title');
ctx.window.getWindows(); // your app's open windows
```

Omit `x` / `y` to center the window with a small random offset.

### Persist UI across reload

DeskOS restores open windows (size, position, focus, and order) when you reload the page. Inside a window component, use `useWindowSessionState` like `useState` for UI that should survive reloads (active tab, selection, scroll position, etc.):

```tsx
import { useWindowSessionState } from '@core/window-session';

const [view, setView] = useWindowSessionState<'list' | 'grid'>('view', 'list');
```

The shell wraps program content in `WindowSessionProvider`; use the hook only inside your window tree.

### Save data (per app)

Data is stored under your app's id — it never clashes with other apps:

```tsx
ctx.storage.setItem('items', [{ id: '1', text: 'Hello' }]);
const items = ctx.storage.getItem<Item[]>('items');
ctx.storage.removeItem('items');
ctx.storage.clear();
ctx.storage.keys();
```

### Events (inside your app or between your windows)

```tsx
ctx.events.emit('note:saved', { id: '42' });
const off = ctx.events.on('note:saved', (payload) => {
  /* … */
});
ctx.events.once('ready', () => {
  /* … */
});
off();
```

Prefix with `system:` to listen to desk-wide events (e.g. `system:open-folder`).

### System info

```tsx
ctx.system.version; // DeskOS version
ctx.system.theme; // 'light' | 'dark'
ctx.system.programId; // your app id
```

### Right-click menus inside your window

Register a menu for elements in your UI:

```tsx
useEffect(() => {
  return ctx.contextMenu.register('.note-row', {
    id: 'note-actions',
    generator: () => [
      { id: 'delete', label: 'Delete', icon: 'delete', action: () => deleteNote() },
    ],
  });
}, [ctx]);
```

Selectors are limited to your app's windows automatically.

### Selection (for right-click and keyboard actions)

Tell DeskOS what the user has selected inside your app so context menus and Delete work correctly:

```tsx
useEffect(() => {
  return ctx.selection.register(
    () =>
      selectedIds.size ? { type: 'notes', ids: [...selectedIds], count: selectedIds.size } : null,
    { id: 'main', isActive: () => isWindowFocused }
  );
}, [ctx]);
```

Return `null` when nothing is selected.

### Dynamic icon

Change your app's icon on the taskbar or desktop shortcut while running:

```tsx
useEffect(() => {
  return ctx.icon.register(() => (hasUnread ? 'mail-unread' : 'mail'));
}, [ctx, hasUnread]);
```

Or set `resolveIcon` in `defineProgram` if the icon does not depend on React state.

### Open another app

```tsx
import { launchOrFocusProgram } from '@core/context';

await launchOrFocusProgram('settings');
await launchOrFocusProgram('folder', true); // force new window
```

## Icons

Built-in icon names are in `@core/icons`. Render them with the shared component:

```tsx
import { Icon } from '@components/Icon';

<Icon name="notes" size={32} />;
```

You can also use an emoji string as `icon` in `defineProgram`.

## Theming

DeskOS uses CSS custom properties. Edit `src/styles.css`:

```css
:root {
  --color-accent: #5c9fff;
  --color-bg-primary: #0a0a0f;
  --font-sans: 'IBM Plex Sans', sans-serif;
}
```

## Contributing

Since DeskOS is designed as a personal fork, the recommended contribution workflow is:

1. Build useful programs in your fork
2. Submit a pull request to share with the community
3. The best ideas get merged into the main repository

## License

MIT

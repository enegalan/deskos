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

## Directory Structure

```
deskos/
├── core/                    # Kernel, state management, system services
│   ├── kernel.ts           # Central state store (Zustand)
│   ├── event-bus.ts        # Inter-program communication
│   ├── storage.ts          # Scoped storage abstraction
│   ├── context.ts          # ProgramContext factory
│   └── program.ts          # defineProgram utility
├── window-manager/          # Windowing logic
│   ├── WindowManager.tsx   # Main orchestrator component
│   ├── Window.tsx          # Individual window component
│   └── types.ts            # Window state types
├── system/                  # System-level programs
│   ├── launcher/           # Application launcher
│   └── settings/           # System settings panel
├── programs/                # User-added programs
│   ├── notes/              # Example: Notes app
│   └── templates/          # Scaffolding blueprints
│       ├── base/           # Basic program template
│       ├── webview/        # Browser/iframe template
│       └── media/          # Audio/video player template
└── src/                     # App entry point
    ├── main.tsx
    ├── App.tsx
    ├── Desktop.tsx
    └── Taskbar.tsx
```

## Creating a New Program

Copy a template from `programs/templates/` into `programs/<id>/` and replace `__PROGRAM_ID__` and `__PROGRAM_NAME__`.

### Program Structure

Every program consists of a `program.tsx` file that exports a program definition:

```tsx
import { defineProgram } from '@core/program';
import { MyComponent } from './MyComponent';

export default defineProgram({
  id: 'my-program',
  name: 'My Program',
  icon: '🚀',
  launch: (ctx) => {
    ctx.window.create({
      title: 'My Program',
      width: 600,
      height: 400,
      component: <MyComponent ctx={ctx} />,
    });
  },
});
```

### ProgramContext API

Programs interact with the system through the `ProgramContext` object:

```tsx
interface ProgramContext {
  window: WindowAPI;      // Create/manage windows
  storage: StorageAPI;    // Scoped key-value storage
  events: EventBusAPI;    // Emit/listen to events
  system: SystemAPI;      // Read-only system info
}
```

#### Window API

```tsx
// Create a new window
const windowId = ctx.window.create({
  title: 'Window Title',
  width: 600,
  height: 400,
  component: <MyComponent />,
});

// Window management
ctx.window.close(windowId);
ctx.window.focus(windowId);
ctx.window.minimize(windowId);
ctx.window.maximize(windowId);
ctx.window.setTitle(windowId, 'New Title');
```

#### Storage API

Storage is automatically scoped to your program:

```tsx
// Save data
ctx.storage.setItem('settings', { theme: 'dark' });

// Retrieve data
const settings = ctx.storage.getItem<Settings>('settings');

// Other operations
ctx.storage.removeItem('settings');
ctx.storage.clear();
const keys = ctx.storage.keys();
```

#### Events API

Communicate between program instances:

```tsx
// Emit an event
ctx.events.emit('data:updated', { id: 123 });

// Listen to events
const unsubscribe = ctx.events.on('data:updated', (data) => {
  console.log('Data updated:', data);
});

// Clean up when done
unsubscribe();
```

## Customization

### Theming

DeskOS uses CSS custom properties for theming. Edit `src/styles.css` to customize:

```css
:root {
  --color-accent: #5c9fff;
  --color-bg-primary: #0a0a0f;
  --font-sans: 'IBM Plex Sans', sans-serif;
  /* ... */
}
```

### Window Manager

The window manager is fully customizable. Edit files in `window-manager/` to:

- Change window appearance
- Modify drag/resize behavior
- Implement tiling layouts
- Add window snapping

## Architecture

DeskOS uses a build-time program discovery system:

1. The Vite plugin scans `programs/` and `system/` directories
2. It extracts metadata from `program.tsx` files
3. A virtual module (`virtual:programs`) is generated with lazy imports
4. The Launcher uses this registry to display and launch programs

This approach provides:
- **Type Safety**: Full TypeScript support for program definitions
- **Tree Shaking**: Only included programs are bundled
- **Hot Module Replacement**: New programs appear instantly during development

## Contributing

Since DeskOS is designed as a personal fork, the recommended contribution workflow is:

1. Build useful programs in your fork
2. Submit a pull request to share with the community
3. The best ideas get merged into the main repository

## License

MIT

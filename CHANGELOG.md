# Changelog

## [1.4.0] - 2026-08-27

### Added

- Trash app (`programs/trash`): soft-delete storage, Restore / Delete Forever / Empty Trash
- `core/trash.ts` — `moveToTrash`, `restoreFromTrash`, `deleteForever`, `emptyTrash`
- Desktop icon context menu: Empty Trash via `iconContextMenu`
- Trash dock pin; `trash` / `trash-full` icons
- `ctx.selection.register()` — programs publish selection for context menus without core changes
- `registerSelectionSource` / `getActiveSelection` in `core/selection.ts` (shell + apps)

### Changed

- Delete on desktop and in folders is Move to Trash (no confirm on soft-delete)
- Context menu selection no longer uses `window.__*Selection` globals; registry by priority instead

## [1.3.0] - 2026-08-27

### Added

- Programs can declare `iconContextMenu` on `defineProgram` — custom desktop icon menu items appear after Open and New Window (before launch)
- `ctx.contextMenu.register(selector, …)` scopes CSS targets to the program’s windows so in-app menus (e.g. Preview on `img`) do not leak to other apps
- Element-specific app providers suppress the generic window chrome menu on the same click

## [1.2.0] - 2026-08-27

### Added

- Special locations define their own `getItems()` in `file-system/locations/*.ts`
- Auto-registration of special locations via `import.meta.glob` (any file under `locations/` is special)
- Solid White wallpaper preset (`wallpapers/presets/solid-white.ts`)
- `vite-env.d.ts` — Vite client types for `import.meta.glob`
- JSDoc on exported APIs and module helpers across the app
- Dock clock: date format presets (`medium` / `long` / `iso` / `dmy` / `mdy`) and optional seconds in Settings
- `DOCK_ITEMS` is the full dock layout: programs plus `separator`, `running`, and `clock` entries (order = left-to-right)
- Drag-to-select (marquee) on desktop and in folder windows; Ctrl/Cmd keeps prior selection
- Multi-item drag: dragging one selected icon/file moves the whole selection (desktop and folders)
- Group drop finds nearest free cell when a relative slot is occupied (no overlap)
- Folder sidebar highlights only the exact current path (not parent Recent/Favorites entries)
- Window restore from maximized uses the same geometry transition as maximize
- Keyboard editing shortcuts: Cmd/Ctrl+A/C/X/V, Delete/Backspace; cut ghost UI; paste folder→desktop; focus-aware handlers
- Directory windows: grid or list view (header toggle + context menu); preference saved in settings

### Changed

- Desktop icon grid fills the viewport: preferred `gridSize` picks density; cells stretch. On resize, icons keep the same cell (col/row); occupied cells are not dropped
- Dock launcher identified by `programId === 'launcher'` (removed `launcher` boolean on dock items)
- Special location registry keys use the `locations/<id>.ts` filename
- Settings → System Information: About card (DeskOS + version) plus runtime facts (browser, platform, display, local storage); removed redundant Current Theme row

### Fixed

- Opening a folder by id uses `parentPath` so nested folders resolve to the full path (not only `/Desktop/Name`)
- Nested folders no longer block “New Folder” on empty desktop cells (`findItemAtPosition` / placement only consider root desktop items)
- Desktop resize keeps each icon’s cell (col/row); grid only stretches — occupied cells are not dropped

## [1.1.0] - 2026-08-27

### Added

- `file-system/` — virtual FS module (`file-system.ts` + `locations/` for built-in roots)
- `dock/` — pinned dock items (`dock.ts` + `items/`)
- `wallpapers/` — built-in wallpaper presets (`wallpapers.ts` + `presets/`) + tone helpers
- `core/constants.ts` — shared desktop layout constants (grid, icon sizes, taskbar height, drag threshold)
- `context-menu/menus/` — one folder per context menu (`desktop`, `desktop-icon`, `folder-icon`, `launcher-item`, `window`, `text`), registered from `menus/index.ts`
- `CHANGELOG.md` — version history

### Changed

- Settings and Launcher live under `programs/` (removed `system/`); program scanner only reads `programs/`
- System UI uses SVG icons by default (special locations, folder sidebar, context menus, program templates); emoji only when a program sets a custom emoji icon
- Desktop icons fill one grid cell (`width`/`height` = `gridSize`); removed independent `iconSpacing` setting
- Icon size capped so glyph + label fit inside the cell when labels are enabled
- Drag snap uses icon center (neighbor cell highlights past midpoint)
- App version comes from `package.json` instead of a hardcoded string in `context.ts`
- Dragging a desktop icon no longer scales/rotates it
- Window drag is unrestricted (can move partially or fully off-screen); removed viewport clamp and shake feedback

### Fixed

- Accent color now applies to desktop/folder SVG icons and selection/hover chrome (was hardcoded blue)
- Light mode: context-menu submenus inherit theme (portals); settings toggles use accent when on; form text contrast (`--color-text` alias + button/select colors)
- Desktop icon contrast follows wallpaper brightness (`data-wallpaper-tone`), not UI light/dark theme
- Desktop wallpaper no longer overridden by light theme CSS

### Removed

- Legacy CSS (`.taskbar`, old window-control class aliases, unused `.window-icon` / `.sr-only`)
- Superseded desktop helpers (`findShortcutAtPosition`, `swapDesktopShortcutPositions`)
- Dead APIs and stubs (context-menu hooks surface, clipboard `paste()` placeholder, unused unregister helpers, unused error/event/file-system exports)
- Monolithic `context-menu/default-menus.ts` (split into `menus/*`)

## [1.0.0] - 2026-08-26

### Added

- Initial packaged release of the modular browser desktop environment
- Windowing, dock/taskbar, desktop shortcuts and folders
- Context menu system, settings, launcher, Notes program
- Program templates (`base`, `webview`, `media`) under `programs/templates/`

### Changed

- Package version aligned to `1.0.0` (previously tracked as `0.1.0` in early builds)

## [0.1.0] - 2026-08-25

### Added

- Project bootstrap: Vite + React + Zustand kernel
- Core services (storage, event bus, ProgramContext)
- First desktop shell and context menu foundation

[1.4.0]: https://github.com/enegalan/deskos/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/enegalan/deskos/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/enegalan/deskos/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/enegalan/deskos/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/enegalan/deskos/compare/v0.1.0...v1.0.0
[0.1.0]: https://github.com/enegalan/deskos/releases/tag/v0.1.0

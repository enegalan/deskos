# Changelog

## [1.2.0] - 2026-08-27

### Added

- Special locations define their own `getItems()` in `file-system/locations/*.ts`
- Auto-registration of special locations via `import.meta.glob` (any file under `locations/` is special)
- Solid White wallpaper preset (`wallpapers/presets/solid-white.ts`)
- `vite-env.d.ts` — Vite client types for `import.meta.glob`
- JSDoc on exported APIs and module helpers across the app

### Changed

- Desktop icon grid fills the viewport: preferred `gridSize` picks cols/rows; `cellWidth`/`cellHeight` stretch so there is no leftover strip
- Dock launcher identified by `programId === 'launcher'` (removed `launcher` boolean on dock items)
- Special location registry keys use the `locations/<id>.ts` filename

### Fixed

- Nested folders no longer block “New Folder” on empty desktop cells (`findItemAtPosition` / placement only consider root desktop items)

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

[1.2.0]: https://github.com/enegalan/deskos/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/enegalan/deskos/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/enegalan/deskos/compare/v0.1.0...v1.0.0
[0.1.0]: https://github.com/enegalan/deskos/releases/tag/v0.1.0

# Changelog

## [1.1.0] - 2026-08-27

### Added

- `core/constants.ts` — shared desktop layout constants (grid, icon sizes, taskbar height, drag threshold)
- `context-menu/menus/` — one folder per context menu (`desktop`, `desktop-icon`, `folder-icon`, `launcher-item`, `window`, `text`), registered from `menus/index.ts`
- `CHANGELOG.md` — version history

### Changed

- Desktop icons fill one grid cell (`width`/`height` = `gridSize`); removed independent `iconSpacing` setting
- Icon size capped so glyph + label fit inside the cell when labels are enabled
- Drag snap uses icon center (neighbor cell highlights past midpoint)
- App version comes from `package.json` instead of a hardcoded string in `context.ts`
- Dragging a desktop icon no longer scales/rotates it

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

[1.1.0]: https://github.com/YOUR_USERNAME/deskos/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/YOUR_USERNAME/deskos/compare/v0.1.0...v1.0.0
[0.1.0]: https://github.com/YOUR_USERNAME/deskos/releases/tag/v0.1.0

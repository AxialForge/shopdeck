# Changelog

## [Unreleased]
### Changed
- **Generators are now plug-ins.** The Generator tab is a plug-in area: it lists
  self-contained HTML **generator tools** kept in a *ShopDeck Generators* folder you
  own (Settings-configurable), opens each in a sandboxed window behind a small
  `window.shopdeckGenerator` bridge, and writes the modules a tool emits into the
  active library. Adds **Add generator…**, drag-drop install, and per-tool bulk
  conversion. Authoring template (`templates/generator-template.html`) and contract
  (`docs/GENERATOR-SPEC.md`) included.
### Removed
- The built-in tool-swap **timeline** generator no longer ships with the app (it's
  work-specific). It now runs as a local generator plug-in instead, so the public
  release carries only the framework and a blank template.
### Added
- Timeline generator (Generator tab): pick the standard spreadsheet (a "Swap Log"
  + "By Position" workbook) and produce a tool-swap timeline module in the **exact
  current format**, added to the library with the spreadsheet attached. Verified to
  reproduce existing timelines' data exactly across every sample part.
- Tabbed navigation: Home, Library, Generator, Settings, and About (description,
  version, GitHub + releases links).
- In-app delete for modules and folders (with a confirmation), and a one-click
  library backup (copies the whole library to a chosen location).
- Attach a whole folder (its modules + subfolder structure), and drag-and-drop
  files/folders onto the library to import them.
- Module viewer toolbar: a floating bar with a version picker, Source, Compare
  (side-by-side versions), and Close — injected over the module without altering it.
### Fixed
- Dropping a file/folder onto a window no longer navigates it away (the blank
  "attach folder" failure); drops are handled as imports instead.
- Test suite for the storage layer (`electron/library.js`) run via `node --test`,
  and a `ci` workflow (push/PR) plus a test gate on the release build.
### Fixed
- `scanLibrary` now dedupes by manifest `id` and resolves the highest-version file,
  so a leftover older file sharing an id can't double-list or become the "live" one.

## [0.2.0] — 2026-07-29
### Added
- Read-only vs editing mode (Settings → Mode) — read-only hides import, new folder,
  and per-card edit for shop-floor viewers on a shared library.
- Per-card version history — a version row to open any past version.
- Real rendered module thumbnails on cards (cached in `.shopdeck/thumbs`).
- Auto-refresh: the library re-scans when files change on disk / the shared drive.

## [0.1.0] — 2026-07-29
### Added
- Filesystem-backed library: the selected root folder's nested structure is the
  organization; modules are the `.html` files within. Hidden `.shopdeck/` index
  holds version history and app-side title/tag overrides.
- Folder-tree navigation with breadcrumb; editable title + tags per module.
- Settings view: library folder location (local or network share), theme picker.
- Light / grey / black themes (AxialForge royal-blue accent).
- Manual update checker (Settings → Check for updates), NSIS + portable installer,
  and a tag-triggered GitHub release workflow.

### Notes
- First public release: CI builds the NSIS installer + portable build and attaches
  them with `latest.yml` (the feed the manual updater reads) to the GitHub Release.
- App icon (`build/icon.ico`) is in place.

# Changelog

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

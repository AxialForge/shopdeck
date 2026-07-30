# Changelog

## [Unreleased]
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
- First tagged release will publish the installer + `latest.yml` that the updater
  reads. Add `build/icon.ico` (see `ICON-BRIEF.md`) before the first public build.

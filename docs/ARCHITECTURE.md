# Architecture

How ShopDeck is put together. For the developer setup and build commands, see
[BUILDING.md](BUILDING.md); for the module format, see [MODULE-SPEC.md](MODULE-SPEC.md).

## Stack at a glance

- **Electron** desktop shell (main + preload + renderer processes).
- **React 19** renderer, styled with **[Astryx](https://github.com/facebook/astryx)**
  (Meta's design system) — the chrome only; module content is never touched.
- **electron-vite** for the dev server / build; **electron-builder** for packaging.
- **Storage:** plain files on disk + a JSON index. **No database, no native Node
  modules** — nothing to compile, portable, backup-friendly, and it dodges the
  native-build toolchain entirely.

## Processes

```
┌─────────────────────────────┐         ┌──────────────────────────────┐
│ Renderer (React + Astryx)   │  IPC    │ Main (Node/Electron)         │
│ src/renderer/               │ ◄─────► │ electron/main.js             │
│  - library view, settings   │         │  - windows, dialogs          │
│  - talks only via           │         │  - settings.json (userData)  │
│    window.shopdeck          │         │  - calls library.js/updater  │
└─────────────────────────────┘         └──────────────┬───────────────┘
        ▲ contextBridge                                 │ pure-Node
        │ electron/preload.js                           ▼
        └───────────────────────────────  electron/library.js  (fs only)
```

- **Main** (`electron/main.js`) owns all privileged work: creating windows, file
  dialogs, reading/writing `settings.json` in `userData`, and every filesystem
  operation (delegated to `library.js`). It exposes an IPC API via `ipcMain.handle`.
- **Preload** (`electron/preload.js`) is the *only* bridge. It exposes a small,
  explicit `window.shopdeck` object through `contextBridge`. The renderer has no
  Node access, no `fs`, no `require`.
- **Renderer** (`src/renderer/`) is a normal React app. It calls `window.shopdeck.*`
  and renders results. It has a **dev fallback**: opened in a plain browser (no
  preload) it shows sample data, so the UI can be built and inspected without
  launching Electron.

### IPC surface (`window.shopdeck`)

| Method | Handler | Does |
|--------|---------|------|
| `getSettings()` / `setSettings(patch)` | `settings:get/set` | Read/merge `settings.json`. |
| `scan()` | `library:scan` | Scan the root → `{ root, folders, modules }`. |
| `chooseRoot()` | `library:chooseRoot` | Folder picker; repoint the library (supports UNC). |
| `revealRoot()` | `library:reveal` | Open the root in the OS file browser. |
| `open(id, version, title)` | `module:open` | Open a module in its own window. |
| `showSource(id, version)` | `module:source` | Reveal the attached source file. |
| `setMeta(id, {title, tags})` | `module:setMeta` | Save title/tag overrides. |
| `importInto(destRel)` | `module:import` | Pick + copy module(s) into a folder. |
| `createFolder(relPath)` | `folder:create` | Make a folder under the root. |
| `appVersion()` | `app:version` | The running app version. |
| `update.check/download/install()` | `updater:*` | Manual update flow. |
| `update.onStatus(cb)` | `updater:status` (event) | Subscribe to updater status. |

## Storage model

**The selected library root's folder tree is the organization.** There is no
hidden database of records — the folders and files you see in the OS *are* the
data. ShopDeck only adds a hidden sidecar for the things a filesystem can't
express (version history, per-module edits).

```
<root>/                         e.g. Documents\ShopDeck Library  (or \\server\share\…)
├─ Tooling/                     folders = the nav tree (any depth)
│  └─ Timelines/
│     ├─ part-A.html            a module: self-contained HTML + manifest
│     └─ part-A.xlsx            optional same-named source, rides along
└─ .shopdeck/                   hidden; everything ShopDeck adds
   ├─ index.json                per-module: version list + title/tag overrides
   └─ versions/<id>/vN/         archived snapshots (index.html [+ source])
```

### Scan &amp; versioning (`electron/library.js`)

`scanLibrary(root)`:

1. Walks the root (skipping `.shopdeck`), collecting `.html` files and all folders.
2. For each file: parses the `module-manifest`, validates it, records its folder
   (relative path), and detects a sibling source (`.xlsx`/`.xls`/`.csv`).
3. **Version snapshot:** if the manifest's `version` isn't already archived for
   that `id`, it copies the file (and source) into `.shopdeck/versions/<id>/vN/`.
   This means history accrues whether an update happens *in-app* or by someone
   dropping a newer file on the share — the scan notices and snapshots it.
4. Applies any `title`/`tags` overrides from `index.json`.
5. Returns `{ root, folders, modules }` for the renderer.

Other functions: `resolveModuleFile(root, id, version)` (live file for the latest,
an archived snapshot for older versions), `setOverride(root, id, patch)` (writes
edits into `index.json` — **never** the module file), `importFiles`, `createFolder`.

`library.js` imports **only** `node:fs`/`node:path`/`node:crypto` — no Electron —
so the same code powers the app and `scripts/seed.mjs`, and stays trivially testable.

## Theming

The renderer imports Astryx's reset + prebuilt component CSS + the neutral theme,
activated by `data-astryx-theme="neutral"` on `<html>`. The three AxialForge
themes layer on top in `app.css`:

- Astryx tokens are defined with CSS `light-dark()`, so flipping `color-scheme`
  switches the whole palette. `grey`/`black` set `color-scheme: dark`, `light` sets
  `light`.
- `html[data-theme="…"]` blocks override the accent (royal blue) and, for `black`,
  a few background tokens. These selectors out-specify Astryx's own token block
  (which sits on the same `<html>` element), so they win.
- The active theme is `document.documentElement.dataset.theme`, persisted as the
  `theme` setting.

## Updates

Manual only (`electron/updater.js`) — the sole code path that touches the network,
and only on an explicit click. `autoDownload` and `autoInstallOnAppQuit` are both
off; there is no launch check and no interval. It drives `electron-updater` against
the GitHub Releases feed (`latest.yml`). `SHOPDECK_NO_UPDATES` in the environment
is an enforced off. In dev (unpacked) it no-ops and says so rather than hanging.

## Build pipeline

`electron-vite` compiles the three processes into `out/` (main + preload as CJS,
renderer as a Vite bundle). `electron-builder` then packages `out/` into an NSIS
installer + portable exe under `dist/`, embedding `build/icon.ico` and generating
`latest.yml` from the `publish` config. CI runs this on a Windows runner on every
`v*` tag. See [BUILDING.md](BUILDING.md).

## Generators

`electron/generators/` turns source data into modules. The tool-swap timeline
generator (`timeline.js`, pure Node) reads the standard workbook (SheetJS) into the
timeline `DATA` object and injects it into a real timeline HTML template
(`timeline-template.html`, inlined via `?raw`) — so all CSS/JS/structure stay
byte-identical to the current standard. Its transform is verified against the
existing sample timelines (their generated `DATA` matches the originals exactly)
and covered by `test/generator.test.mjs`.

## Why no native modules

This is a deliberate constraint, not an accident. A native module (e.g. a
SQLite driver) would need a working native toolchain to compile — exactly the
thing that's unreliable on some Windows setups and breaks on paths containing
spaces. By staying pure-JS + files, ShopDeck builds anywhere, and the app's own
`@electron/rebuild` step is a no-op. Keep it that way.

# ShopDeck

A desktop **home for interactive HTML files built with AI agents**. A "module" is
one self-contained HTML file (inline CSS/JS/data) carrying a `module-manifest`
JSON block; ShopDeck stores, organizes, searches, version-tracks, and opens them
at full fidelity. It is deliberately domain-neutral — dashboards, trackers,
reports, checklists, and (as one work example) tool-swap timelines all plug in the
same way. Single-user desktop now; the library is plain files so a shared/network
deployment is a later config change.

New modules can also be produced by **generator plug-ins**: self-contained HTML
tools kept in the user's *ShopDeck Generators* folder (NOT bundled), listed on the
Generator tab, run sandboxed behind the `window.shopdeckGenerator` bridge, emitting
modules into the active library. See `docs/GENERATOR-SPEC.md`. The forging timeline
generator is intentionally a *local* plug-in, not in this repo.

## Non-negotiables

- **No native Node modules.** This Windows box can't compile native addons
  (Node 24 → ClangCL toolset missing). No `better-sqlite3`, no `node-gyp`
  packages. Storage is plain files + a JSON index; the whole stack is pure JS.
- **Modules stay untouched.** ShopDeck displays a module's HTML byte-for-byte in
  its own window. Astryx/React dress only the wrapper chrome, never the module.
- **The manifest is the contract — but it's optional.** ShopDeck prefers the
  embedded `module-manifest` block; when a self-contained HTML has none (e.g. a
  timeline exported by the standalone tool), `scanLibrary` **infers** one from the
  file — its `<title>`, filename, and, for tool-swap timelines, the embedded
  `const DATA` object (part, events, date range, operation tags). Inferred modules
  are flagged `inferred: true` (the card shows "· no manifest"). Files with a real
  manifest stay authoritative. See `MODULE-SPEC.md` in the sibling
  `Part timeline plus timeline` project for the field reference.
- Git identity is **AxialForge** (global). Check `git config --local --get-regexp '^user\.'`
  before the first commit — a stale local override has mis-attributed commits before.

## Commands

```bash
npm run seed      # import the 7 existing timelines into ./library (dev bootstrap)
npm run dev       # electron-vite: Vite dev server + Electron window, HMR
npm run build     # compile main / preload / renderer into out/
npm run preview   # run the built app
```

## Architecture

| Path | Role |
|------|------|
| `electron/main.js` | Electron main process: window, IPC handlers, opens module windows. |
| `electron/preload.js` | `contextBridge` — exposes `window.shopdeck` (list/open/import/showSource/libraryDir). Only surface the renderer can touch. |
| `electron/library.js` | **Pure-Node** storage layer (no Electron import) — manifest parse/validate, `scanLibrary`, `resolveModuleFile`, `setOverride`, `importFiles`, `createFolder`. Shared by main and seed. |
| `electron/generators-host.js` | **Pure-Node** generator host — `scanGenerators`, `parseGenerator`, `writeOutputs` (path-escape-safe). Lists plug-in tools + writes their emitted modules into the library. |
| `electron/generator-preload.js` | `contextBridge` for generator-tool windows — exposes `window.shopdeckGenerator` (context/pickFiles/emit/close). |
| `src/renderer/` | React + Astryx UI (the chrome). `App.jsx` = library view + settings + edit/new-folder modals. |
| `scripts/seed.mjs` | Copies the sample timelines into the default root under `Tooling/Timelines`. |
| `electron.vite.config.mjs` | electron-vite config; wires the `electron/` + `src/renderer/` layout. |

## Storage model (the important part)

**The selected library root's own folder tree IS the organization** — nested
folders (Main > Sub > Files) are mirrored live as the nav tree; modules are the
`.html` files inside them. Root defaults to `Documents/ShopDeck Library`, set in
`userData/settings.json` (`libraryRoot`), repointable to a network share in
Settings. The app only ever touches inside the root.

A hidden `<root>/.shopdeck/` holds everything the app adds:
- `index.json` — per-module version list + **title/tag overrides** (editing metadata
  writes here; **module `.html` files are never modified**).
- `versions/<id>/vN/` — archived snapshots so history survives even when a newer
  file is dropped on the share out-of-app. `scanLibrary` snapshots any
  not-yet-archived manifest `version` on each scan.

Renderer ⇄ main is IPC only (`ipcRenderer.invoke` ↔ `ipcMain.handle`). The
renderer has a **dev fallback**: with no Electron preload (plain browser at the
Vite URL) it shows sample data, so the UI can be built/inspected in a browser.

## Core extension point — new module types

Any self-contained HTML with a valid `module-manifest` works. Pick a new `type`
slug and set `id = <type>_<key>`; put type-specific searchable data under
`fields`. No wrapper code changes needed to *store/list/open* a new type. (A
type-aware generator or custom viewer is a later, optional plug-in.)

## Astryx (UI)

Meta's design system (`@astryxdesign/core` + `@astryxdesign/theme-neutral`, beta).
- CSS: renderer imports `core/reset.css`, `core/astryx.css` (prebuilt — **no
  StyleX/Babel plugin needed**), and `theme-neutral/theme.css`.
- Theme activates via `data-astryx-theme="neutral"` on `<html>` (see `index.html`).
- **The 3 AxialForge themes** (light/grey/black) are layered ON TOP via
  `html[data-theme="…"]` blocks in `app.css`: Astryx's tokens use `light-dark()`,
  so we just flip `color-scheme` (grey/black = dark, light = light) and override a
  few tokens (black = darker surfaces) + the royal-blue accent (`--sd-accent`).
  Theme persists as the `theme` setting; `App` sets `document.documentElement.dataset.theme`.
- Components used: `Button`, `Badge`, `Token`, `TextInput`, `SegmentedControl`.
  Variants: Button = primary/secondary/ghost/destructive; Badge = neutral/info/
  success/warning/error/…; Token color = default/red/…/gray.

## Gotchas

- **`Error: Electron uninstall` on `npm run dev`.** The Electron binary never
  downloaded because this box **blocks package install scripts** (an
  allow-scripts guard; you'll also see it warn about `@astryxdesign/core`'s
  postinstall). Fix: `node node_modules/electron/install.js` to fetch the binary.
  The Astryx postinstall is *only* an `astryx init` nudge — safe to skip.
- **`npm install` peer conflict: plugin-react wants Vite 8.** Latest
  `@vitejs/plugin-react` (6.x) peers `vite@^8`, but `electron-vite@5` caps at
  Vite 7. Pin `@vitejs/plugin-react@^5.1.4` (peers Vite 4–7) with `vite@^7`.
- **Node warns `MODULE_TYPELESS_PACKAGE_JSON`** running the seed. Harmless — Node
  reparses `electron/library.js` as ESM. Do **not** add `"type":"module"` to fix
  it: that changes what electron-vite expects for the Electron main output.
- **Don't reach for a native SQLite driver.** See non-negotiables — it won't
  compile here. The `.shopdeck/index.json` is the index by design.
- **Theme overrides must out-specify Astryx.** Astryx sets its `--color-*` tokens
  on the same `<html>` element (via `data-astryx-theme`). Our overrides use
  `html[data-theme="…"]` (specificity 0,1,1) which beats Astryx's attribute
  selector (0,1,0) — verified `black` bg lands at `#0a0a0b`. If a future override
  doesn't take, raise specificity; don't reach for `!important` first.
- **Electron has no `window.prompt`.** New-folder / rename use in-app modals, not
  `prompt()` (which is disabled in Electron and returns undefined).

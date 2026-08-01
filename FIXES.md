# ShopDeck — Fixes & Changes

A record of the bugs found and fixed (and the features added) while getting the
library working on a real Windows + OneDrive setup. All of this lives on the
`claude/shopdeck-file-selection-bug-j00q7y` branch (PR #1).

The reported symptom was: **"the app won't let me see or correctly select files,"**
starting with a fatal error dialog on launch. Chasing that down surfaced a chain
of related issues — three distinct bugs and two feature gaps — all documented below.

---

## 1. Launch crash — `UNKNOWN: unknown error, watch`

**Symptom.** On launch the app died immediately with Electron's fatal dialog:

```
A JavaScript error occurred in the main process
Uncaught Exception:
Error: UNKNOWN: unknown error, watch
    at FSWatcher._handle.onchange (node:internal/fs/watchers:267:21)
```

The main process crashed, so the window never rendered — hence "can't see or
select files."

**Root cause.** The library auto-refresh watcher created a **recursive**
`fs.watch` over the library root:

```js
watcher = watch(root, { recursive: true }, handler)   // wrapped in try/catch
```

The surrounding `try/catch` only guards the **synchronous** setup call. On
Windows, a recursive watch over an **OneDrive-synced** folder (the default root
was `Documents/ShopDeck Library`, and Documents is commonly OneDrive-synced) or
a network share fires an **asynchronous** `error` event — `UNKNOWN: unknown
error, watch` — from the `FSWatcher` handle, long after setup. With no `'error'`
listener attached, Node's `EventEmitter` re-throws it as an uncaught exception
and the whole main process dies.

**Fix.**
- Attach an `'error'` listener to the watcher that closes it and degrades to
  manual refresh instead of crashing.
- Add main-process `uncaughtException` / `unhandledRejection` guards so no stray
  async failure can ever show that fatal dialog again.

**Files.** `electron/main.js`
**Commit.** `44a3ec6`

---

## 2. Unreachable library bricked the UI (sibling of the crash)

**Symptom.** If the configured library folder was an offline network share or a
deleted folder, the app hung forever on **"Loading…"** with nothing shown and no
error.

**Root cause.** Every IPC handler funnels through `libraryRoot()`, which did
`await fs.mkdir(root, …)`. That throws when the root is unreachable, so
`library:scan` rejected — and the renderer's `reload()` had **no `try/catch`**,
so the rejection was swallowed, `setLoading(false)` never ran, and the view was
stuck. Same failure family as the watch crash: a network-share subsystem failure
that should degrade gracefully but instead broke the app.

**Fix.**
- `libraryRoot()` never throws now (best-effort `mkdir`, ignore failure).
- `library:scan` degrades to a soft error object (`{ root, folders: [],
  modules: [], error }`) instead of rejecting.
- The renderer wraps its reload in `try/catch/finally` and shows a dismissable
  **error banner** with **Retry** and **Manage libraries** instead of an empty
  window.

**Files.** `electron/main.js`, `src/renderer/src/App.jsx`, `src/renderer/src/app.css`
**Commit.** `d730fcc`

---

## 3. Library showed the folder but **zero modules** (OneDrive on-demand files)

**Symptom.** After the crash was fixed, the library listed the folder in the nav
tree but showed **0 modules** inside it — even though the `.html` files were
clearly there in Explorer. It reproduced on a plain `C:` drive too.

**Root cause.** OneDrive **"Files On-Demand"** placeholder files are reparse
points, and `fs.readdir(dir, { withFileTypes: true })` reports them as
**symlinks, not files** — `dirent.isFile()` returns `false`. The scan's `walk()`
required `entry.isFile()`, so it **skipped every module**, while directories
(which keep their folder attribute) were still detected. That's the exact
fingerprint: folder visible, files invisible. Moving the files to another folder
on the **same volume** keeps them as placeholders, so it reproduced off OneDrive
as well.

**Fix.**
- New `entryKind()` helper: trust the dirent when it's decisive, otherwise
  **`stat`** to resolve the real type (`stat` reads metadata only — it does *not*
  download an online-only file). `walk()` and `walkHtmlUnder()` use it, so
  placeholder/symlinked `.html` files are discovered. A realpath-keyed `seen`
  set guards against symlink/junction cycles now that reparse entries are
  followed.
- `scanLibrary` also returns `htmlCount` and a `skipped` list (file + reason),
  and the empty-state message uses them to **explain itself** ("Found N HTML
  files here, but … First: <file> — <reason>.") instead of a bare "Library is
  empty" — so any remaining cause is visible without another debugging round.

**Files.** `electron/library.js`, `src/renderer/src/App.jsx`
**Commit.** `0aa5aee`

---

## 4. Standalone-tool timelines had **no manifest** (files loaded but were rejected)

**Symptom.** With the scan now finding the files, the app reported: *"Found 9
HTML files here, but none are valid modules — each needs a `module-manifest`
block. First: … — no module-manifest block found."*

**Root cause.** The timeline files were exported by the **standalone timeline
tool**, not by ShopDeck's own generator. They carry a `<title>` and an embedded
`const DATA = {…}` object, but **no `module-manifest`** block. ShopDeck was built
to catalog only files that carry that manifest, so it correctly found the files
but rejected all of them. The requirement was to support **both** generated
(manifest-carrying) and standalone (manifest-less) files, since multiple users
would be dropping in files.

**Fix.** ShopDeck now **infers a manifest** when a file has none (or an invalid
one):
- **Any HTML** gets an id from its filename and a title from its `<title>`.
- **Tool-swap timelines** are recognized from the embedded `DATA` and enriched
  with the part number, event (swap) count, date range, and operation tags — so
  their cards look just like generated ones. (Verified against the real exported
  file: part `40-1318-01`, 147 events, 2011→2026, tags
  preform/blocker/finish/pierce-strip/trim.)
- Inferred modules are flagged `inferred: true` and the card shows a small
  **"· no manifest"** note. Files with a real manifest stay authoritative.
- `importFiles` / `importTree` no longer reject manifest-less HTML either.

**Files.** `electron/library.js`, `src/renderer/src/App.jsx`, `CLAUDE.md`
**Commit.** `627ec6a`

---

## Feature A — Multiple libraries + rename

Added support for keeping **several named libraries** (local folders or network
shares) and switching between them.

- **New pure-Node model `electron/libraries.js`.** A library is a named pointer
  `{ id, name, root }`. **Rename** edits the app-side label only — the folder on
  disk is never renamed (consistent with how ShopDeck stores title/tag overrides
  and never modifies your files). **Remove** just unlinks a library; the files
  stay on disk. The last library can't be removed. Legacy single-root installs
  migrate automatically on first run.
- `electron/main.js` keeps a normalized `{ libraries, activeLibraryId }` view;
  the existing `libraryRoot()` now resolves the **active** library, so every
  downstream handler keeps working unchanged. New IPC:
  `libraries:list/add/rename/remove/switch/reveal`.
- `electron/preload.js` exposes `window.shopdeck.libraries.*`.
- Renderer: an **active-library switcher** in the top bar, and a full
  **Libraries** manager in Settings (use / rename / reveal / remove / add).

**Files.** `electron/libraries.js`, `electron/main.js`, `electron/preload.js`,
`src/renderer/src/App.jsx`, `src/renderer/src/app.css`, `test/libraries.test.mjs`
**Commit.** `d730fcc`

---

## Feature B — On-demand Windows installer build (CI)

Because the installer can only be built on Windows, added a CI workflow that
builds the NSIS + portable installers on a `windows-latest` runner and uploads
them as a **private, auto-expiring artifact** (no public release). This is what
produced each test build during debugging.

- Triggers: `workflow_dispatch`, a `winbuild-*` tag, or a push to the feature
  branch.
- The existing `release.yml` (public GitHub Release on a `v*` tag) is untouched
  and remains the path for real releases.

**Files.** `.github/workflows/build-windows.yml`
**Commits.** `d8ec34c`, `c967885`

---

## Testing

Electron itself can't be launched in the build/agent environment (package
install scripts are blocked there, per `CLAUDE.md`), so verification relied on
the pure-Node test suite plus real-file checks:

- `test/library.test.mjs` — manifest parsing/validation, scanning, versioning,
  overrides, import, **OneDrive/symlink discovery**, and **manifest inference**
  (timeline + generic).
- `test/libraries.test.mjs` — the multi-library model (migration, add/rename/
  remove/switch, de-dup, "always at least one library").
- Full pure-Node suite: **24 tests passing.** CI (`node --test` on Ubuntu) and
  the Windows installer build are both green on the branch.

Each fix was confirmed on the user's real Windows machine via a fresh installer
build, ending with all 9 timelines showing correctly.

---

## Summary

| # | Problem | Cause | Fix | Commit |
|---|---------|-------|-----|--------|
| 1 | Fatal crash on launch | Async `fs.watch` error, no `'error'` listener | Watcher error handler + process guards | `44a3ec6` |
| 2 | Stuck on "Loading…" | `libraryRoot()`/scan threw on unreachable root | Soft-error scan + retry banner | `d730fcc` |
| 3 | Folder shown, 0 modules | OneDrive placeholders read as symlinks; `isFile()` false | `stat`-resolve entries + self-diagnosing empty state | `0aa5aee` |
| 4 | Files found but rejected | Standalone timelines carry no manifest | Infer a manifest from `<title>` + `DATA` | `627ec6a` |
| A | — | Feature: multiple libraries + rename | `electron/libraries.js` + UI | `d730fcc` |
| B | — | Feature: on-demand Windows installer build | `build-windows.yml` | `d8ec34c` |

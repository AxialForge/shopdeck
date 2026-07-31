# Building &amp; releasing

Dev setup, local builds, and the release process. For how the pieces fit, see
[ARCHITECTURE.md](ARCHITECTURE.md).

## Prerequisites

- **Node.js 22+** and **npm**
- **Git**
- **Windows** to produce Windows installers (the CI runner is `windows-latest`)

## Setup

```bash
git clone https://github.com/AxialForge/shopdeck.git
cd shopdeck
npm install
```

If Electron's binary didn't download during install (some environments block
package install scripts), fetch it once:

```bash
node node_modules/electron/install.js
```

## Running in development

```bash
npm run seed     # optional: copy the sample timeline modules into the default library
npm run dev      # electron-vite: Vite dev server + Electron window, hot reload
```

`npm run dev` starts the renderer dev server and launches Electron against it, with
HMR for renderer changes and an automatic restart on main/preload changes.

You can also open the printed `http://localhost:<port>` in a plain browser: the
renderer runs in a **preview mode** with sample data (no Electron features), handy
for UI work. Note this is *not* proof the packaged app boots — always sanity-check
in the Electron window too.

## Scripts

| Script | Does |
|--------|------|
| `npm run dev` | Dev server + Electron (hot reload). |
| `npm run build` | Compile main/preload/renderer into `out/`. |
| `npm run build:win` | `build` + electron-builder → NSIS installer + portable in `dist/`. |
| `npm run build:portable` | Portable build only. |
| `npm test` | Run the storage-layer test suite (`node --test`, no Electron). |
| `npm run seed` | Copy the sample modules into `Documents\ShopDeck Library`. |
| `npm run preview` | Run the built app. |

## Testing

`electron/library.js` is pure Node, so its tests (`test/*.test.mjs`) run with
`node --test` — no Electron, no build. They cover manifest parse/validate,
scanning, versioning + snapshots, overrides, and import. CI runs them on every
push/PR (`.github/workflows/ci.yml`) and the release build is gated on them.

## Building the installer

```bash
npm run build:win
```

Produces in `dist/`:

- `shopdeck-<version>-setup.exe` — NSIS installer
- `shopdeck-<version>-setup.exe.blockmap` — for delta/verified updates
- `shopdeck-<version>-portable.exe` — portable build
- `latest.yml` — the update feed the app reads

Packaging is configured in [`electron-builder.yml`](../electron-builder.yml):
NSIS + portable targets, GitHub publish (`AxialForge/shopdeck`), the app icon
(`build/icon.ico`), and **space-free artifact names** (`${name}-${version}-setup.${ext}`).

### App icon

`build/icon.ico` must be a multi-size `.ico` including a **256×256** entry (Windows
requires it). Missing → electron-builder falls back to the default Electron icon.

### Code signing

Builds are currently **unsigned** (Windows may show a SmartScreen prompt). To sign,
provide `CSC_LINK` / `CSC_KEY_PASSWORD` to electron-builder (locally as env vars or
in CI as secrets); no config change is needed.

## Releasing

Releases are **tag-driven**. The house flow:

1. Bump `version` in `package.json`.
2. Add a `CHANGELOG.md` entry for the new version (same commit).
3. Commit, then tag and push:

```bash
git commit -am "Release 0.2.0: <what changed>"
git tag v0.2.0
git push origin main --tags
```

The [`release`](../.github/workflows/release.yml) workflow triggers on `v*` tags,
builds on Windows (`npm ci` → `npm run build:win`), and attaches the installer,
portable exe, `latest.yml`, and `.blockmap` to a GitHub Release.

Once published, the in-app **Settings → Check for updates** will find it (it reads
`latest.yml` from the latest Release). **The release must contain `latest.yml` +
the `.blockmap`**, or the updater has no feed to read — the workflow uploads both.

### Versioning

Semantic versioning in `package.json`. A pre-release (`1.0.0-beta`) sorts lower
than its release; the updater refuses an "update" that isn't strictly newer.

## Common gotchas

- **`Error: Electron uninstall` on `npm run dev`** — the Electron binary didn't
  download (blocked install scripts). Run `node node_modules/electron/install.js`.
- **Dependency install: peer conflict** — `@vitejs/plugin-react` must stay on a
  version that peers Vite 7 (electron-vite 5 caps at Vite 7). Pinned in
  `package.json`.
- **Keep it native-free** — do not add a native Node module; it breaks the
  compile-anywhere guarantee and the `@electron/rebuild` no-op. Use pure-JS/WASM.
- **Artifact names must be space-free** — otherwise the on-disk file, `latest.yml`,
  and the GitHub asset names disagree and the updater 404s. Already enforced in
  `electron-builder.yml`.

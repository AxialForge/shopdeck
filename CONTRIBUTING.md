# Contributing

Thanks for working on ShopDeck. This is a small, focused desktop app; the guidance
below keeps it that way.

## Getting set up

See [docs/BUILDING.md](docs/BUILDING.md). Short version:

```bash
npm install
node node_modules/electron/install.js   # if Electron didn't auto-download
npm run dev
```

## Ground rules (don't regress these)

- **No native Node modules.** ShopDeck is pure-JS + files by design so it compiles
  anywhere and never needs a native toolchain. No `better-sqlite3`, no `node-gyp`
  packages. The index is `.shopdeck/index.json`; that's deliberate.
- **The renderer talks to main only through `window.shopdeck`.** No Node, no `fs`,
  no `require` in the renderer. Add capabilities as a new IPC handler in
  `electron/main.js` + a method in `electron/preload.js`.
- **Never modify module files.** ShopDeck displays module `.html` byte-for-byte;
  edits (title/tags, versions) live in the hidden `.shopdeck` index only.
- **Keep the storage layer pure.** `electron/library.js` imports only
  `node:fs`/`node:path`/`node:crypto` — no Electron — so it's shared with the seed
  script and stays testable.
- **Keep the browser dev-fallback working.** The renderer must still render with
  sample data when `window.shopdeck` is absent (plain-browser preview).

## Project layout

See the tree in the [README](README.md#project-structure) and
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Adding a module *type*

You usually don't need to touch app code: any self-contained HTML with a valid
`module-manifest` (see [docs/MODULE-SPEC.md](docs/MODULE-SPEC.md)) is stored, listed,
opened, and versioned as-is. Only add code if a type needs bespoke rendering or a
generator — and keep that behind the same manifest contract.

## Commit style (house convention)

- Imperative mood, lower-case after any prefix, **no trailing period**.
- Describe the behaviour change, not the file list.
- No Conventional Commits prefixes (`feat:`/`fix:`).

```
Add version-compare view to the module window
Release 0.2.0: version compare + shared-drive auto-refresh
```

Commits are authored by **AxialForge** and carry **no** Claude/AI attribution.

## Verifying a change

- `npm run build` must pass (compiles all three processes).
- Check the renderer in a browser (`npm run dev`, open the printed URL) **and** in
  the Electron window — the browser preview alone doesn't prove the packaged app
  boots.
- For packaging changes, run `npm run build:win` and confirm `dist/` has the
  installer + `latest.yml` + `.blockmap`.

## Pull requests

1. Branch from `main`.
2. Keep PRs focused; update the relevant `docs/` and `CHANGELOG.md`.
3. Describe what changed and how you verified it.

## Releasing

Maintainers cut releases by tagging — see
[docs/BUILDING.md → Releasing](docs/BUILDING.md#releasing).

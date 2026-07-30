# ShopDeck

A desktop library for **interactive work-item modules** — self-contained HTML
documents that ShopDeck stores, organizes, searches, version-tracks, and opens at
full fidelity. First module type: tool-swap timelines; built to hold more.

## Quick start

```bash
npm install
node node_modules/electron/install.js   # if the Electron binary didn't auto-download
npm run seed                            # load the existing timelines into ./library
npm run dev                             # launch the app
```

## What a module is

One HTML file, all assets inline, carrying an embedded manifest:

```html
<script type="application/json" id="module-manifest">
{ "schema": 1, "id": "tool-swap-timeline_40-1471-01", "type": "tool-swap-timeline",
  "title": "Tool Swap Timeline — 40-1471-01", "version": 1,
  "created": "2026-07-29", "updated": "2026-07-29", "category": "Tooling",
  "tags": ["blocker","finish"], "fields": { "part": "40-1471-01", "events": 68 } }
</script>
```

ShopDeck reads only the manifest to catalog it. Re-importing a higher `version`
of the same `id` keeps the old one — that's the version history. Full contract:
`MODULE-SPEC.md` in the sibling timelines project.

## Stack

Electron + React, chrome styled with [Astryx](https://github.com/facebook/astryx)
(Meta's design system). Storage is plain files under `library/` indexed by
per-module `meta.json` — no database, no native modules. See `CLAUDE.md` for
architecture and gotchas.

## Status

MVP: library grid (search / sort / category + tag filters), import with
auto-versioning and source (`.xlsx`) attachment, and open-in-window at full
fidelity. Roadmap: in-app version dropdown + viewer toolbar, drag-and-drop
import, theme picker, and an optional xlsx→HTML generator.

# Generator plug-ins

A **generator** is a self-contained HTML tool that turns input files into ShopDeck
modules. Generators are *your own plug-ins* — ShopDeck ships the framework and a
blank template, not the tools. They live in a folder ShopDeck watches (the
**generators folder**), never inside the app bundle, so work-specific or private
generators stay on your machine and out of any public release.

This mirrors the whole idea of ShopDeck: a generator is itself an interactive HTML
file you can build with an AI agent.

## The lifecycle

1. You drop a generator's `.html` file in the generators folder (Generators tab →
   **Open generators folder**, or **Add generator…**, or drag it onto the tab).
2. ShopDeck reads its manifest and lists it as a card.
3. You click **Open** — the tool runs in its own sandboxed window.
4. You give it a file (drag-drop, its own file picker, or `pickFiles()`).
5. The tool builds one or more modules and calls `emit()`.
6. ShopDeck writes them into the active library and refreshes.

The tool runs with `contextIsolation` on and **no Node access**. Its only link to
ShopDeck is the `window.shopdeckGenerator` bridge.

## The generator manifest

Declare the tool with an inert JSON block anywhere in the file:

```html
<script type="application/json" id="generator-manifest">
{
  "schema": 1,
  "id": "tool-swap-timeline",
  "name": "Tool-Swap Timeline",
  "description": "Turn the standard timeline workbook into a timeline module.",
  "version": 1,
  "accepts": [".xlsx", ".xls"],
  "folder": "Tooling/Timelines"
}
</script>
```

| Field | Required | Meaning |
|-------|----------|---------|
| `schema` | — | Manifest schema version (currently `1`). |
| `id` | ✓ | Stable slug; de-dupes tools. |
| `name` | ✓ | Shown on the card and window title. |
| `description` | — | One line under the name. |
| `version` | — | Tool version (default `1`). |
| `accepts` | — | Extensions the native picker offers, e.g. `[".xlsx"]`. Empty = any. |
| `folder` | — | Default library subfolder for emitted modules. Overridable per `emit()`. |

If a file has no manifest, ShopDeck still lists it (name inferred from the
`<title>`/filename) and marks it *· no manifest*.

## The bridge — `window.shopdeckGenerator`

| Call | Returns | Notes |
|------|---------|-------|
| `context()` | `{ id, name, accepts, folder }` | What the manifest declared. |
| `pickFiles({ accept, multiple })` | `{ canceled, files:[{name, path, bytes}] }` | Native file dialog. `bytes` is a `Uint8Array`. |
| `emit(modules, { folder })` | `{ results:[{ ok, file, folder, error? }] }` | Writes modules into the active library. |
| `close()` | — | Closes the tool window. |

`modules` is an array of:

```js
{
  filename,            // base name; ShopDeck sanitizes it and adds .html
  html,                // the full self-contained module HTML (string)
  folder,              // optional: override the save folder for this module
  source: { name, bytes }  // optional: original input saved alongside the module
}
```

You don't have to use `pickFiles()` — a plain drop zone or `<input type="file">`
gives you `File` objects, and `await file.arrayBuffer()` gives you the bytes. Use
`pickFiles()` when you want the OS dialog filtered to `accepts`.

## Output modules

Every emitted module should be a valid ShopDeck module: a self-contained HTML file
carrying a `module-manifest` block (see [MODULE-SPEC.md](MODULE-SPEC.md)). The
template's `moduleHtml()` helper builds a minimal valid one for you.

## Writing one

Start from [`templates/generator-template.html`](../templates/generator-template.html).
It's a complete, working generator (wraps a text file into a module); replace its
`buildModule()` with your conversion and edit the manifest. Everything is inline
and offline — bundle any library you need (e.g. a browser build of SheetJS for
spreadsheets) right in the file so the tool stays self-contained.

## Safety

- Tools are sandboxed (no Node, no file writes of their own).
- ShopDeck sanitizes every emitted `filename` and `folder`: no path escapes, no
  `..`, no drive letters — output always lands inside the active library.
- ShopDeck never runs a generator on its own; you open it explicitly.

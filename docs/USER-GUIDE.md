# User guide

A walkthrough of ShopDeck for everyday use. For the file format, see
[MODULE-SPEC.md](MODULE-SPEC.md).

## Installing

Download the latest **[release](https://github.com/AxialForge/shopdeck/releases/latest)**:

- **Installer** (`shopdeck-<version>-setup.exe`) — recommended. Installs per-user,
  adds Start-menu/desktop shortcuts, and supports in-app updates.
- **Portable** (`shopdeck-<version>-portable.exe`) — runs without installing; no
  update checker.

Windows 10/11.

## First launch

ShopDeck creates a library folder at `Documents\ShopDeck Library` and opens empty.
Add modules by **Import**ing them, or by dropping `.html` files (and their sibling
sources) into folders under that root. To use a shared library instead, go to
**Settings → Library folder → Change folder…** and pick a network share.

## Getting around

The tab row at the top switches between **Home** (a quick dashboard), **Library**
(your modules), **Generator** (where module generators will live), **Settings**,
and **About**.

## The library view

- **Folder tree** (left) — mirrors the folders under your library root. Click a
  folder to show its modules (and everything nested under it). Click **All** to
  show the whole library. The **breadcrumb** above the grid shows where you are.
- **Cards** (center) — one per module: title/part number, type, a **version
  badge**, a preview, a size figure, its tags, and **Edit** / **Source** actions.
- **Tags** (left, below folders) — click to filter; click again to clear. Combine
  with the folder selection and search.
- **Toolbar** — search box, sort (**Updated / Name / Swaps**), **New folder**, and
  **Import**.

## Opening a module

Click a card. The module opens in **its own window** at full size, with all of its
built-in interactivity working (zoom, fit, filters, hover). A small floating
toolbar sits at the bottom with a **version picker**, **Source** (reveal the
attached file), **Compare** (open another version side-by-side), and **Close**.
The library window stays as you left it.

## Searching, sorting, filtering

- **Search** matches part number, title, description, and tags.
- **Sort** by most-recently-updated, name, or size.
- **Tag filter** narrows to modules carrying any selected tag.
- **Folder** selection scopes everything to that branch of the tree.

These stack — e.g. *Tooling ▸ Timelines* + tag `blocker` + search `147`.

## Importing modules

Everything lands in the folder you're currently viewing. Three ways to bring
modules in:

- **Import** — pick one or more `.html` files.
- **Attach folder** — pick a folder; its modules **and subfolder structure** are
  copied in (great for bringing an existing library of timelines across).
- **Drag and drop** — drop files or folders straight onto the library window.

Each module's same-named source (`.xlsx`/`.csv`) rides along. Re-importing a file
whose manifest `version` is higher files it as a **new version**, keeping the old
one in history.

## Editing title &amp; tags

Click **Edit** on a card to rename the module or change its tags. Saved instantly.

- Edits are stored in ShopDeck's index — **the module file is never modified**.
- **Reset to file** clears your edits and reverts to the module's own title/tags.

## Folders

Use **New folder** to organize (it makes a real folder under the current one). You
can also create/rename/move folders directly in Windows Explorer or on the share —
ShopDeck mirrors whatever structure is there.

## Versions

Every time a module is rebuilt with a higher `version`, ShopDeck keeps the old one.
The card shows the latest version badge, and — when there's more than one version —
a **version row** (`v3 v2 v1`); click any of them to open that specific version.
Clicking the card itself opens the latest. Inside the module window, the toolbar's
version picker switches versions and **Compare** tiles two versions side-by-side.

## Read-only vs editing mode

**Settings → Mode:** switch to **Read-only** to hide Import, New folder, and the
per-card Edit — ideal for shop-floor viewers on a shared library who should browse
and open, not change things. **Editing** restores the full controls. Viewing
versions and opening modules works in both modes.

## Auto-refresh

When a module is added to (or changed in) the library folder — including by a
coworker on the shared drive — ShopDeck notices and updates the view without a
restart. (On some network shares that don't emit change events, reopen or switch
folders to force a re-scan.)

## Themes

**Settings → Theme:** Light, Grey (default), or Black. Applies instantly and is
remembered.

## Updates

**Settings → Updates → Check for updates.** ShopDeck never checks or downloads on
its own — only when you click.

- If an update is found, click **Download**, then **Restart &amp; install**.
- Updates work only in the **installed** app (not the portable build or when
  running from source).

## Settings summary

| Setting | What it does |
|---------|--------------|
| **Mode** | Editing or Read-only (hides import/edit/new-folder). |
| **Library folder** | Where your library lives — a local folder or a network share. Change or open it here. |
| **Theme** | Light / Grey / Black. |
| **Updates** | Manual check / download / install; shows the current version. |

## Tips for teams on a shared drive

- Point every install's **Library folder** at the same network share.
- Anyone can drop a module `.html` (+ its source) into a folder on the share; it
  appears for everyone on their next scan.
- Version history and edits live in the share's hidden `.shopdeck` folder, so
  they're shared too. (Avoid two people editing the same module's metadata at the
  exact same moment — last write wins.)

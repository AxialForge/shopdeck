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
built-in interactivity working (zoom, fit, filters, hover). Close the window to
return; the library stays as you left it.

## Searching, sorting, filtering

- **Search** matches part number, title, description, and tags.
- **Sort** by most-recently-updated, name, or size.
- **Tag filter** narrows to modules carrying any selected tag.
- **Folder** selection scopes everything to that branch of the tree.

These stack — e.g. *Tooling ▸ Timelines* + tag `blocker` + search `147`.

## Importing modules

1. Navigate to the folder you want the module to land in.
2. Click **Import** and pick one or more `.html` files.
3. ShopDeck copies each file (and any same-named `.xlsx`/`.csv` source) into that
   folder and adds it to the library.

Re-importing a file whose manifest `version` is higher than what's stored files it
as a **new version**, keeping the previous one in history.

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
The card shows the latest version badge. (An in-window version picker and
side-by-side compare are on the roadmap; today, opening shows the latest.)

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

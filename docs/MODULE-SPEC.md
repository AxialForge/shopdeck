# Module specification (schema v1)

The contract every **module** must satisfy to live inside ShopDeck. Timelines are
the first module type, not the only one — this spec is deliberately domain-neutral
so a checklist, a report, a dashboard, or anything else plugs in the same way.

> **The one rule that matters:** a module is a *single self-contained `.html` file*
> that carries a `module-manifest` block. If it has a valid manifest and renders
> with no external network calls, ShopDeck can catalog, version, and display it —
> without knowing anything about what's inside.

## 1. What a module is

- **One file.** All CSS and JS inline; all data embedded. No `<link>`/`<script
  src>` to the internet, no `fetch`. This is what lets ShopDeck open it at full
  fidelity, offline, forever.
- **Self-describing.** It contains a `module-manifest` JSON block (below). ShopDeck
  reads *only* the manifest to catalog it; the filename is a fallback, not the
  source of truth.
- **Responsive.** It should fit whatever window ShopDeck gives it and survive a
  resize.
- **Optionally paired with a source.** A same-named sibling file (e.g. the `.xlsx`
  a timeline was built from) is stored alongside and offered for download. It is
  never required to render the module.

## 2. The manifest block

Embed exactly one of these in the document `<head>`, right after `<title>`:

```html
<script type="application/json" id="module-manifest">
{
  "schema": 1,
  "id": "tool-swap-timeline_40-1471-01",
  "type": "tool-swap-timeline",
  "title": "Tool Swap Timeline — 40-1471-01",
  "version": 1,
  "created": "2026-07-29",
  "updated": "2026-07-29",
  "category": "Tooling",
  "tags": ["preform", "blocker", "finish"],
  "description": "Die-set removal history for part 40-1471-01.",
  "source": { "file": "tool-swap-timeline_40-1471-01.xlsx", "kind": "xlsx" },
  "fields": {
    "part": "40-1471-01",
    "partFamily": "40",
    "events": 68,
    "dateRange": { "from": "2025-11-12", "to": "2026-07-23" }
  }
}
</script>
```

`type="application/json"` means the browser never renders or runs the block — it's
inert to the module and readable by ShopDeck.

## 3. Field reference

### Required — a module without these is ignored

| Field | Type | Meaning |
|-------|------|---------|
| `schema` | int | Manifest schema version. Currently **1**. |
| `id` | string | **Stable identity across all versions.** Same `id` + higher `version` = a new version of the *same* module. Convention `<type>_<key>`, lowercase, `^[a-z0-9][a-z0-9._-]*$`. |
| `type` | string | Machine slug for the module kind, e.g. `tool-swap-timeline`. |
| `title` | string | Human display name (shown on cards and in the window title). |
| `version` | int | Starts at `1`, increments by 1 on every rebuild of the same `id`. |
| `created` | string | `YYYY-MM-DD` — when v1 was first made. |
| `updated` | string | `YYYY-MM-DD` — when *this* version was made. |

### Recommended — makes the library usable

| Field | Type | Meaning |
|-------|------|---------|
| `category` | string | A grouping label (informational; folders are the primary organization). |
| `tags` | string[] | Lowercase, for search/filter. |
| `description` | string | One-line summary. |

### Optional

| Field | Type | Meaning |
|-------|------|---------|
| `source` | object | `{ "file": "<name>", "kind": "xlsx"｜"csv"｜… }` — the attached source doc. ShopDeck actually finds the source by same-basename sibling, so this is descriptive. |
| `fields` | object | **Type-specific** searchable metadata. ShopDeck indexes it generically without understanding it — put anything a given module type needs here instead of inventing new core fields. |

## 4. Versioning rules

- **Identity is `id`, not the filename.** Rename the file freely; ShopDeck matches
  on `id`.
- **A higher `version` for an existing `id`** is filed as a new version; the old
  one stays viewable. That is the whole "I built it, then updated it" flow.
- ShopDeck snapshots each version into its hidden `.shopdeck/versions/<id>/vN/` the
  first time it sees that version — whether you updated in-app or dropped a newer
  file on the share.
- `created` never changes after v1; `updated` reflects the current version.

## 5. Editable metadata

Users can rename a module or change its tags in ShopDeck. Those edits are stored as
**overrides** in the library's hidden index — the module `.html` file is **never
modified**. The manifest remains the file's own truth; overrides are ShopDeck's
view on top. (Clearing an override in the app reverts to the manifest values.)

## 6. Authoring a new module type

1. Start from a self-contained HTML skeleton (inline everything).
2. Add the manifest block; pick a new `type` slug and set `id = <type>_<key>`.
3. Put anything type-specific under `fields`.
4. Import it (or drop the file into a library folder). If the manifest is valid it
   appears in the library — no ShopDeck code changes needed to store, list, open,
   or version a brand-new type.

Minimal skeleton:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>My Module</title>
<script type="application/json" id="module-manifest">
{ "schema": 1, "id": "my-type_key", "type": "my-type", "title": "My Module",
  "version": 1, "created": "2026-07-29", "updated": "2026-07-29",
  "category": "Uncategorized", "tags": [], "fields": {} }
</script>
</head>
<body>
  <!-- your self-contained interactive content + inline data -->
</body>
</html>
```

## 7. Validation (what ShopDeck enforces)

- Exactly one `<script type="application/json" id="module-manifest">`, valid JSON.
- All **required** fields present and well-typed; `schema` is a known version (1).
- `id` matches `^[a-z0-9][a-z0-9._-]*$`; `version` is an integer ≥ 1.
- `created`/`updated` are `YYYY-MM-DD`.
- A file that fails validation is simply skipped (not imported/listed).

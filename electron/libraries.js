// Pure-Node library-list model for ShopDeck. No Electron imports — shared by the
// Electron main process and unit tests (runs under `node --test`).
//
// A "library" is a named pointer to a root folder:
//   { id, name, root }
// The NAME is a friendly, app-side label (stored in settings) — renaming a
// library changes that label only; the folder on disk is never touched, exactly
// like the title/tag overrides in library.js. Multiple libraries can coexist;
// `activeLibraryId` selects the one the app is currently showing.
//
// Settings shape:
//   { libraries: [{id,name,root}], activeLibraryId, theme, mode, showUpdater }
// The legacy single-root `libraryRoot` field is migrated on first read.

import { randomUUID } from 'node:crypto'

/**
 * A sensible default display name from a folder path (its last segment).
 * Splits on both `/` and `\` so a Windows path resolves correctly even when
 * this runs on a POSIX host (e.g. CI) — node:path.basename is platform-specific.
 */
export function libraryDisplayName(root) {
  const clean = String(root || '').replace(/[/\\]+$/, '')
  const seg = clean.split(/[/\\]/).pop()
  return seg || clean || 'Library'
}

/**
 * Ensure settings carry a valid libraries[] + activeLibraryId, migrating from a
 * legacy single `libraryRoot` when needed. De-dupes by root and backfills any
 * missing id/name. Returns { libraries, activeLibraryId, changed } where
 * `changed` is true when the caller should persist the normalized shape.
 */
export function normalizeLibraries(settings = {}, defaultRoot) {
  const s = settings || {}
  let changed = false

  const seen = new Set()
  let libraries = (Array.isArray(s.libraries) ? s.libraries : [])
    .filter((l) => l && typeof l.root === 'string' && l.root.trim())
    .filter((l) => { if (seen.has(l.root)) { changed = true; return false } seen.add(l.root); return true })
    .map((l) => {
      const id = l.id || randomUUID()
      const name = (typeof l.name === 'string' && l.name.trim()) ? l.name : libraryDisplayName(l.root)
      if (id !== l.id || name !== l.name) changed = true
      return { id, name, root: l.root }
    })

  // Migrate a legacy single-root install (or seed the built-in default).
  if (libraries.length === 0) {
    const root = (typeof s.libraryRoot === 'string' && s.libraryRoot) ? s.libraryRoot : defaultRoot
    libraries = [{ id: randomUUID(), name: libraryDisplayName(root), root }]
    changed = true
  }

  let activeLibraryId = s.activeLibraryId
  if (!libraries.some((l) => l.id === activeLibraryId)) {
    const match = libraries.find((l) => l.root === s.libraryRoot)
    activeLibraryId = (match || libraries[0]).id
    changed = true
  }

  return { libraries, activeLibraryId, changed }
}

/** The currently-active library record (falls back to the first, or null). */
export function activeLibrary(state) {
  if (!state || !Array.isArray(state.libraries) || state.libraries.length === 0) return null
  return state.libraries.find((l) => l.id === state.activeLibraryId) || state.libraries[0]
}

/**
 * Add a library for `root` and make it active. If a library already points at
 * that root, no duplicate is created — it just becomes active instead.
 */
export function addLibrary(state, { root, name, id = randomUUID() } = {}) {
  if (!root || !String(root).trim()) return state
  const existing = state.libraries.find((l) => l.root === root)
  if (existing) return { libraries: state.libraries, activeLibraryId: existing.id }
  const lib = { id, name: (name && name.trim()) ? name.trim() : libraryDisplayName(root), root }
  return { libraries: [...state.libraries, lib], activeLibraryId: id }
}

/** Rename a library's friendly label (the folder on disk is never touched). */
export function renameLibrary(state, id, name) {
  const clean = String(name || '').trim()
  if (!clean) return state
  return { ...state, libraries: state.libraries.map((l) => (l.id === id ? { ...l, name: clean } : l)) }
}

/**
 * Unlink a library from ShopDeck. Files on disk are left alone. The last
 * remaining library can't be removed (there is always at least one). If the
 * active library is removed, the first survivor becomes active.
 */
export function removeLibrary(state, id) {
  if (state.libraries.length <= 1) return state
  const libraries = state.libraries.filter((l) => l.id !== id)
  if (libraries.length === state.libraries.length) return state
  const activeLibraryId = state.activeLibraryId === id ? libraries[0].id : state.activeLibraryId
  return { libraries, activeLibraryId }
}

/** Set the active library (no-op if the id isn't known). */
export function setActive(state, id) {
  if (!state.libraries.some((l) => l.id === id)) return state
  return { ...state, activeLibraryId: id }
}

/** Change the folder a specific library points at (defaults to the active one). */
export function setLibraryRoot(state, root, id = state.activeLibraryId) {
  if (!root || !String(root).trim()) return state
  return { ...state, libraries: state.libraries.map((l) => (l.id === id ? { ...l, root } : l)) }
}

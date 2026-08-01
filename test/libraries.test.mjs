// Tests for the pure-Node library-list model (electron/libraries.js). No
// Electron — runs under `node --test`. Covers legacy migration, add/rename/
// remove/switch, de-duplication, and the "always at least one library" rule.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  libraryDisplayName, normalizeLibraries, activeLibrary,
  addLibrary, renameLibrary, removeLibrary, setActive, setLibraryRoot
} from '../electron/libraries.js'

const DEFAULT_ROOT = '/home/user/Documents/ShopDeck Library'

test('libraryDisplayName uses the folder\'s last segment', () => {
  assert.equal(libraryDisplayName('/srv/share/Tooling Library'), 'Tooling Library')
  assert.equal(libraryDisplayName('C:\\\\Users\\\\me\\\\Lib\\\\'), 'Lib')
  assert.equal(libraryDisplayName(''), 'Library')
})

test('normalizeLibraries seeds a default library when settings are empty', () => {
  const st = normalizeLibraries({}, DEFAULT_ROOT)
  assert.equal(st.libraries.length, 1)
  assert.equal(st.libraries[0].root, DEFAULT_ROOT)
  assert.equal(st.libraries[0].name, 'ShopDeck Library')
  assert.equal(st.activeLibraryId, st.libraries[0].id)
  assert.ok(st.libraries[0].id, 'has a generated id')
  assert.equal(st.changed, true)
})

test('normalizeLibraries migrates a legacy single libraryRoot', () => {
  const legacy = { libraryRoot: '/srv/share/Lib', theme: 'grey' }
  const st = normalizeLibraries(legacy, DEFAULT_ROOT)
  assert.equal(st.libraries.length, 1)
  assert.equal(st.libraries[0].root, '/srv/share/Lib')
  assert.equal(st.libraries[0].name, 'Lib')
  assert.equal(activeLibrary(st).root, '/srv/share/Lib')
  assert.equal(st.changed, true)
})

test('normalizeLibraries keeps a valid multi-library shape unchanged', () => {
  const good = {
    libraries: [{ id: 'a', name: 'One', root: '/x' }, { id: 'b', name: 'Two', root: '/y' }],
    activeLibraryId: 'b'
  }
  const st = normalizeLibraries(good, DEFAULT_ROOT)
  assert.equal(st.changed, false)
  assert.equal(st.activeLibraryId, 'b')
  assert.deepEqual(st.libraries.map((l) => l.root), ['/x', '/y'])
})

test('normalizeLibraries backfills missing id/name and drops duplicate roots', () => {
  const messy = {
    libraries: [
      { root: '/x' },                       // no id, no name
      { id: 'dup', name: 'X2', root: '/x' } // duplicate root -> dropped
    ],
    activeLibraryId: 'nope'                  // unknown -> reset to first
  }
  const st = normalizeLibraries(messy, DEFAULT_ROOT)
  assert.equal(st.libraries.length, 1)
  assert.equal(st.libraries[0].root, '/x')
  assert.equal(st.libraries[0].name, 'x')
  assert.ok(st.libraries[0].id)
  assert.equal(st.activeLibraryId, st.libraries[0].id)
  assert.equal(st.changed, true)
})

test('addLibrary appends and activates; a repeat root only switches', () => {
  let st = normalizeLibraries({ libraryRoot: '/a' }, DEFAULT_ROOT)
  const firstId = st.activeLibraryId
  st = addLibrary(st, { root: '/b', name: 'Beta', id: 'idB' })
  assert.equal(st.libraries.length, 2)
  assert.equal(st.activeLibraryId, 'idB')
  assert.equal(st.libraries[1].name, 'Beta')

  // adding /a again makes no duplicate — just re-activates the existing one
  st = addLibrary(st, { root: '/a' })
  assert.equal(st.libraries.length, 2)
  assert.equal(st.activeLibraryId, firstId)
})

test('renameLibrary changes only the label, and blank names are ignored', () => {
  let st = { libraries: [{ id: 'a', name: 'Old', root: '/a' }], activeLibraryId: 'a' }
  st = renameLibrary(st, 'a', '  New Name  ')
  assert.equal(st.libraries[0].name, 'New Name')
  assert.equal(st.libraries[0].root, '/a', 'root (folder) untouched')
  st = renameLibrary(st, 'a', '   ')
  assert.equal(st.libraries[0].name, 'New Name', 'blank rename is a no-op')
})

test('removeLibrary unlinks, reassigns active, and never removes the last one', () => {
  let st = {
    libraries: [{ id: 'a', name: 'A', root: '/a' }, { id: 'b', name: 'B', root: '/b' }],
    activeLibraryId: 'a'
  }
  st = removeLibrary(st, 'a')             // removing the active one
  assert.equal(st.libraries.length, 1)
  assert.equal(st.activeLibraryId, 'b', 'active falls to a survivor')

  const before = st
  st = removeLibrary(st, 'b')             // last library can't be removed
  assert.equal(st.libraries.length, 1)
  assert.deepEqual(st, before)
})

test('setActive switches only to known ids; setLibraryRoot repoints a library', () => {
  let st = {
    libraries: [{ id: 'a', name: 'A', root: '/a' }, { id: 'b', name: 'B', root: '/b' }],
    activeLibraryId: 'a'
  }
  st = setActive(st, 'b')
  assert.equal(st.activeLibraryId, 'b')
  st = setActive(st, 'ghost')
  assert.equal(st.activeLibraryId, 'b', 'unknown id ignored')

  st = setLibraryRoot(st, '/b2')          // repoints the active library (b)
  assert.equal(activeLibrary(st).root, '/b2')
  assert.equal(st.libraries[0].root, '/a', 'other library untouched')
})

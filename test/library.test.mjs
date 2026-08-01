// Tests for the pure-Node storage layer (electron/library.js). No Electron —
// runs under `node --test`. Covers manifest parsing/validation, scanning,
// versioning + snapshots, title/tag overrides (files untouched), and import.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  parseManifest, validateManifest, scanLibrary, resolveModuleFile,
  setOverride, importFiles, importTree, createFolder,
  deleteModule, deleteFolder, backupLibrary
} from '../electron/library.js'

const baseMan = (over = {}) => ({
  schema: 1, id: 't_1', type: 't', title: 'T', version: 1,
  created: '2026-01-01', updated: '2026-01-01', tags: ['a'], fields: { n: 1 }, ...over
})

const moduleHtml = (man) =>
  `<!doctype html><html><head><title>${man.title}</title>\n` +
  `<script type="application/json" id="module-manifest">\n${JSON.stringify(man)}\n</script>\n` +
  `</head><body>content</body></html>`

const tmpRoot = () => fs.mkdtemp(join(tmpdir(), 'sd-test-'))

async function writeModule(root, relDir, name, man) {
  const dir = join(root, relDir)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(join(dir, name), moduleHtml(man), 'utf8')
  return join(dir, name)
}

test('parseManifest extracts the JSON block, returns null when absent/broken', () => {
  const m = baseMan()
  assert.deepEqual(parseManifest(moduleHtml(m)), m)
  assert.equal(parseManifest('<html><body>no manifest</body></html>'), null)
  assert.equal(parseManifest('<script id="module-manifest">{not json}</script>'), null)
})

test('validateManifest enforces required fields and formats', () => {
  assert.equal(validateManifest(baseMan()).ok, true)
  assert.equal(validateManifest({ ...baseMan(), id: undefined }).ok, false)
  assert.equal(validateManifest({ ...baseMan(), schema: 2 }).ok, false)
  assert.equal(validateManifest({ ...baseMan(), id: 'Bad ID' }).ok, false)
  assert.equal(validateManifest({ ...baseMan(), version: 0 }).ok, false)
  assert.equal(validateManifest({ ...baseMan(), version: 1.5 }).ok, false)
})

test('scanLibrary discovers modules, folders, tags, and creates .shopdeck', async () => {
  const root = await tmpRoot()
  await writeModule(root, 'Tooling/Timelines', 'a.html', baseMan({ id: 'a_1', tags: ['x', 'y'] }))
  await writeModule(root, 'Quality', 'b.html', baseMan({ id: 'b_1', tags: ['x'] }))

  const d = await scanLibrary(root)
  assert.equal(d.modules.length, 2)
  assert.deepEqual(d.folders.sort(), ['Quality', 'Tooling', 'Tooling/Timelines'])

  const a = d.modules.find((m) => m.id === 'a_1')
  assert.equal(a.folder, 'Tooling/Timelines')
  assert.deepEqual(a.tags, ['x', 'y'])
  assert.equal(a.latest, 1)
  assert.equal(a.versions.length, 1)

  // .shopdeck index + a version snapshot exist
  await fs.access(join(root, '.shopdeck', 'index.json'))
  await fs.access(join(root, '.shopdeck', 'versions', 'a_1', 'v1', 'index.html'))
})

test('scanLibrary finds a module whose dirent is a symlink (OneDrive placeholder case)', async (t) => {
  // OneDrive "Files On-Demand" placeholders are reparse points that readdir
  // reports as symlinks (isFile() === false). A symlink reproduces that exact
  // dirent classification, which used to make the whole library scan empty.
  const root = await tmpRoot()
  const ext = await fs.mkdtemp(join(tmpdir(), 'sd-ext-'))
  const real = join(ext, 'real.html')
  await fs.writeFile(real, moduleHtml(baseMan({ id: 'od_1' })), 'utf8')
  const dir = join(root, 'Sync')
  await fs.mkdir(dir, { recursive: true })
  try { await fs.symlink(real, join(dir, 'od.html')) }
  catch { t.skip('symlinks not permitted in this environment'); return }

  const d = await scanLibrary(root)
  assert.ok(d.modules.find((m) => m.id === 'od_1'), 'symlinked module is discovered')
  assert.ok(d.htmlCount >= 1)
})

test('scanLibrary infers generic modules for manifest-less HTML and reports htmlCount', async () => {
  const root = await tmpRoot()
  await fs.mkdir(join(root, 'X'), { recursive: true })
  await fs.writeFile(join(root, 'X', 'notes.html'), '<!doctype html><html><head><title>Notes</title></head><body>no manifest</body></html>', 'utf8')
  await fs.writeFile(join(root, 'X', 'plain.html'), '<html><body>bare</body></html>', 'utf8')

  const d = await scanLibrary(root)
  assert.equal(d.htmlCount, 2)
  const notes = d.modules.find((m) => m.id === 'notes')
  assert.ok(notes, 'titled manifest-less file is inferred')
  assert.equal(notes.type, 'document')
  assert.equal(notes.inferred, true)
  assert.equal(notes.title, 'Notes')
  const plain = d.modules.find((m) => m.id === 'plain')
  assert.ok(plain, 'untitled file is inferred from its filename')
  assert.equal(plain.title, 'plain')
})

test('a higher version is snapshotted and kept as history', async () => {
  const root = await tmpRoot()
  await writeModule(root, 'M', 'v1.html', baseMan({ id: 'p_1', version: 1, updated: '2026-01-01' }))
  await scanLibrary(root)

  // a newer build of the same id (dropped in as a separate file)
  await writeModule(root, 'M', 'v2.html', baseMan({ id: 'p_1', version: 2, updated: '2026-02-01' }))
  const d = await scanLibrary(root)

  const p = d.modules.find((m) => m.id === 'p_1')
  assert.equal(p.latest, 2)
  assert.deepEqual(p.versions.map((v) => v.version), [1, 2])
  await fs.access(join(root, '.shopdeck', 'versions', 'p_1', 'v2', 'index.html'))
})

test('setOverride changes title/tags without modifying the module file', async () => {
  const root = await tmpRoot()
  const file = await writeModule(root, 'M', 'a.html', baseMan({ id: 'o_1', title: 'Orig', tags: ['a'] }))
  await scanLibrary(root)

  assert.equal(await setOverride(root, 'o_1', { title: 'New Name', tags: ['x', 'y'] }), true)
  const d = await scanLibrary(root)
  const m = d.modules.find((x) => x.id === 'o_1')
  assert.equal(m.title, 'New Name')
  assert.deepEqual(m.tags, ['x', 'y'])
  assert.equal(m.edited, true)

  // the file's own manifest is untouched
  const onDisk = parseManifest(await fs.readFile(file, 'utf8'))
  assert.equal(onDisk.title, 'Orig')
  assert.deepEqual(onDisk.tags, ['a'])

  // clearing reverts to the file
  await setOverride(root, 'o_1', { title: '', tags: [] })
  const d2 = await scanLibrary(root)
  const m2 = d2.modules.find((x) => x.id === 'o_1')
  assert.equal(m2.title, 'Orig')
  assert.equal(m2.edited, false)
})

test('importFiles copies any self-contained HTML; a missing manifest is inferred on scan', async () => {
  const root = await tmpRoot()
  const src = await fs.mkdtemp(join(tmpdir(), 'sd-src-'))
  const good = join(src, 'good.html')
  const bare = join(src, 'notes.html')
  await fs.writeFile(good, moduleHtml(baseMan({ id: 'imp_1' })), 'utf8')
  await fs.writeFile(bare, '<!doctype html><html><head><title>Bare Notes</title></head><body>x</body></html>', 'utf8')

  const res = await importFiles(root, 'Imported', [good, bare])
  assert.equal(res.find((r) => r.file === 'good.html').ok, true)
  assert.equal(res.find((r) => r.file === 'notes.html').ok, true)

  const d = await scanLibrary(root)
  const m = d.modules.find((x) => x.id === 'imp_1')
  assert.ok(m, 'manifest module is listed')
  assert.equal(m.folder, 'Imported')
  assert.equal(m.inferred, false)

  const bareMod = d.modules.find((x) => x.id === 'notes')
  assert.ok(bareMod, 'manifest-less module is listed via inference')
  assert.equal(bareMod.inferred, true)
  assert.equal(bareMod.title, 'Bare Notes')
})

test('scanLibrary infers a tool-swap-timeline manifest from an embedded DATA object', async () => {
  const root = await tmpRoot()
  await fs.mkdir(join(root, 'T'), { recursive: true })
  const DATA = {
    part: '40-1318-01',
    lanes: [{ lane: 0, group: '1 · Preform', tool: 'A1', desc: 'TOP' }, { lane: 1, group: '4 · Pierce / Strip', tool: 'A2', desc: 'PP' }],
    events: [{ lane: 0, tool: 'A1', removed: '2020-01-01', install: '2019-06-01' }, { lane: 1, tool: 'A2', removed: '2021-03-03', install: null }]
  }
  const html = `<!doctype html><html><head><title>Tool Swap Timeline — 40-1318-01</title></head><body>\n<script>\nconst DATA = ${JSON.stringify(DATA)};\ndocument.title = 't';\n</script></body></html>`
  await fs.writeFile(join(root, 'T', 'tool-swap-timeline_40-1318-01.html'), html, 'utf8')

  const d = await scanLibrary(root)
  const m = d.modules.find((x) => x.id === 'tool-swap-timeline_40-1318-01')
  assert.ok(m, 'inferred timeline is listed')
  assert.equal(m.type, 'tool-swap-timeline')
  assert.equal(m.inferred, true)
  assert.equal(m.fields.part, '40-1318-01')
  assert.equal(m.fields.events, 2)
  assert.deepEqual(m.tags, ['preform', 'pierce-strip'])
  assert.equal(m.fields.dateRange.from, '2019-06-01')
  assert.equal(m.fields.dateRange.to, '2021-03-03')
})

test('importTree copies a folder preserving its subfolder structure', async () => {
  const root = await tmpRoot()
  const src = await fs.mkdtemp(join(tmpdir(), 'sd-tree-'))
  await fs.mkdir(join(src, 'A', 'B'), { recursive: true })
  await fs.writeFile(join(src, 'A', 'x.html'), moduleHtml(baseMan({ id: 'tx_1' })), 'utf8')
  await fs.writeFile(join(src, 'A', 'B', 'y.html'), moduleHtml(baseMan({ id: 'ty_1' })), 'utf8')
  await fs.writeFile(join(src, 'A', 'note.txt'), 'ignore me', 'utf8')

  const res = await importTree(root, 'Attached', src)
  assert.equal(res.filter((r) => r.ok).length, 2)

  const d = await scanLibrary(root)
  assert.equal(d.modules.find((m) => m.id === 'tx_1').folder, 'Attached/A')
  assert.equal(d.modules.find((m) => m.id === 'ty_1').folder, 'Attached/A/B')
})

test('resolveModuleFile returns the live file for latest, a snapshot for older', async () => {
  const root = await tmpRoot()
  await writeModule(root, 'M', 'v1.html', baseMan({ id: 'r_1', version: 1 }))
  await scanLibrary(root)
  await writeModule(root, 'M', 'v2.html', baseMan({ id: 'r_1', version: 2 }))
  await scanLibrary(root)

  const latest = await resolveModuleFile(root, 'r_1')
  assert.equal(latest.version, 2)
  assert.ok(latest.indexPath.endsWith(join('M', 'v2.html')) || latest.indexPath.includes('v2.html'))

  const old = await resolveModuleFile(root, 'r_1', 1)
  assert.equal(old.version, 1)
  assert.ok(old.indexPath.includes(join('.shopdeck', 'versions', 'r_1', 'v1')))
})

test('deleteModule removes the file, its snapshots, and its index entry', async () => {
  const root = await tmpRoot()
  const file = await writeModule(root, 'M', 'a.html', baseMan({ id: 'del_1' }))
  await scanLibrary(root)
  await fs.access(join(root, '.shopdeck', 'versions', 'del_1', 'v1', 'index.html'))

  await deleteModule(root, 'del_1')
  await assert.rejects(fs.access(file), 'module file is gone')
  await assert.rejects(fs.access(join(root, '.shopdeck', 'versions', 'del_1')), 'snapshots gone')
  const d = await scanLibrary(root)
  assert.equal(d.modules.find((m) => m.id === 'del_1'), undefined)
})

test('deleteFolder removes a folder and its modules; root .shopdeck is protected', async () => {
  const root = await tmpRoot()
  await writeModule(root, 'Junk', 'a.html', baseMan({ id: 'jf_1' }))
  await scanLibrary(root)
  await deleteFolder(root, 'Junk')
  await assert.rejects(fs.access(join(root, 'Junk')))
  assert.equal(await deleteFolder(root, '.shopdeck'), false)
  await fs.access(join(root, '.shopdeck')) // still there
})

test('backupLibrary copies the whole root into a new folder', async () => {
  const root = await tmpRoot()
  await writeModule(root, 'M', 'a.html', baseMan({ id: 'bk_1' }))
  await scanLibrary(root)
  const destParent = await fs.mkdtemp(join(tmpdir(), 'sd-bak-'))
  const dest = await backupLibrary(root, destParent, '2026-07-31')
  await fs.access(join(dest, 'M', 'a.html'))
  await fs.access(join(dest, '.shopdeck', 'index.json'))
})

test('createFolder makes a nested folder under the root and blocks traversal', async () => {
  const root = await tmpRoot()
  assert.equal(await createFolder(root, 'A/B/C'), true)
  await fs.access(join(root, 'A', 'B', 'C'))
  // path traversal is stripped, not honored
  await createFolder(root, '../escape')
  await assert.rejects(fs.access(join(root, '..', 'escape')))
})

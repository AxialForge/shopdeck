// Tests for opt-in content search (#2) and shared-drive write safety (#3) in
// electron/library.js. Pure-Node, runs under `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scanLibrary, searchContent, setOverride, extractText } from '../electron/library.js'

const man = (over = {}) => ({
  schema: 1, id: 'm_1', type: 't', title: 'Widget', version: 1,
  created: '2026-01-01', updated: '2026-01-01', tags: ['x'], ...over
})
const moduleHtml = (m, body = '') =>
  `<!doctype html><html><head><title>${m.title}</title>` +
  `<style>.z{color:red}</style>` +
  `<script type="application/json" id="module-manifest">${JSON.stringify(m)}</script>` +
  `</head><body>${body}</body></html>`

const tmpRoot = () => fs.mkdtemp(join(tmpdir(), 'sd-ss-'))
async function write(root, name, m, body) {
  await fs.writeFile(join(root, name), moduleHtml(m, body), 'utf8')
}

test('extractText lowercases, drops <style>, keeps script + body text', () => {
  const t = extractText('<style>.z{color:RED}</style><script>const s="SERIAL-42"</script><body>Hello WORLD</body>')
  assert.ok(!t.includes('color'))          // style dropped
  assert.ok(t.includes('serial-42'))       // script text kept, lowercased
  assert.ok(t.includes('hello world'))     // body kept
})

test('content search finds a term inside a module, only when indexed', async () => {
  const root = await tmpRoot()
  await write(root, 'a.html', man({ id: 'm_a', title: 'Alpha' }), 'the serial is ZX-9987 today')
  await write(root, 'b.html', man({ id: 'm_b', title: 'Beta' }), 'nothing special here')

  // Without an index built, search returns nothing.
  assert.deepEqual(await searchContent(root, 'zx-9987'), [])

  // Scan with content indexing on, then the term resolves to its module.
  await scanLibrary(root, { indexContent: true })
  assert.deepEqual(await searchContent(root, 'ZX-9987'), ['m_a'])   // case-insensitive
  assert.deepEqual(await searchContent(root, 'special'), ['m_b'])
  assert.deepEqual(await searchContent(root, 'not-present'), [])
  assert.deepEqual(await searchContent(root, ''), [])               // empty query → []
})

test('content index is not written when indexing is off', async () => {
  const root = await tmpRoot()
  await write(root, 'a.html', man(), 'body text')
  await scanLibrary(root)                                            // default: indexContent off
  await assert.rejects(fs.access(join(root, '.shopdeck', 'content-index.json')))
})

test('shared setOverride survives a concurrent scan (no lost edit)', async () => {
  const root = await tmpRoot()
  await write(root, 'a.html', man({ id: 'm_a', title: 'Original' }), 'x')
  await scanLibrary(root, { sharedWrites: true })

  // Edit the title (shared-safe), then a scan runs afterward.
  await setOverride(root, 'm_a', { title: 'Renamed' }, { sharedWrites: true })
  const res = await scanLibrary(root, { sharedWrites: true })

  const mod = res.modules.find((m) => m.id === 'm_a')
  assert.equal(mod.title, 'Renamed')                                // scan preserved the override
  const idx = JSON.parse(await fs.readFile(join(root, '.shopdeck', 'index.json'), 'utf8'))
  assert.equal(idx.modules.m_a.overrides.title, 'Renamed')
})

test('index writes are atomic (no leftover temp files, valid JSON)', async () => {
  const root = await tmpRoot()
  await write(root, 'a.html', man(), 'x')
  await scanLibrary(root, { sharedWrites: true })
  await setOverride(root, 'm_1', { tags: ['edited'] }, { sharedWrites: true })
  const hidden = await fs.readdir(join(root, '.shopdeck'))
  assert.ok(!hidden.some((f) => f.includes('.tmp-')))               // temp renamed away
  assert.ok(!hidden.includes('index.lock'))                         // lock released
  JSON.parse(await fs.readFile(join(root, '.shopdeck', 'index.json'), 'utf8')) // parses
})

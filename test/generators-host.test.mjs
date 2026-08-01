// Tests for the generator plug-in host (pure-Node, no Electron): manifest
// parsing, folder scanning, filename/folder sanitization, and writing emitted
// modules into a library without escaping it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'
import { parseGenerator, scanGenerators, safeFilename, safeFolder, writeOutputs } from '../electron/generators-host.js'

const MANIFEST = `<script type="application/json" id="generator-manifest">
{ "schema":1, "id":"timeline", "name":"Timeline", "description":"d", "version":2, "accepts":["xlsx",".XLS"], "folder":"Tooling/Timelines" }
</script>`

async function tmp() { return fs.mkdtemp(join(os.tmpdir(), 'shopdeck-gen-')) }

test('parseGenerator reads the manifest and normalizes accepts', () => {
  const g = parseGenerator(`<title>x</title>${MANIFEST}`, 'my-tool.html')
  assert.equal(g.id, 'timeline')
  assert.equal(g.name, 'Timeline')
  assert.equal(g.version, 2)
  assert.deepEqual(g.accepts, ['.xlsx', '.xls'])   // lowercased, dot-prefixed
  assert.equal(g.folder, 'Tooling/Timelines')
  assert.equal(g.inferred, false)
})

test('parseGenerator infers name from title/filename when no manifest', () => {
  const g = parseGenerator('<title>My Nice Tool</title>', 'weird_File.generator.html')
  assert.equal(g.inferred, true)
  assert.equal(g.name, 'My Nice Tool')
  assert.equal(g.id, 'weird-file')                 // from filename stem, slugged
  assert.deepEqual(g.accepts, [])
})

test('scanGenerators lists .html tools, de-dupes by id, ignores others', async () => {
  const dir = await tmp()
  await fs.writeFile(join(dir, 'a.html'), MANIFEST)
  await fs.writeFile(join(dir, 'b.html'), MANIFEST)       // same id → deduped
  await fs.writeFile(join(dir, 'notes.txt'), 'nope')
  const gens = await scanGenerators(dir)
  assert.equal(gens.length, 1)
  assert.equal(gens[0].id, 'timeline')
  assert.ok(gens[0].path.endsWith('a.html'))
})

test('scanGenerators returns [] for a missing folder', async () => {
  assert.deepEqual(await scanGenerators(join(os.tmpdir(), 'shopdeck-does-not-exist-xyz')), [])
})

test('safeFilename / safeFolder block path escapes', () => {
  assert.equal(safeFilename('../../evil'), 'evil.html')
  assert.equal(safeFilename('a b/c.html'), 'c.html')
  assert.equal(safeFilename(''), 'module.html')
  assert.equal(safeFolder('../../etc'), 'etc')
  assert.equal(safeFolder('C:/Windows/x'), 'Windows/x')
  assert.equal(safeFolder('a\\b\\..\\c'), 'a/b/c')
})

test('writeOutputs writes modules into the library and reports results', async () => {
  const root = await tmp()
  const results = await writeOutputs(root, 'Generated', [
    { filename: 'one', html: '<html>1</html>' },
    { filename: 'two', html: '<html>2</html>', folder: 'Custom/Sub' },
    { filename: 'bad', html: '' }                          // empty → error
  ])
  assert.equal(results[0].ok, true)
  assert.equal(results[0].folder, 'Generated')
  assert.equal(results[1].folder, 'Custom/Sub')
  assert.equal(results[2].ok, false)
  assert.equal(await fs.readFile(join(root, 'Generated', 'one.html'), 'utf8'), '<html>1</html>')
  assert.equal(await fs.readFile(join(root, 'Custom', 'Sub', 'two.html'), 'utf8'), '<html>2</html>')
})

test('writeOutputs never escapes the library root', async () => {
  const root = await tmp()
  await writeOutputs(root, '../../escape', [{ filename: '../../pwned', html: '<html>x</html>' }])
  // Landed under root/escape/pwned.html — not outside root.
  assert.equal(await fs.readFile(join(root, 'escape', 'pwned.html'), 'utf8'), '<html>x</html>')
})

test('writeOutputs makes filenames unique instead of overwriting', async () => {
  const root = await tmp()
  await writeOutputs(root, 'F', [{ filename: 'dup', html: '<html>a</html>' }])
  await writeOutputs(root, 'F', [{ filename: 'dup', html: '<html>b</html>' }])
  const names = (await fs.readdir(join(root, 'F'))).sort()
  assert.deepEqual(names, ['dup-2.html', 'dup.html'])
})

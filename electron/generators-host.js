// Pure-Node host for the generator plug-in system (no Electron import, so it's
// unit-testable). A "generator" is a self-contained HTML tool that lives in the
// user's generators folder — NOT bundled with the app. ShopDeck scans that
// folder, lists each tool, opens it in its own window, and writes whatever
// modules the tool emits into the active library. The app ships the framework
// and a blank template; the tools themselves are the user's own files.
import { promises as fs } from 'node:fs'
import { join, basename, extname } from 'node:path'

// A generator declares itself with an inert JSON block, mirroring the module
// manifest. Everything except id/name is optional.
//   <script type="application/json" id="generator-manifest">
//   { "schema": 1, "id": "…", "name": "…", "description": "…",
//     "version": 1, "accepts": [".xlsx"], "folder": "Tooling/Timelines" }
//   </script>
const MANIFEST_RE = /<script[^>]*id=["']generator-manifest["'][^>]*>([\s\S]*?)<\/script>/i
const TITLE_RE = /<title>([\s\S]*?)<\/title>/i

const slug = (s) => String(s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

/** Parse a generator's manifest from its HTML, inferring a name when absent. */
export function parseGenerator(html, file) {
  const stem = basename(file).replace(/\.generator\.html$|\.html?$/i, '')
  let man = null
  const m = html.match(MANIFEST_RE)
  if (m) { try { man = JSON.parse(m[1].trim()) } catch { man = null } }
  const inferred = !man
  man = man || {}
  const title = (html.match(TITLE_RE) || [])[1]
  const accepts = Array.isArray(man.accepts)
    ? man.accepts.map((e) => String(e).toLowerCase().replace(/^\.?/, '.')).filter((e) => e.length > 1)
    : []
  return {
    id: man.id || slug(stem) || 'generator',
    name: man.name || (title && title.trim()) || stem,
    description: man.description || '',
    version: Number(man.version) || 1,
    accepts,                                   // e.g. ['.xlsx', '.csv'] ('' = any)
    folder: typeof man.folder === 'string' ? man.folder : '',
    file: basename(file),
    inferred
  }
}

/** Scan a folder (flat) for `*.html` generator tools. Missing folder → []. */
export async function scanGenerators(dir) {
  let names = []
  try { names = await fs.readdir(dir) }
  catch { return [] }
  const out = []
  for (const name of names.sort((a, b) => a.localeCompare(b))) {
    if (!/\.html?$/i.test(name)) continue
    let html
    try { html = await fs.readFile(join(dir, name), 'utf8') } catch { continue }
    const g = parseGenerator(html, name)
    out.push({ ...g, path: join(dir, name) })
  }
  // De-dupe by id, first (alphabetical) wins.
  const seen = new Set()
  return out.filter((g) => (seen.has(g.id) ? false : seen.add(g.id)))
}

// Keep an emitted filename safe: strip any path, allow only tame characters,
// and force a single `.html` extension. Never lets a tool escape the folder.
export function safeFilename(name, fallback = 'module') {
  let base = basename(String(name || '')).replace(/\.html?$/i, '')
  base = base.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '')
  return (base || fallback) + '.html'
}

// A relative folder path a tool asks to write into, kept inside the library:
// no drive letters, no `..`, back-slashes normalized to forward.
export function safeFolder(rel) {
  const parts = String(rel || '').replace(/\\/g, '/').split('/')
    .map((p) => p.trim())
    .filter((p) => p && p !== '.' && p !== '..' && !/^[A-Za-z]:$/.test(p))
    .map((p) => p.replace(/[<>:"|?*]+/g, '-'))
  return parts.join('/')
}

async function uniquePath(dir, file) {
  const stem = file.replace(/\.html$/i, '')
  let candidate = file
  for (let n = 2; ; n++) {
    try { await fs.access(join(dir, candidate)) } catch { return join(dir, candidate) }
    candidate = `${stem}-${n}.html`
  }
}

/**
 * Write the modules a generator emitted into the active library.
 *   libraryRoot   absolute path to the active library
 *   defaultFolder folder to use when neither the emit call nor the tool sets one
 *   modules       [{ filename, html, folder?, source?: { name, bytes } }]
 * Returns [{ ok, file, folder, error? }] — one entry per module.
 */
export async function writeOutputs(libraryRoot, defaultFolder, modules) {
  const results = []
  for (const mod of Array.isArray(modules) ? modules : []) {
    try {
      if (typeof mod?.html !== 'string' || !mod.html.trim()) throw new Error('empty module HTML')
      const rel = safeFolder(mod.folder || defaultFolder || 'Generated')
      const dir = rel ? join(libraryRoot, rel) : libraryRoot
      await fs.mkdir(dir, { recursive: true })
      const target = await uniquePath(dir, safeFilename(mod.filename))
      await fs.writeFile(target, mod.html, 'utf8')
      if (mod.source && mod.source.bytes) {
        try {
          const srcName = safeFilename(mod.source.name || basename(target)).replace(/\.html$/i, extname(mod.source.name || '') || '.bin')
          await fs.writeFile(join(dir, basename(target).replace(/\.html$/i, '') + (extname(srcName) || '.bin')), Buffer.from(mod.source.bytes))
        } catch { /* source is optional; never fail the module for it */ }
      }
      results.push({ ok: true, file: basename(target), folder: rel })
    } catch (err) {
      results.push({ ok: false, file: mod?.filename || '(unknown)', error: String(err?.message || err) })
    }
  }
  return results
}

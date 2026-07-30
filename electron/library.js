// Pure-Node storage layer for ShopDeck. No Electron imports — so both the
// Electron main process and the standalone seed script can use it.
//
// On-disk layout (see MODULE-SPEC.md in the timelines project):
//   <libDir>/<id>/meta.json
//   <libDir>/<id>/v1/index.html   (+ source.<ext> if a source was attached)
//   <libDir>/<id>/v2/index.html
//
// A "module" is one self-contained HTML file carrying an inert
// <script type="application/json" id="module-manifest"> block.

import { promises as fs } from 'node:fs'
import { basename, extname, join } from 'node:path'

const MANIFEST_RE =
  /<script[^>]*id=["']module-manifest["'][^>]*>([\s\S]*?)<\/script>/i

/** Extract and parse the manifest block from module HTML. Returns null if absent/invalid. */
export function parseManifest(html) {
  const m = html.match(MANIFEST_RE)
  if (!m) return null
  try {
    return JSON.parse(m[1].trim())
  } catch {
    return null
  }
}

const REQUIRED = ['schema', 'id', 'type', 'title', 'version', 'created', 'updated']

/** Validate a manifest against schema v1. Returns { ok, errors[] }. */
export function validateManifest(man) {
  const errors = []
  if (!man || typeof man !== 'object') return { ok: false, errors: ['no manifest object'] }
  for (const k of REQUIRED) if (man[k] === undefined) errors.push(`missing required field: ${k}`)
  if (man.schema !== undefined && man.schema !== 1) errors.push(`unsupported schema: ${man.schema}`)
  if (man.id !== undefined && !/^[a-z0-9][a-z0-9._-]*$/.test(String(man.id)))
    errors.push(`invalid id: ${man.id}`)
  if (man.version !== undefined && !(Number.isInteger(man.version) && man.version >= 1))
    errors.push(`version must be an integer >= 1`)
  return { ok: errors.length === 0, errors }
}

async function exists(p) {
  try { await fs.access(p); return true } catch { return false }
}

async function readMeta(libDir, id) {
  try {
    return JSON.parse(await fs.readFile(join(libDir, id, 'meta.json'), 'utf8'))
  } catch {
    return null
  }
}

/**
 * Import one module into the library, handling versioning by manifest id+version.
 * @returns { entry, action: 'created' | 'new-version' | 'replaced' }
 */
export async function importModule({ htmlPath, sourcePath = null, libDir }) {
  const html = await fs.readFile(htmlPath, 'utf8')
  const manifest = parseManifest(html)
  const v = validateManifest(manifest)
  if (!v.ok) throw new Error(`Invalid module manifest: ${v.errors.join('; ')}`)

  const { id, version } = manifest
  const idDir = join(libDir, id)
  const verDir = join(idDir, `v${version}`)
  const priorMeta = await readMeta(libDir, id)
  const replacing = await exists(verDir)

  await fs.mkdir(verDir, { recursive: true })
  await fs.writeFile(join(verDir, 'index.html'), html, 'utf8')

  let sourceFile = null
  if (sourcePath && (await exists(sourcePath))) {
    sourceFile = `source${extname(sourcePath) || '.dat'}`
    await fs.copyFile(sourcePath, join(verDir, sourceFile))
  }

  const versions = (priorMeta?.versions || []).filter((x) => x.version !== version)
  versions.push({
    version,
    created: manifest.created,
    updated: manifest.updated,
    dir: `v${version}`,
    source: sourceFile,
    origin: basename(htmlPath)
  })
  versions.sort((a, b) => a.version - b.version)

  const latest = versions[versions.length - 1].version
  const meta = {
    id,
    type: manifest.type,
    title: manifest.title,
    category: manifest.category || 'Uncategorized',
    latest,
    versions,
    manifest: version >= latest ? manifest : priorMeta?.manifest || manifest
  }
  await fs.writeFile(join(idDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8')

  const action = replacing ? 'replaced' : priorMeta ? 'new-version' : 'created'
  return { entry: toEntry(libDir, meta), action }
}

function toEntry(libDir, meta) {
  const latestVer = meta.versions.find((x) => x.version === meta.latest) || meta.versions.at(-1)
  const man = meta.manifest || {}
  return {
    id: meta.id,
    type: meta.type,
    title: meta.title,
    category: meta.category,
    description: man.description || '',
    tags: man.tags || [],
    fields: man.fields || {},
    latest: meta.latest,
    versions: meta.versions,
    hasSource: !!latestVer?.source,
    indexPath: join(libDir, meta.id, latestVer.dir, 'index.html'),
    sourcePath: latestVer?.source ? join(libDir, meta.id, latestVer.dir, latestVer.source) : null
  }
}

/** List every module in the library as UI-ready entries, newest-updated first. */
export async function listCatalog(libDir) {
  await fs.mkdir(libDir, { recursive: true })
  const ids = await fs.readdir(libDir, { withFileTypes: true })
  const out = []
  for (const d of ids) {
    if (!d.isDirectory()) continue
    const meta = await readMeta(libDir, d.name)
    if (meta) out.push(toEntry(libDir, meta))
  }
  out.sort((a, b) => {
    const au = a.versions.at(-1)?.updated || '', bu = b.versions.at(-1)?.updated || ''
    return bu.localeCompare(au) || a.title.localeCompare(b.title)
  })
  return out
}

/** Resolve the on-disk index.html for a specific module version (defaults to latest). */
export async function getModulePath(libDir, id, version) {
  const meta = await readMeta(libDir, id)
  if (!meta) return null
  const ver = version ? meta.versions.find((x) => x.version === version) : meta.versions.find((x) => x.version === meta.latest)
  if (!ver) return null
  return {
    indexPath: join(libDir, id, ver.dir, 'index.html'),
    sourcePath: ver.source ? join(libDir, id, ver.dir, ver.source) : null,
    title: meta.title,
    version: ver.version
  }
}

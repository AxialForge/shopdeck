// Pure-Node storage layer for ShopDeck. No Electron imports — shared by the
// Electron main process and the seed script.
//
// MODEL: the selected library ROOT folder's own nested structure IS the
// organization. Modules are the .html files sitting in those folders. A hidden
// <root>/.shopdeck/ folder holds everything the app adds on top:
//   .shopdeck/index.json         — per-module version list + title/tag overrides
//   .shopdeck/versions/<id>/vN/  — archived snapshots so history survives edits
// Module .html files themselves are never modified.

import { promises as fs } from 'node:fs'
import { join, relative, dirname, basename, extname, sep } from 'node:path'
import { createHash } from 'node:crypto'

const HIDDEN = '.shopdeck'
const MANIFEST_RE = /<script[^>]*id=["']module-manifest["'][^>]*>([\s\S]*?)<\/script>/i
const SOURCE_EXTS = ['.xlsx', '.xls', '.csv']

export function parseManifest(html) {
  const m = html.match(MANIFEST_RE)
  if (!m) return null
  try { return JSON.parse(m[1].trim()) } catch { return null }
}

const REQUIRED = ['schema', 'id', 'type', 'title', 'version', 'created', 'updated']
export function validateManifest(man) {
  const errors = []
  if (!man || typeof man !== 'object') return { ok: false, errors: ['no manifest object'] }
  for (const k of REQUIRED) if (man[k] === undefined) errors.push(`missing required field: ${k}`)
  if (man.schema !== undefined && man.schema !== 1) errors.push(`unsupported schema: ${man.schema}`)
  if (man.id !== undefined && !/^[a-z0-9][a-z0-9._-]*$/.test(String(man.id))) errors.push(`invalid id: ${man.id}`)
  if (man.version !== undefined && !(Number.isInteger(man.version) && man.version >= 1)) errors.push('version must be an integer >= 1')
  return { ok: errors.length === 0, errors }
}

const toPosix = (p) => p.split(sep).join('/')
const hashOf = (buf) => createHash('sha1').update(buf).digest('hex').slice(0, 16)
const today = () => new Date().toISOString().slice(0, 10)

async function exists(p) { try { await fs.access(p); return true } catch { return false } }

async function siblingSource(htmlAbs) {
  const dir = dirname(htmlAbs)
  const base = basename(htmlAbs, extname(htmlAbs))
  for (const ext of SOURCE_EXTS) {
    const cand = join(dir, base + ext)
    if (await exists(cand)) return cand
  }
  return null
}

async function loadIndex(root) {
  try { return JSON.parse(await fs.readFile(join(root, HIDDEN, 'index.json'), 'utf8')) }
  catch { return { version: 1, modules: {} } }
}
async function saveIndex(root, idx) {
  await fs.mkdir(join(root, HIDDEN), { recursive: true })
  await fs.writeFile(join(root, HIDDEN, 'index.json'), JSON.stringify(idx, null, 2), 'utf8')
}

// Recursively collect .html files and all sub-folders, skipping the hidden dir.
async function walk(root) {
  const htmls = []
  const folders = []
  async function rec(dir) {
    let entries
    try { entries = await fs.readdir(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (e.name === HIDDEN) continue
      const full = join(dir, e.name)
      if (e.isDirectory()) { folders.push(toPosix(relative(root, full))); await rec(full) }
      else if (e.isFile() && /\.html?$/i.test(e.name)) htmls.push(full)
    }
  }
  await rec(root)
  return { htmls, folders: folders.sort() }
}

/**
 * Scan the library root into UI-ready data. Snapshots any not-yet-archived
 * module version so history survives (whether the update happened in-app or by
 * someone dropping a newer file on the shared drive). Applies title/tag overrides.
 */
export async function scanLibrary(root) {
  await fs.mkdir(join(root, HIDDEN), { recursive: true })
  const idx = await loadIndex(root)
  idx.modules ||= {}

  const { htmls, folders } = await walk(root)
  const modules = []

  for (const file of htmls) {
    let html
    try { html = await fs.readFile(file, 'utf8') } catch { continue }
    const man = parseManifest(html)
    if (!man || !validateManifest(man).ok) continue

    const id = man.id
    const relFile = toPosix(relative(root, file))
    const relFolder = dirname(relFile) === '.' ? '' : dirname(relFile)
    const srcAbs = await siblingSource(file)

    const rec = (idx.modules[id] ||= { overrides: {}, versions: [] })
    if (!rec.versions.some((v) => v.version === man.version)) {
      const vdir = join(root, HIDDEN, 'versions', id, `v${man.version}`)
      await fs.mkdir(vdir, { recursive: true })
      await fs.copyFile(file, join(vdir, 'index.html'))
      let source = null
      if (srcAbs) { source = 'source' + (extname(srcAbs) || '.dat'); await fs.copyFile(srcAbs, join(vdir, source)) }
      rec.versions.push({ version: man.version, created: man.created, updated: man.updated, hash: hashOf(html), dir: `v${man.version}`, source, archivedAt: new Date().toISOString() })
      rec.versions.sort((a, b) => a.version - b.version)
    }
    // Point lastPath at the highest-version file, so a leftover older file with
    // the same id can't become the "live" file.
    if (rec.lastVersion === undefined || man.version >= rec.lastVersion) {
      rec.lastPath = relFile
      rec.lastVersion = man.version
    }

    const latest = Math.max(...rec.versions.map((v) => v.version))
    modules.push({
      id,
      type: man.type,
      title: rec.overrides.title || man.title,
      tags: rec.overrides.tags || man.tags || [],
      manifestTitle: man.title,
      manifestTags: man.tags || [],
      description: rec.overrides.description || man.description || '',
      category: man.category || '',
      fields: man.fields || {},
      folder: relFolder,
      file: relFile,
      hasSource: !!srcAbs,
      latest,
      currentVersion: man.version,
      versions: rec.versions.map((v) => ({ version: v.version, updated: v.updated, created: v.created, source: v.source })),
      edited: !!(rec.overrides.title || rec.overrides.tags)
    })
  }

  await saveIndex(root, idx)

  // Finalize with the full version picture and dedupe by id (highest-version
  // file wins), so duplicate files sharing an id can't produce two cards.
  const byId = new Map()
  for (const m of modules) {
    const versions = idx.modules[m.id].versions.map((v) => ({ version: v.version, updated: v.updated, created: v.created, source: v.source }))
    const finalized = { ...m, versions, latest: Math.max(...versions.map((v) => v.version)) }
    const prev = byId.get(m.id)
    if (!prev || finalized.currentVersion > prev.currentVersion) byId.set(m.id, finalized)
  }
  return { root, folders, modules: [...byId.values()] }
}

/** Resolve the on-disk index.html for opening (latest = the live file; older = an archived snapshot). */
export async function resolveModuleFile(root, id, version) {
  const idx = await loadIndex(root)
  const rec = idx.modules?.[id]
  if (!rec?.versions?.length) return null
  const latest = Math.max(...rec.versions.map((v) => v.version))
  if (version && version < latest) {
    const ver = rec.versions.find((v) => v.version === version)
    if (!ver) return null
    const dir = join(root, HIDDEN, 'versions', id, ver.dir)
    return { indexPath: join(dir, 'index.html'), sourcePath: ver.source ? join(dir, ver.source) : null, version }
  }
  const live = join(root, rec.lastPath)
  return { indexPath: live, sourcePath: await siblingSource(live), version: latest }
}

/** Version list for a module id (for the viewer toolbar). */
export async function moduleVersions(root, id) {
  const idx = await loadIndex(root)
  const rec = idx.modules?.[id]
  if (!rec?.versions?.length) return null
  const versions = rec.versions.map((v) => ({ version: v.version, updated: v.updated, source: v.source }))
  return { versions, latest: Math.max(...versions.map((v) => v.version)) }
}

/** Persist app-side title/tag overrides (module files are never touched). */
export async function setOverride(root, id, patch) {
  const idx = await loadIndex(root)
  const rec = idx.modules?.[id]
  if (!rec) return false
  rec.overrides = { ...rec.overrides, ...patch }
  for (const k of Object.keys(rec.overrides)) {
    const v = rec.overrides[k]
    if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) delete rec.overrides[k]
  }
  await saveIndex(root, idx)
  return true
}

/** Copy module HTML (+ sibling source) into a folder under the root. */
export async function importFiles(root, destRel, filePaths) {
  const destDir = join(root, destRel || '')
  await fs.mkdir(destDir, { recursive: true })
  const done = []
  for (const f of filePaths) {
    let html
    try { html = await fs.readFile(f, 'utf8') } catch { done.push({ ok: false, file: basename(f), error: 'unreadable' }); continue }
    const man = parseManifest(html)
    if (!man || !validateManifest(man).ok) { done.push({ ok: false, file: basename(f), error: 'invalid or missing manifest' }); continue }
    await fs.copyFile(f, join(destDir, basename(f)))
    const src = await siblingSource(f)
    if (src) await fs.copyFile(src, join(destDir, basename(src)))
    done.push({ ok: true, file: basename(f), id: man.id })
  }
  return done
}

export async function createFolder(root, relPath) {
  const clean = String(relPath || '').replace(/[.]{2,}/g, '').replace(/^[/\\]+/, '')
  if (!clean) return false
  await fs.mkdir(join(root, clean), { recursive: true })
  return true
}

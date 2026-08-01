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

// Classify a directory entry. OneDrive "Files On-Demand" placeholders are reparse
// points, and fs.readdir(withFileTypes) reports them as symlinks — dirent.isFile()
// AND isDirectory() are both false — so a naive isFile() check skips every module
// in a synced folder and the library looks empty even though the files are really
// there (this bit users whose library lived under OneDrive). Trust the dirent when
// it's decisive; otherwise stat to resolve the real type. stat reads metadata only
// — it does NOT download an online-only file.
async function entryKind(full, dirent) {
  if (dirent.isDirectory()) return 'dir'
  if (dirent.isFile()) return 'file'
  try { return (await fs.stat(full)).isDirectory() ? 'dir' : 'file' }
  catch { return 'skip' }
}

// Recursively collect .html files and all sub-folders, skipping the hidden dir.
// A realpath-keyed `seen` set guards against symlink/junction cycles now that we
// follow reparse entries.
async function walk(root) {
  const htmls = []
  const folders = []
  const seen = new Set()
  async function rec(dir) {
    let key
    try { key = await fs.realpath(dir) } catch { key = dir }
    if (seen.has(key)) return
    seen.add(key)
    let entries
    try { entries = await fs.readdir(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (e.name === HIDDEN) continue
      const full = join(dir, e.name)
      const kind = await entryKind(full, e)
      if (kind === 'dir') { folders.push(toPosix(relative(root, full))); await rec(full) }
      else if (kind === 'file' && /\.html?$/i.test(e.name)) htmls.push(full)
    }
  }
  await rec(root)
  return { htmls, folders: folders.sort() }
}

// ---- Manifest inference (for HTML files WITHOUT an embedded module-manifest) -
// ShopDeck prefers the embedded module-manifest block, but not every self-contained
// HTML has one (e.g. timelines exported by the standalone tool). These helpers
// synthesise a manifest from what's in the file so such files still list and open,
// side by side with generated modules.

const decodeEntities = (s) => String(s)
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&mdash;/g, '—').replace(/&nbsp;/g, ' ')

// A manifest id from a filename base: lowercase, only [a-z0-9._-], starting with an
// alphanumeric — matches validateManifest's id rule.
const slugId = (s) => String(s || '').trim().toLowerCase()
  .replace(/[^a-z0-9._-]+/g, '-').replace(/^[^a-z0-9]+/, '').replace(/-+$/g, '')

// Pull the timeline's embedded `const DATA = {…};` object if present. DATA is JSON,
// so the first `};` after it is its end (JSON literals carry no semicolons).
function timelineDataOf(html) {
  const m = html.match(/const\s+DATA\s*=\s*(\{[\s\S]*?\})\s*;/)
  if (!m) return null
  let d
  try { d = JSON.parse(m[1]) } catch { return null }
  if (!d || !Array.isArray(d.events)) return null
  const dates = []
  for (const e of d.events) { if (e && e.removed) dates.push(e.removed); if (e && e.install) dates.push(e.install) }
  dates.sort()
  const groups = [...new Set((d.lanes || []).map((l) => String((l && l.group) || '').replace(/^\s*\d+\s*·\s*/, '').trim()).filter(Boolean))]
  const tags = groups.map((g) => g.toLowerCase().replace(/\s*\/\s*/g, '-').replace(/\s+/g, '-'))
  return { part: d.part || null, events: d.events.length, dmin: d.dmin || dates[0] || null, dmax: d.dmax || dates[dates.length - 1] || null, tags }
}

/** Build a best-effort manifest for an HTML file that carries no (valid) manifest. */
function inferManifest(html, absFile, mtime) {
  const base = basename(absFile, extname(absFile))
  const titleTag = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]
  const title = decodeEntities((titleTag || base).trim()).trim() || base
  let id = slugId(base)
  if (!id && !title) return null
  if (!id) id = 'module'
  const day = (mtime instanceof Date && !isNaN(mtime.valueOf())) ? mtime.toISOString().slice(0, 10) : today()

  const man = { schema: 1, id, type: 'document', title, version: 1, created: day, updated: day, tags: [], fields: {} }

  // A tool-swap timeline carries its own DATA object — enrich the card from it.
  const tl = timelineDataOf(html)
  if (tl) {
    man.type = 'tool-swap-timeline'
    man.category = 'Tooling'
    if (tl.part) { const tid = slugId(`tool-swap-timeline_${tl.part}`); if (tid) man.id = tid }
    man.tags = tl.tags
    man.description = tl.part ? `Die-set removal history for part ${tl.part}.` : ''
    man.fields = { part: tl.part, partFamily: tl.part ? String(tl.part).split('-')[0] : '', events: tl.events, dateRange: { from: tl.dmin, to: tl.dmax } }
  }
  return man
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
  const skipped = []   // files that were found but couldn't become modules (with why)

  for (const file of htmls) {
    const relFile = toPosix(relative(root, file))
    let html
    try { html = await fs.readFile(file, 'utf8') } catch { skipped.push({ file: relFile, reason: 'could not read the file (an offline OneDrive file?)' }); continue }
    let man = parseManifest(html)
    let inferred = false
    if (!man || !validateManifest(man).ok) {
      // No embedded manifest (or an invalid one): synthesise one from the file so
      // standalone-tool timelines and other manifest-less work-item HTML still show.
      let mtime = null
      try { mtime = (await fs.stat(file)).mtime } catch { /* keep null → today() */ }
      const guess = inferManifest(html, file, mtime)
      if (guess && validateManifest(guess).ok) { man = guess; inferred = true }
      else { skipped.push({ file: relFile, reason: man ? 'invalid module-manifest' : 'no module-manifest and no readable title' }); continue }
    }

    const id = man.id
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
      edited: !!(rec.overrides.title || rec.overrides.tags),
      inferred
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
  return { root, folders, modules: [...byId.values()], htmlCount: htmls.length, skipped }
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
    // A manifest is optional — files without one are inferred on scan — so any
    // readable self-contained HTML can be imported.
    const man = parseManifest(html)
    await fs.copyFile(f, join(destDir, basename(f)))
    const src = await siblingSource(f)
    if (src) await fs.copyFile(src, join(destDir, basename(src)))
    done.push({ ok: true, file: basename(f), id: man?.id || slugId(basename(f, extname(f))) || null })
  }
  return done
}

async function walkHtmlUnder(dir) {
  const out = []
  const seen = new Set()
  async function rec(d) {
    let key
    try { key = await fs.realpath(d) } catch { key = d }
    if (seen.has(key)) return
    seen.add(key)
    let ents
    try { ents = await fs.readdir(d, { withFileTypes: true }) } catch { return }
    for (const e of ents) {
      if (e.name === HIDDEN) continue
      const full = join(d, e.name)
      const kind = await entryKind(full, e)
      if (kind === 'dir') await rec(full)
      else if (kind === 'file' && /\.html?$/i.test(e.name)) out.push(full)
    }
  }
  await rec(dir)
  return out
}

/**
 * Attach a whole folder of modules, preserving its internal subfolder structure
 * under destRel. Copies each valid module .html (+ sibling source).
 */
export async function importTree(root, destRel, srcDir) {
  const files = await walkHtmlUnder(srcDir)
  const done = []
  for (const f of files) {
    let html
    try { html = await fs.readFile(f, 'utf8') } catch { done.push({ ok: false, file: basename(f), error: 'unreadable' }); continue }
    const man = parseManifest(html)                                // optional — inferred on scan when absent
    const rel = toPosix(relative(srcDir, dirname(f)))              // subfolder under the picked dir
    const dest = join(root, destRel || '', rel)
    await fs.mkdir(dest, { recursive: true })
    await fs.copyFile(f, join(dest, basename(f)))
    const src = await siblingSource(f)
    if (src) await fs.copyFile(src, join(dest, basename(src)))
    done.push({ ok: true, file: basename(f), id: man?.id || slugId(basename(f, extname(f))) || null, folder: toPosix(join(destRel || '', rel)) })
  }
  return done
}

export async function createFolder(root, relPath) {
  const clean = String(relPath || '').replace(/[.]{2,}/g, '').replace(/^[/\\]+/, '')
  if (!clean) return false
  await fs.mkdir(join(root, clean), { recursive: true })
  return true
}

/** Delete a module: its live file (+source), its version snapshots, and index entry. */
export async function deleteModule(root, id) {
  const idx = await loadIndex(root)
  const rec = idx.modules?.[id]
  if (rec?.lastPath) {
    const live = join(root, rec.lastPath)
    const src = await siblingSource(live)
    try { await fs.rm(live, { force: true }) } catch { /* already gone */ }
    if (src) { try { await fs.rm(src, { force: true }) } catch { /* ignore */ } }
  }
  try { await fs.rm(join(root, HIDDEN, 'versions', id), { recursive: true, force: true }) } catch { /* ignore */ }
  if (idx.modules) delete idx.modules[id]
  await saveIndex(root, idx)
  return true
}

/** Delete a folder (and everything under it) inside the root. Traversal-guarded. */
export async function deleteFolder(root, relPath) {
  const clean = String(relPath || '').replace(/[.]{2,}/g, '').replace(/^[/\\]+/, '')
  if (!clean || clean === HIDDEN) return false
  await fs.rm(join(root, clean), { recursive: true, force: true })
  return true
}

/** Copy the whole library (including .shopdeck) into a new folder under destParent. */
export async function backupLibrary(root, destParent, stamp) {
  const dest = join(destParent, `ShopDeck-Library-Backup${stamp ? '-' + stamp : ''}`)
  await fs.cp(root, dest, { recursive: true })
  return dest
}

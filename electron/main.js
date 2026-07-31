import { app, BrowserWindow, ipcMain, dialog, shell, screen } from 'electron'
import { join, basename } from 'node:path'
import { promises as fs, watch } from 'node:fs'
import { scanLibrary, resolveModuleFile, setOverride, importFiles, importTree, createFolder, moduleVersions, deleteModule, deleteFolder, backupLibrary } from './library.js'
import { normalizeLibraries, activeLibrary as pickActive, addLibrary, renameLibrary, removeLibrary, setActive, setLibraryRoot } from './libraries.js'
import * as updater from './updater.js'
import XLSX from 'xlsx'
import { generateTimeline } from './generators/timeline.js'
import timelineTemplate from './generators/timeline-template.html?raw'

// ---- Crash resilience -------------------------------------------------------
// A single stray async error in the main process otherwise shows Electron's
// fatal "A JavaScript error occurred in the main process" dialog and kills the
// app. Log and keep running so a non-critical failure (e.g. a file watcher on a
// flaky network share) never takes the whole window down with it.
process.on('uncaughtException', (err) => { console.error('[main] uncaught exception:', err) })
process.on('unhandledRejection', (err) => { console.error('[main] unhandled rejection:', err) })

// ---- Settings (userData/settings.json) --------------------------------------
// `libraries` is the multi-library list (see electron/libraries.js); `libraryRoot`
// is the legacy single-root field kept only so old installs migrate cleanly.
const DEFAULTS = { libraries: null, activeLibraryId: null, libraryRoot: null, theme: 'grey', showUpdater: true, mode: 'editing' }
const settingsFile = () => join(app.getPath('userData'), 'settings.json')
const defaultRoot = () => join(app.getPath('documents'), 'ShopDeck Library')

async function loadSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(await fs.readFile(settingsFile(), 'utf8')) } }
  catch { return { ...DEFAULTS } }
}
async function saveSettings(patch) {
  const next = { ...(await loadSettings()), ...patch }
  await fs.writeFile(settingsFile(), JSON.stringify(next, null, 2), 'utf8')
  return next
}

// The normalized { libraries, activeLibraryId } view, migrating a legacy single
// libraryRoot on first read and persisting the result so it only happens once.
async function libraryState() {
  const s = await loadSettings()
  const st = normalizeLibraries(s, defaultRoot())
  if (st.changed) await saveSettings({ libraries: st.libraries, activeLibraryId: st.activeLibraryId })
  return { libraries: st.libraries, activeLibraryId: st.activeLibraryId }
}
async function persistState(st) {
  await saveSettings({ libraries: st.libraries, activeLibraryId: st.activeLibraryId })
  return st
}
async function libraryRoot() {
  const lib = pickActive(await libraryState())
  // Best-effort ensure the folder exists. Never throw here: an offline share or
  // a deleted folder is surfaced by scan (as a soft error) instead of taking
  // down whichever IPC handler happened to call this first.
  try { await fs.mkdir(lib.root, { recursive: true }) } catch { /* surfaced by scan */ }
  return lib.root
}

// Turn a raw fs error from an unreachable/missing library into a short, plain
// message the renderer can show — the graceful-degradation sibling of the
// watcher fix (a network-share failure must not brick the app).
function friendlyRootError(err) {
  const msg = String((err && err.message) || err || '')
  if (/ENOENT|no such file/i.test(msg)) return 'The library folder could not be found — it may have been moved or renamed, or a network share is offline.'
  if (/EPERM|EACCES|permission denied/i.test(msg)) return "ShopDeck doesn't have permission to read this library folder."
  if (/UNKNOWN|EBUSY|ENETUNREACH|ETIMEDOUT|EHOSTDOWN|EHOSTUNREACH|ENXIO/i.test(msg)) return 'The library folder is unavailable — a network share may be disconnected.'
  return 'The library could not be opened: ' + (msg.split('\n')[0].slice(0, 160) || 'unknown error')
}

// Scan the active library, degrading to a soft error object (never a rejection)
// so the renderer can render a retry banner instead of hanging on "Loading…".
async function scanActive() {
  const lib = pickActive(await libraryState())
  try { return { ...(await scanLibrary(lib.root)), library: lib } }
  catch (err) { return { root: lib.root, folders: [], modules: [], library: lib, error: friendlyRootError(err) } }
}

// ---- Windows ----------------------------------------------------------------
let mainWindow = null
const moduleWindows = new Set()

// Never let a dropped file/folder (or a stray link) navigate a window away from
// the app — that used to blank the window when attaching a folder.
function hardenWindow(win) {
  win.webContents.on('will-navigate', (e, url) => { if (url !== win.webContents.getURL()) e.preventDefault() })
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' } })
}

// ---- Library watcher (auto-refresh) -----------------------------------------
// Watch the root and nudge the renderer to re-scan when files change (e.g. a
// coworker drops a module on the shared drive). Ignores our own .shopdeck writes.
let watcher = null
let notifyTimer = null
function scheduleNotify() {
  clearTimeout(notifyTimer)
  notifyTimer = setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('library:changed')
  }, 500)
}
async function startWatch() {
  if (watcher) { try { watcher.close() } catch { /* ignore */ } watcher = null }
  const root = await libraryRoot()
  try {
    const w = watch(root, { recursive: true }, (_evt, file) => {
      if (file && String(file).includes('.shopdeck')) return // our own metadata
      scheduleNotify()
    })
    // fs.watch can fail ASYNCHRONOUSLY, long after this synchronous setup call.
    // On Windows a recursive watch over an OneDrive-synced Documents folder
    // (the default root) or a network share emits an 'error' event —
    // "UNKNOWN: unknown error, watch" from FSWatcher._handle.onchange. With no
    // 'error' listener, EventEmitter rethrows it and the whole main process
    // dies with a fatal dialog. Catch it and degrade to manual refresh.
    w.on('error', () => { try { w.close() } catch { /* ignore */ } if (watcher === w) watcher = null })
    watcher = w
  } catch { /* some network shares don't emit events; degrade quietly */ }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1240, height: 820, minWidth: 960, minHeight: 620,
    title: 'ShopDeck', backgroundColor: '#1b1b1b', show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false
    }
  })
  mainWindow.once('ready-to-show', () => mainWindow.show())
  hardenWindow(mainWindow)
  if (process.env.ELECTRON_RENDERER_URL) mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  else mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
}

function openModuleWindow({ indexPath, title, version }) {
  const win = new BrowserWindow({
    width: 1280, height: 860,
    title: version ? `${title}  ·  v${version}` : title,
    backgroundColor: '#f4f6f8',
    webPreferences: {
      preload: join(__dirname, '../preload/viewer.js'),
      contextIsolation: true, nodeIntegration: false
    }
  })
  win.setMenuBarVisibility(false)
  win.loadFile(indexPath)
  moduleWindows.add(win)
  win.on('closed', () => moduleWindows.delete(win))
  return win
}

// ---- IPC --------------------------------------------------------------------
ipcMain.handle('settings:get', () => loadSettings())
ipcMain.handle('settings:set', (_e, patch) => saveSettings(patch || {}))

ipcMain.handle('library:scan', () => scanActive())

// Change the folder the ACTIVE library points at (multi-library repoint).
ipcMain.handle('library:chooseRoot', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose library folder (local or network share)',
    properties: ['openDirectory', 'createDirectory']
  })
  if (res.canceled || !res.filePaths[0]) return { canceled: true }
  const root = res.filePaths[0]
  await persistState(setLibraryRoot(await libraryState(), root))
  startWatch()
  return { canceled: false, root, ...(await scanActive()) }
})

// ---- Libraries (multiple named library roots) -------------------------------
ipcMain.handle('libraries:list', () => libraryState())

ipcMain.handle('libraries:add', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Add a library folder (local or network share)',
    properties: ['openDirectory', 'createDirectory']
  })
  if (res.canceled || !res.filePaths[0]) return { canceled: true }
  const next = await persistState(addLibrary(await libraryState(), { root: res.filePaths[0] }))
  startWatch()
  return { canceled: false, ...next }
})

ipcMain.handle('libraries:rename', async (_e, { id, name }) =>
  persistState(renameLibrary(await libraryState(), id, name)))

ipcMain.handle('libraries:remove', async (_e, { id }) => {
  const next = await persistState(removeLibrary(await libraryState(), id))
  startWatch()
  return next
})

ipcMain.handle('libraries:switch', async (_e, { id }) => {
  const next = await persistState(setActive(await libraryState(), id))
  startWatch()
  return next
})

ipcMain.handle('libraries:reveal', async (_e, { id }) => {
  const st = await libraryState()
  const lib = st.libraries.find((l) => l.id === id)
  if (lib) await shell.openPath(lib.root)
  return true
})

ipcMain.handle('library:reveal', async () => { await shell.openPath(await libraryRoot()); return true })
ipcMain.handle('shell:openExternal', (_e, { url }) => { if (/^https?:\/\//i.test(url)) shell.openExternal(url); return true })

ipcMain.handle('module:open', async (_e, { id, version, title }) => {
  const root = await libraryRoot()
  const info = await resolveModuleFile(root, id, version)
  if (!info) throw new Error(`module not found: ${id}`)
  openModuleWindow({ ...info, title: title || id })
  return true
})

// ---- Viewer toolbar (module windows) ----------------------------------------
ipcMain.handle('viewer:info', async (_e, { id }) => {
  const root = await libraryRoot()
  const mv = await moduleVersions(root, id)
  if (!mv) return null
  const live = await resolveModuleFile(root, id)
  return { ...mv, hasSource: !!live?.sourcePath }
})

ipcMain.handle('viewer:open', async (e, { id, version }) => {
  const info = await resolveModuleFile(await libraryRoot(), id, version)
  if (!info) return false
  const w = BrowserWindow.fromWebContents(e.sender)
  if (w) { w.loadFile(info.indexPath); w.setTitle(`${id}  ·  v${info.version}`) }
  return true
})

ipcMain.handle('viewer:source', async (e, { id, version }) => {
  const info = await resolveModuleFile(await libraryRoot(), id, version)
  if (!info?.sourcePath) return { ok: false }
  await shell.showItemInFolder(info.sourcePath)
  return { ok: true }
})

ipcMain.handle('viewer:close', (e) => { BrowserWindow.fromWebContents(e.sender)?.close() })

ipcMain.handle('viewer:compare', async (e, { id, version }) => {
  const root = await libraryRoot()
  const mv = await moduleVersions(root, id)
  if (!mv || mv.versions.length < 2) return
  const other = version === mv.latest ? version - 1 : mv.latest
  const info = await resolveModuleFile(root, id, other)
  if (!info) return
  const cur = BrowserWindow.fromWebContents(e.sender)
  if (!cur) return
  const wa = screen.getDisplayMatching(cur.getBounds()).workArea
  const half = Math.floor(wa.width / 2)
  cur.setBounds({ x: wa.x, y: wa.y, width: half, height: wa.height })
  const w2 = openModuleWindow({ indexPath: info.indexPath, title: id, version: info.version })
  w2.setBounds({ x: wa.x + half, y: wa.y, width: wa.width - half, height: wa.height })
})

ipcMain.handle('module:source', async (_e, { id, version }) => {
  const info = await resolveModuleFile(await libraryRoot(), id, version)
  if (!info?.sourcePath) return { ok: false, reason: 'no source' }
  await shell.showItemInFolder(info.sourcePath)
  return { ok: true }
})

ipcMain.handle('module:setMeta', async (_e, { id, title, tags }) => {
  const patch = {}
  if (title !== undefined) patch.title = title
  if (tags !== undefined) patch.tags = tags
  return setOverride(await libraryRoot(), id, patch)
})

ipcMain.handle('module:import', async (_e, { destRel } = {}) => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Import module', filters: [{ name: 'Module HTML', extensions: ['html', 'htm'] }],
    properties: ['openFile', 'multiSelections']
  })
  if (res.canceled) return { canceled: true }
  const results = await importFiles(await libraryRoot(), destRel || '', res.filePaths)
  return { canceled: false, results }
})

// Attach a whole folder (its module files + subfolder structure).
ipcMain.handle('module:importFolder', async (_e, { destRel } = {}) => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Attach a folder of modules', properties: ['openDirectory']
  })
  if (res.canceled || !res.filePaths[0]) return { canceled: true }
  const results = await importTree(await libraryRoot(), destRel || '', res.filePaths[0])
  return { canceled: false, results }
})

// Import dropped OS paths (files or folders).
ipcMain.handle('module:importPaths', async (_e, { paths, destRel } = {}) => {
  const root = await libraryRoot()
  const results = []
  for (const p of paths || []) {
    try {
      const st = await fs.stat(p)
      if (st.isDirectory()) results.push(...await importTree(root, destRel || '', p))
      else results.push(...await importFiles(root, destRel || '', [p]))
    } catch (err) { results.push({ ok: false, file: basename(p), error: String(err.message || err) }) }
  }
  return { canceled: false, results }
})

ipcMain.handle('folder:create', async (_e, { relPath }) => createFolder(await libraryRoot(), relPath))

ipcMain.handle('module:delete', async (_e, { id, title }) => {
  const res = await dialog.showMessageBox(mainWindow, {
    type: 'warning', buttons: ['Cancel', 'Delete'], defaultId: 0, cancelId: 0,
    title: 'Delete module', message: `Delete "${title || id}"?`,
    detail: 'This removes the module and its version history from the library. This cannot be undone.'
  })
  if (res.response !== 1) return { canceled: true }
  await deleteModule(await libraryRoot(), id)
  return { canceled: false }
})

ipcMain.handle('folder:delete', async (_e, { relPath }) => {
  const res = await dialog.showMessageBox(mainWindow, {
    type: 'warning', buttons: ['Cancel', 'Delete'], defaultId: 0, cancelId: 0,
    title: 'Delete folder', message: `Delete the folder "${relPath}"?`,
    detail: 'This removes the folder and every module inside it. This cannot be undone.'
  })
  if (res.response !== 1) return { canceled: true }
  await deleteFolder(await libraryRoot(), relPath)
  return { canceled: false }
})

// ---- Generators ------------------------------------------------------------
ipcMain.handle('generator:timeline', async (_e, { destRel } = {}) => {
  const pick = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose the timeline spreadsheet',
    filters: [{ name: 'Excel workbook', extensions: ['xlsx', 'xls'] }], properties: ['openFile']
  })
  if (pick.canceled || !pick.filePaths[0]) return { canceled: true }

  let result
  try {
    const wb = XLSX.readFile(pick.filePaths[0])
    result = generateTimeline({ wb, template: timelineTemplate, today: new Date().toISOString().slice(0, 10) })
  } catch (err) { return { canceled: false, error: String(err.message || err) } }

  const root = await libraryRoot()
  const rel = destRel || 'Tooling/Timelines'
  const dir = join(root, rel)
  await fs.mkdir(dir, { recursive: true })
  const base = `tool-swap-timeline_${result.part}`
  await fs.writeFile(join(dir, `${base}.html`), result.html, 'utf8')
  try { await fs.copyFile(pick.filePaths[0], join(dir, `${base}.xlsx`)) } catch { /* source optional */ }
  return { canceled: false, part: result.part, events: result.data.events.length, positions: result.data.lanes.length, folder: rel }
})

ipcMain.handle('library:backup', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose where to save the backup', properties: ['openDirectory', 'createDirectory']
  })
  if (res.canceled || !res.filePaths[0]) return { canceled: true }
  const stamp = new Date().toISOString().slice(0, 10)
  const dest = await backupLibrary(await libraryRoot(), res.filePaths[0], stamp)
  return { canceled: false, dest }
})

// ---- Thumbnails -------------------------------------------------------------
// Render a module in an off-screen window and cache a PNG in .shopdeck/thumbs.
// Serialized via a queue so we never open many capture windows at once.
let thumbChain = Promise.resolve()
function queueThumb(fn) { const p = thumbChain.then(fn, fn); thumbChain = p.catch(() => {}); return p }

function captureModule(indexPath) {
  return new Promise((resolve) => {
    const w = new BrowserWindow({
      x: -4000, y: -4000, width: 1200, height: 800, show: false, skipTaskbar: true, frame: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false }
    })
    let settled = false
    const done = async (ok) => {
      if (settled) return; settled = true
      let png = null
      try { if (ok) { const img = await w.webContents.capturePage(); if (!img.isEmpty()) png = img.resize({ width: 480 }).toPNG() } } catch { /* leave null */ }
      if (!w.isDestroyed()) w.destroy()
      resolve(png)
    }
    w.webContents.once('did-finish-load', () => setTimeout(() => done(true), 800)) // let charts lay out
    w.webContents.once('did-fail-load', () => done(false))
    w.once('ready-to-show', () => w.showInactive()) // off-screen, so it paints without appearing
    w.loadFile(indexPath).catch(() => done(false))
    setTimeout(() => done(false), 9000)
  })
}

ipcMain.handle('module:thumb', async (_e, { id, version }) => {
  const root = await libraryRoot()
  const info = await resolveModuleFile(root, id, version)
  if (!info) return null
  const dir = join(root, '.shopdeck', 'thumbs')
  const out = join(dir, `${id}_v${info.version}.png`)
  try { return 'data:image/png;base64,' + (await fs.readFile(out)).toString('base64') } catch { /* generate */ }
  const png = await queueThumb(() => captureModule(info.indexPath))
  if (!png) return null
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(out, png)
  return 'data:image/png;base64,' + png.toString('base64')
})

// ---- Updates (manual only) --------------------------------------------------
ipcMain.handle('app:version', () => app.getVersion())
ipcMain.handle('updater:check', async () => {
  const s = await loadSettings()
  const gate = updater.updatesAllowed({ env: process.env, showUpdater: s.showUpdater })
  if (!gate.enabled) return { ok: false, error: 'disabled' }
  return updater.check()
})
ipcMain.handle('updater:download', () => updater.download())
ipcMain.handle('updater:install', () => updater.install())

// ---- Lifecycle --------------------------------------------------------------
app.whenReady().then(() => {
  createMainWindow()
  startWatch()
  updater.onStatus((s) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('updater:status', s) })
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createMainWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

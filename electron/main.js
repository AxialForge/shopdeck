import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { join, basename } from 'node:path'
import { promises as fs } from 'node:fs'
import { scanLibrary, resolveModuleFile, setOverride, importFiles, createFolder } from './library.js'
import * as updater from './updater.js'

// ---- Settings (userData/settings.json) --------------------------------------
const DEFAULTS = { libraryRoot: null, theme: 'grey', showUpdater: true, mode: 'editing' }
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
async function libraryRoot() {
  const s = await loadSettings()
  const root = s.libraryRoot || defaultRoot()
  await fs.mkdir(root, { recursive: true })
  if (!s.libraryRoot) await saveSettings({ libraryRoot: root }) // persist the resolved default
  return root
}

// ---- Windows ----------------------------------------------------------------
let mainWindow = null
const moduleWindows = new Set()

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
  if (process.env.ELECTRON_RENDERER_URL) mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  else mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
}

function openModuleWindow({ indexPath, title, version }) {
  const win = new BrowserWindow({
    width: 1280, height: 860,
    title: version ? `${title}  ·  v${version}` : title,
    backgroundColor: '#f4f6f8',
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  })
  win.setMenuBarVisibility(false)
  win.loadFile(indexPath)
  moduleWindows.add(win)
  win.on('closed', () => moduleWindows.delete(win))
}

// ---- IPC --------------------------------------------------------------------
ipcMain.handle('settings:get', () => loadSettings())
ipcMain.handle('settings:set', (_e, patch) => saveSettings(patch || {}))

ipcMain.handle('library:scan', async () => scanLibrary(await libraryRoot()))

ipcMain.handle('library:chooseRoot', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose library folder (local or network share)',
    properties: ['openDirectory', 'createDirectory']
  })
  if (res.canceled || !res.filePaths[0]) return { canceled: true }
  const root = res.filePaths[0]
  await saveSettings({ libraryRoot: root })
  return { canceled: false, root, ...(await scanLibrary(root)) }
})

ipcMain.handle('library:reveal', async () => { await shell.openPath(await libraryRoot()); return true })

ipcMain.handle('module:open', async (_e, { id, version, title }) => {
  const root = await libraryRoot()
  const info = await resolveModuleFile(root, id, version)
  if (!info) throw new Error(`module not found: ${id}`)
  openModuleWindow({ ...info, title: title || id })
  return true
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

ipcMain.handle('folder:create', async (_e, { relPath }) => createFolder(await libraryRoot(), relPath))

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
  updater.onStatus((s) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('updater:status', s) })
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createMainWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

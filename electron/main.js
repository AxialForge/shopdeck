import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { join, dirname, basename, extname } from 'node:path'
import { promises as fs } from 'node:fs'
import { importModule, listCatalog, getModulePath } from './library.js'

// Library location: alongside the project in dev, in userData when packaged.
// Override with SHOPDECK_LIBRARY for a shared/network location later.
function libraryDir() {
  if (process.env.SHOPDECK_LIBRARY) return process.env.SHOPDECK_LIBRARY
  const base = app.isPackaged ? app.getPath('userData') : process.cwd()
  return join(base, 'library')
}

let mainWindow = null
const moduleWindows = new Set()

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 940,
    minHeight: 600,
    title: 'ShopDeck',
    backgroundColor: '#f4f6f8',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  mainWindow.once('ready-to-show', () => mainWindow.show())

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Open a module (a self-contained, trusted local HTML file) in its own window,
// at full fidelity, with zoom enabled.
function openModuleWindow({ indexPath, title, version }) {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    title: version ? `${title}  ·  v${version}` : title,
    backgroundColor: '#f4f6f8',
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  })
  win.setMenuBarVisibility(false)
  win.loadFile(indexPath)
  moduleWindows.add(win)
  win.on('closed', () => moduleWindows.delete(win))
}

ipcMain.handle('catalog:dir', () => libraryDir())

ipcMain.handle('catalog:list', async () => {
  return listCatalog(libraryDir())
})

ipcMain.handle('module:open', async (_e, { id, version }) => {
  const info = await getModulePath(libraryDir(), id, version)
  if (!info) throw new Error(`module not found: ${id}`)
  openModuleWindow(info)
  return true
})

ipcMain.handle('module:source', async (_e, { id, version }) => {
  const info = await getModulePath(libraryDir(), id, version)
  if (!info?.sourcePath) return { ok: false, reason: 'no source attached' }
  await shell.showItemInFolder(info.sourcePath)
  return { ok: true }
})

ipcMain.handle('module:import', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Import module',
    filters: [{ name: 'Module HTML', extensions: ['html', 'htm'] }],
    properties: ['openFile', 'multiSelections']
  })
  if (res.canceled) return { canceled: true }

  const results = []
  for (const htmlPath of res.filePaths) {
    // Auto-attach a sibling source file with the same base name (e.g. the .xlsx).
    let sourcePath = null
    const dir = dirname(htmlPath)
    const base = basename(htmlPath, extname(htmlPath))
    for (const ext of ['.xlsx', '.xls', '.csv']) {
      const cand = join(dir, base + ext)
      try { await fs.access(cand); sourcePath = cand; break } catch { /* none */ }
    }
    try {
      results.push({ ok: true, ...(await importModule({ htmlPath, sourcePath, libDir: libraryDir() })) })
    } catch (err) {
      results.push({ ok: false, file: basename(htmlPath), error: String(err.message || err) })
    }
  }
  return { canceled: false, results }
})

app.whenReady().then(() => {
  createMainWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

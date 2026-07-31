import { contextBridge, ipcRenderer, webUtils } from 'electron'

contextBridge.exposeInMainWorld('shopdeck', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),

  scan: () => ipcRenderer.invoke('library:scan'),
  chooseRoot: () => ipcRenderer.invoke('library:chooseRoot'),
  revealRoot: () => ipcRenderer.invoke('library:reveal'),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', { url }),

  // Multiple named libraries + rename (see electron/libraries.js).
  libraries: {
    list: () => ipcRenderer.invoke('libraries:list'),
    add: () => ipcRenderer.invoke('libraries:add'),
    rename: (id, name) => ipcRenderer.invoke('libraries:rename', { id, name }),
    remove: (id) => ipcRenderer.invoke('libraries:remove', { id }),
    switch: (id) => ipcRenderer.invoke('libraries:switch', { id }),
    reveal: (id) => ipcRenderer.invoke('libraries:reveal', { id })
  },

  open: (id, version, title) => ipcRenderer.invoke('module:open', { id, version, title }),
  showSource: (id, version) => ipcRenderer.invoke('module:source', { id, version }),
  setMeta: (id, patch) => ipcRenderer.invoke('module:setMeta', { id, ...patch }),

  importInto: (destRel) => ipcRenderer.invoke('module:import', { destRel }),
  importFolder: (destRel) => ipcRenderer.invoke('module:importFolder', { destRel }),
  importPaths: (paths, destRel) => ipcRenderer.invoke('module:importPaths', { paths, destRel }),
  getFilePath: (file) => webUtils.getPathForFile(file),
  createFolder: (relPath) => ipcRenderer.invoke('folder:create', { relPath }),
  deleteModule: (id, title) => ipcRenderer.invoke('module:delete', { id, title }),
  deleteFolder: (relPath) => ipcRenderer.invoke('folder:delete', { relPath }),
  backup: () => ipcRenderer.invoke('library:backup'),
  generateTimeline: (destRel) => ipcRenderer.invoke('generator:timeline', { destRel }),
  thumb: (id, version) => ipcRenderer.invoke('module:thumb', { id, version }),
  onLibraryChanged: (cb) => {
    const fn = () => cb()
    ipcRenderer.on('library:changed', fn)
    return () => ipcRenderer.removeListener('library:changed', fn)
  },

  appVersion: () => ipcRenderer.invoke('app:version'),
  update: {
    check: () => ipcRenderer.invoke('updater:check'),
    download: () => ipcRenderer.invoke('updater:download'),
    install: () => ipcRenderer.invoke('updater:install'),
    onStatus: (cb) => {
      const fn = (_e, s) => cb(s)
      ipcRenderer.on('updater:status', fn)
      return () => ipcRenderer.removeListener('updater:status', fn)
    }
  }
})

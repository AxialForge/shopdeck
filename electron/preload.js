import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('shopdeck', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),

  scan: () => ipcRenderer.invoke('library:scan'),
  chooseRoot: () => ipcRenderer.invoke('library:chooseRoot'),
  revealRoot: () => ipcRenderer.invoke('library:reveal'),

  open: (id, version, title) => ipcRenderer.invoke('module:open', { id, version, title }),
  showSource: (id, version) => ipcRenderer.invoke('module:source', { id, version }),
  setMeta: (id, patch) => ipcRenderer.invoke('module:setMeta', { id, ...patch }),

  importInto: (destRel) => ipcRenderer.invoke('module:import', { destRel }),
  createFolder: (relPath) => ipcRenderer.invoke('folder:create', { relPath }),

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

import { contextBridge, ipcRenderer } from 'electron'

// The only surface the renderer (React + Astryx) can touch. No Node, no fs.
contextBridge.exposeInMainWorld('shopdeck', {
  list: () => ipcRenderer.invoke('catalog:list'),
  open: (id, version) => ipcRenderer.invoke('module:open', { id, version }),
  showSource: (id, version) => ipcRenderer.invoke('module:source', { id, version }),
  importModules: () => ipcRenderer.invoke('module:import'),
  libraryDir: () => ipcRenderer.invoke('catalog:dir')
})

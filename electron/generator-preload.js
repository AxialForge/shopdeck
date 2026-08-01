// Preload for generator-tool windows. A generator is an untrusted, self-contained
// HTML file, so it runs with contextIsolation and NO node integration; the only
// surface it can touch is this small `window.shopdeckGenerator` bridge. Input
// files can come either from the tool's own drag-drop / <input type=file> (plain
// File API — no bridge needed) or from `pickFiles()`; finished modules go back to
// ShopDeck through `emit()`, which writes them into the active library.
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('shopdeckGenerator', {
  // Context the host injected when opening this tool: { id, name, accepts, folder }.
  context: () => ipcRenderer.invoke('generator:context'),

  // Open a native file picker; returns [{ name, path, bytes }] (bytes = Uint8Array).
  // `accept` is an array of extensions like ['.xlsx']; omitted → any file.
  pickFiles: (opts) => ipcRenderer.invoke('generator:pick', opts || {}),

  // Hand finished modules back to ShopDeck. `modules` = [{ filename, html,
  // folder?, source?: { name, bytes } }]. Resolves to a per-module result array.
  emit: (modules, opts) => ipcRenderer.invoke('generator:emit', { modules, ...(opts || {}) }),

  // Close this tool window.
  close: () => ipcRenderer.invoke('generator:closeWindow')
})

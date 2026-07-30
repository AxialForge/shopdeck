import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

const r = (p) => resolve(import.meta.dirname, p)

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: { index: r('electron/main.js') } } }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: { index: r('electron/preload.js') } } }
  },
  renderer: {
    root: r('src/renderer'),
    build: {
      rollupOptions: { input: { index: r('src/renderer/index.html') } }
    },
    plugins: [react()]
  }
})

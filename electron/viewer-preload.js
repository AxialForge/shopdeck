// Preload for module windows. Injects a small floating toolbar (version picker,
// source, compare, close) over the module without touching its content. Reads
// the current version from the page's own manifest, and the version list from
// main — so after switching versions the toolbar rebuilds correctly.
import { ipcRenderer } from 'electron'

function readManifest() {
  const el = document.getElementById('module-manifest')
  if (!el) return null
  try { return JSON.parse(el.textContent) } catch { return null }
}

const BTN = 'background:#232830;color:#eef1f4;border:1px solid #333a44;border-radius:14px;padding:4px 10px;font:inherit;cursor:pointer;'
function button(label, title) {
  const b = document.createElement('button')
  b.textContent = label; b.title = title || label; b.style.cssText = BTN
  return b
}

function buildToolbar(man, info) {
  document.getElementById('__sd_bar')?.remove()
  const versions = (info?.versions || []).slice().sort((a, b) => a.version - b.version)
  const cur = man.version
  const latest = info?.latest ?? cur

  const bar = document.createElement('div')
  bar.id = '__sd_bar'
  bar.style.cssText = 'position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:2147483647;' +
    'display:flex;align-items:center;gap:8px;background:#12151a;color:#eef1f4;border:1px solid #2a2f37;' +
    'border-radius:22px;padding:6px 10px;font:12px -apple-system,Segoe UI,Roboto,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.35);'

  if (versions.length > 1) {
    const sel = document.createElement('select')
    sel.style.cssText = BTN
    for (const v of versions.slice().reverse()) {
      const o = document.createElement('option')
      o.value = String(v.version)
      o.textContent = 'v' + v.version + (v.version === latest ? ' · latest' : '')
      if (v.version === cur) o.selected = true
      sel.appendChild(o)
    }
    sel.onchange = () => ipcRenderer.invoke('viewer:open', { id: man.id, version: Number(sel.value) })
    bar.appendChild(sel)

    const cmp = button('⊞ Compare', 'Open another version side by side')
    cmp.onclick = () => ipcRenderer.invoke('viewer:compare', { id: man.id, version: cur })
    bar.appendChild(cmp)
  } else {
    const label = document.createElement('span')
    label.textContent = 'v' + cur; label.style.opacity = '.75'
    bar.appendChild(label)
  }

  const curVer = versions.find((v) => v.version === cur)
  if (curVer?.source || info?.hasSource) {
    const src = button('⤓ Source', 'Reveal the source file')
    src.onclick = () => ipcRenderer.invoke('viewer:source', { id: man.id, version: cur })
    bar.appendChild(src)
  }

  const close = button('✕', 'Close')
  close.onclick = () => ipcRenderer.invoke('viewer:close')
  bar.appendChild(close)

  document.body.appendChild(bar)
}

async function init() {
  const man = readManifest()
  if (!man) return
  let info = null
  try { info = await ipcRenderer.invoke('viewer:info', { id: man.id }) } catch { /* offline */ }
  buildToolbar(man, info || { versions: [{ version: man.version }], latest: man.version })
}

if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', init)
else init()

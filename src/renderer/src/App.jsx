import { useEffect, useMemo, useState, useCallback } from 'react'
import { Badge, Button, SegmentedControl, SegmentedControlItem, TextInput, Token } from '@astryxdesign/core'

const api = window.shopdeck

// ---- Dev fallback (plain browser, no Electron preload) -----------------------
const ALL5 = ['preform', 'blocker', 'finish', 'pierce-strip', 'trim']
const SAMPLE = {
  root: '(browser preview — no Electron)',
  folders: ['Tooling', 'Tooling/Timelines', 'Quality'],
  modules: [
    ['40-1471-01', 68, ALL5, true], ['40-1444-01', 700, ALL5, false], ['40-1328-01', 1007, ALL5, true],
    ['40-1428-01', 305, ALL5, false], ['40-1318-01', 147, ALL5, true],
    ['40-1339-01', 291, ['preform', 'finish', 'pierce-strip', 'trim'], true],
    ['40-1462-01', 106, ['finish', 'pierce-strip', 'trim'], true]
  ].map(([part, events, tags, hasSource]) => ({
    id: `tool-swap-timeline_${part}`, type: 'tool-swap-timeline', title: `Tool Swap Timeline — ${part}`,
    tags, description: '', category: 'Tooling', fields: { part, events }, folder: 'Tooling/Timelines',
    file: `Tooling/Timelines/tool-swap-timeline_${part}.html`, hasSource, latest: 1, currentVersion: 1,
    versions: [{ version: 1, updated: '2026-07-29', created: '2026-07-29' }], edited: false
  }))
}

const sparkHeights = (seed) => Array.from({ length: 10 }, (_, i) => 30 + ((seed * 7 + i * 37) % 55))
const parseTags = (s) => [...new Set(String(s).split(/[,\s]+/).map((t) => t.trim().toLowerCase()).filter(Boolean))]

function buildTree(folders) {
  const root = { name: 'All', path: '', children: new Map() }
  for (const f of folders) {
    let node = root, acc = ''
    for (const part of f.split('/')) {
      acc = acc ? acc + '/' + part : part
      if (!node.children.has(part)) node.children.set(part, { name: part, path: acc, children: new Map() })
      node = node.children.get(part)
    }
  }
  return root
}

export default function App() {
  const [settings, setSettings] = useState({ theme: 'grey', libraryRoot: '' })
  const [data, setData] = useState({ root: '', folders: [], modules: [] })
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('library') // 'library' | 'settings'
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('updated')
  const [folder, setFolder] = useState('')
  const [activeTags, setActiveTags] = useState(() => new Set())
  const [editing, setEditing] = useState(null)   // module being edited
  const [newFolderOpen, setNewFolderOpen] = useState(false)

  const applyTheme = (t) => { document.documentElement.dataset.theme = t || 'grey' }

  const reload = useCallback(async () => {
    setLoading(true)
    const s = api ? await api.getSettings() : { theme: 'grey', libraryRoot: SAMPLE.root }
    applyTheme(s.theme)
    setSettings(s)
    setData(api ? await api.scan() : SAMPLE)
    setLoading(false)
  }, [])

  useEffect(() => { reload() }, [reload])

  const tree = useMemo(() => buildTree(data.folders), [data.folders])
  const countIn = useCallback(
    (p) => data.modules.filter((m) => p === '' || m.folder === p || m.folder.startsWith(p + '/')).length,
    [data.modules]
  )

  const tagCounts = useMemo(() => {
    const t = new Map()
    for (const m of data.modules) for (const tag of m.tags) t.set(tag, (t.get(tag) || 0) + 1)
    return [...t.entries()].sort((a, b) => b[1] - a[1])
  }, [data.modules])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = data.modules.filter((m) => {
      if (folder && !(m.folder === folder || m.folder.startsWith(folder + '/'))) return false
      if (activeTags.size && !m.tags.some((t) => activeTags.has(t))) return false
      if (!q) return true
      return [m.title, m.id, m.description, m.fields?.part, ...(m.tags || [])]
        .filter(Boolean).join(' ').toLowerCase().includes(q)
    })
    const upd = (m) => m.versions.at(-1)?.updated || ''
    return [...list].sort((a, b) =>
      sort === 'title' ? a.title.localeCompare(b.title)
        : sort === 'swaps' ? (b.fields?.events || 0) - (a.fields?.events || 0)
          : upd(b).localeCompare(upd(a)))
  }, [data.modules, query, sort, folder, activeTags])

  const toggleTag = (tag) => setActiveTags((prev) => {
    const next = new Set(prev); next.has(tag) ? next.delete(tag) : next.add(tag); return next
  })

  async function onImport() { if (!api) return; const r = await api.importInto(folder); if (!r?.canceled) reload() }
  async function onChangeTheme(t) { applyTheme(t); setSettings((s) => ({ ...s, theme: t })); if (api) await api.setSettings({ theme: t }) }
  async function onChangeRoot() { if (!api) return; const r = await api.chooseRoot(); if (!r?.canceled) reload() }
  async function saveEdit(id, title, tags) { if (api) await api.setMeta(id, { title, tags }); setEditing(null); reload() }
  async function createFolderNow(name) {
    setNewFolderOpen(false)
    if (!api || !name) return
    await api.createFolder(folder ? `${folder}/${name}` : name); reload()
  }

  const crumbs = folder ? folder.split('/') : []

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand"><span className="mark">S</span> ShopDeck</div>
        <span className="count">{data.modules.length} module{data.modules.length === 1 ? '' : 's'}</span>
        <Button label={view === 'settings' ? 'Library' : 'Settings'} variant="ghost"
          onClick={() => setView(view === 'settings' ? 'library' : 'settings')} />
      </div>

      {view === 'settings'
        ? <SettingsView settings={settings} root={data.root} onChangeTheme={onChangeTheme}
            onChangeRoot={onChangeRoot} onReveal={() => api?.revealRoot()} hasApi={!!api} />
        : (
          <>
            <div className="toolbar">
              <div className="search">
                <TextInput label="Search" value={query} onChange={setQuery} placeholder="Search part, tag, or title" hasClear />
              </div>
              <div className="spacer" />
              <SegmentedControl value={sort} onChange={setSort}>
                <SegmentedControlItem value="updated" label="Updated" />
                <SegmentedControlItem value="title" label="Name" />
                <SegmentedControlItem value="swaps" label="Swaps" />
              </SegmentedControl>
              <Button label="New folder" variant="secondary" onClick={() => setNewFolderOpen(true)} />
              <Button label="Import" variant="primary" onClick={onImport} />
            </div>

            <div className="main">
              <aside className="sidebar">
                <div className="side-h">Folders</div>
                <TreeNode node={tree} depth={0} current={folder} onSelect={setFolder} countIn={countIn} />
                {tagCounts.length > 0 && <div className="side-h">Tags</div>}
                <div className="side-tags">
                  {tagCounts.map(([tag, n]) => (
                    <span key={tag} onClick={() => toggleTag(tag)}
                      style={{ cursor: 'pointer', opacity: activeTags.size && !activeTags.has(tag) ? 0.45 : 1 }}>
                      <Token label={`${tag} ${n}`} color={activeTags.has(tag) ? 'blue' : 'default'} size="sm" />
                    </span>
                  ))}
                </div>
              </aside>

              <main className="content">
                <div className="crumbs">
                  <span className={folder ? 'crumb link' : 'crumb'} onClick={() => setFolder('')}>All</span>
                  {crumbs.map((c, i) => {
                    const path = crumbs.slice(0, i + 1).join('/')
                    return <span key={path}><span className="sep">›</span>
                      <span className={i < crumbs.length - 1 ? 'crumb link' : 'crumb'} onClick={() => setFolder(path)}>{c}</span></span>
                  })}
                </div>

                {loading && <div className="empty">Loading…</div>}
                {!loading && shown.length === 0 && (
                  <div className="empty">{data.modules.length === 0
                    ? 'Library is empty. Click Import to add a module (or run npm run seed).'
                    : 'Nothing matches your filters.'}</div>
                )}
                {!loading && shown.length > 0 && (
                  <div className="grid">
                    {shown.map((m) => (
                      <div key={m.id} className="card" onClick={() => api?.open(m.id, undefined, m.title)} title="Open module">
                        <div className="card-top">
                          <div className="grow">
                            <div className="part">{m.fields?.part || m.title}</div>
                            <div className="muted">{m.type.replace(/-/g, ' ')}{m.edited ? ' · edited' : ''}</div>
                          </div>
                          <Badge label={`v${m.latest}`} variant="neutral" />
                        </div>
                        <div className="spark">
                          {sparkHeights(m.fields?.events || m.id.length).map((h, i) => <span key={i} style={{ height: h + '%' }} />)}
                        </div>
                        <div className="card-foot">
                          <span>{(m.fields?.events ?? 0).toLocaleString()} swaps</span>
                          <span className="row-actions">
                            <button className="linkbtn" onClick={(e) => { e.stopPropagation(); setEditing(m) }}>Edit</button>
                            {m.hasSource && <button className="linkbtn" onClick={(e) => { e.stopPropagation(); api?.showSource(m.id) }}>Source</button>}
                          </span>
                        </div>
                        <div className="tags">{(m.tags || []).slice(0, 4).map((t) => <Token key={t} label={t} color="default" size="sm" />)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </main>
            </div>
          </>
        )}

      <div className="footer">
        <span>{view === 'settings' ? 'Settings' : `${shown.length} shown`}</span>
        <span className="spacer" />
        <span className="muted">theme: {settings.theme}</span>
      </div>

      {editing && <EditModal module={editing} onCancel={() => setEditing(null)} onSave={saveEdit} />}
      {newFolderOpen && <NameModal title="New folder" placeholder="Folder name"
        onCancel={() => setNewFolderOpen(false)} onSave={createFolderNow} note={folder ? `Inside: ${folder}` : 'At the library root'} />}
    </div>
  )
}

function TreeNode({ node, depth, current, onSelect, countIn }) {
  const kids = [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name))
  return (
    <>
      <div className={'side-row' + (current === node.path ? ' active' : '')}
        style={{ paddingLeft: 8 + depth * 12 }} onClick={() => onSelect(node.path)}>
        <span className="ell">{node.name}</span><span className="n">{countIn(node.path)}</span>
      </div>
      {kids.map((k) => <TreeNode key={k.path} node={k} depth={depth + 1} current={current} onSelect={onSelect} countIn={countIn} />)}
    </>
  )
}

function EditModal({ module, onCancel, onSave }) {
  const [title, setTitle] = useState(module.title)
  const [tags, setTags] = useState((module.tags || []).join(', '))
  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">Edit module</div>
        <label className="fld"><span>Title</span>
          <TextInput label="Title" value={title} onChange={setTitle} /></label>
        <label className="fld"><span>Tags (comma or space separated)</span>
          <TextInput label="Tags" value={tags} onChange={setTags} placeholder="blocker finish trim" /></label>
        <div className="muted small">Saved in the library index — the module file is not modified.</div>
        <div className="modal-foot">
          <Button label="Reset to file" variant="ghost" onClick={() => onSave(module.id, '', [])} />
          <div className="spacer" />
          <Button label="Cancel" variant="secondary" onClick={onCancel} />
          <Button label="Save" variant="primary" onClick={() => onSave(module.id, title.trim(), parseTags(tags))} />
        </div>
      </div>
    </div>
  )
}

function NameModal({ title, placeholder, note, onCancel, onSave }) {
  const [name, setName] = useState('')
  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">{title}</div>
        {note && <div className="muted small">{note}</div>}
        <label className="fld"><span>Name</span>
          <TextInput label="Name" value={name} onChange={setName} placeholder={placeholder} /></label>
        <div className="modal-foot">
          <div className="spacer" />
          <Button label="Cancel" variant="secondary" onClick={onCancel} />
          <Button label="Create" variant="primary" onClick={() => onSave(name.trim().replace(/[\\/]/g, '-'))} />
        </div>
      </div>
    </div>
  )
}

function SettingsView({ settings, root, onChangeTheme, onChangeRoot, onReveal, hasApi }) {
  return (
    <div className="settings">
      <h2>Settings</h2>

      <section className="set-sec">
        <div className="set-title">Library folder</div>
        <div className="muted small">The selected folder's structure is the organization. The app only reads and writes inside it.</div>
        <div className="rootline"><code>{root || settings.libraryRoot || '—'}</code></div>
        <div className="set-actions">
          <Button label="Change folder…" variant="secondary" onClick={onChangeRoot} />
          <Button label="Open in file browser" variant="ghost" onClick={onReveal} />
        </div>
        {!hasApi && <div className="muted small">(Browser preview — file actions work in the desktop app.)</div>}
      </section>

      <section className="set-sec">
        <div className="set-title">Theme</div>
        <SegmentedControl value={settings.theme || 'grey'} onChange={onChangeTheme}>
          <SegmentedControlItem value="light" label="Light" />
          <SegmentedControlItem value="grey" label="Grey" />
          <SegmentedControlItem value="black" label="Black" />
        </SegmentedControl>
      </section>
    </div>
  )
}

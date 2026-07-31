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
  ].map(([part, events, tags, hasSource]) => {
    const two = part === '40-1328-01' // demo a multi-version module in preview
    return {
      id: `tool-swap-timeline_${part}`, type: 'tool-swap-timeline', title: `Tool Swap Timeline — ${part}`,
      tags, description: '', category: 'Tooling', fields: { part, events }, folder: 'Tooling/Timelines',
      file: `Tooling/Timelines/tool-swap-timeline_${part}.html`, hasSource,
      latest: two ? 2 : 1, currentVersion: two ? 2 : 1,
      versions: two
        ? [{ version: 1, updated: '2026-06-15' }, { version: 2, updated: '2026-07-29' }]
        : [{ version: 1, updated: '2026-07-29', created: '2026-07-29' }],
      edited: false
    }
  })
}

const sparkHeights = (seed) => Array.from({ length: 10 }, (_, i) => 30 + ((seed * 7 + i * 37) % 55))
const parseTags = (s) => [...new Set(String(s).split(/[,\s]+/).map((t) => t.trim().toLowerCase()).filter(Boolean))]

const TABS = [
  { id: 'home', label: 'Home' },
  { id: 'library', label: 'Library' },
  { id: 'generator', label: 'Generator' },
  { id: 'settings', label: 'Settings' },
  { id: 'about', label: 'About' }
]
const GITHUB = 'https://github.com/AxialForge/shopdeck'
const openExternal = (url) => (api ? api.openExternal(url) : window.open(url, '_blank'))

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

const SAMPLE_LIBS = [{ id: 'sample', name: 'ShopDeck Library', root: SAMPLE.root }]

export default function App() {
  const [settings, setSettings] = useState({ theme: 'grey', libraryRoot: '', mode: 'editing' })
  const [data, setData] = useState({ root: '', folders: [], modules: [] })
  const [libraries, setLibraries] = useState(SAMPLE_LIBS)
  const [activeLibraryId, setActiveLibraryId] = useState('sample')
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('home') // home | library | generator | settings | about
  const [dropping, setDropping] = useState(false)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('updated')
  const [folder, setFolder] = useState('')
  const [activeTags, setActiveTags] = useState(() => new Set())
  const [editing, setEditing] = useState(null)   // module being edited
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [renaming, setRenaming] = useState(null)  // library being renamed
  const [thumbs, setThumbs] = useState({})       // id -> data URL ('' = tried, none)

  const applyTheme = (t) => { document.documentElement.dataset.theme = t || 'grey' }

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const s = api ? await api.getSettings() : { theme: 'grey', libraryRoot: SAMPLE.root, mode: 'editing' }
      applyTheme(s.theme)
      setSettings(s)
      if (api) {
        const st = await api.libraries.list()
        setLibraries(st.libraries || [])
        setActiveLibraryId(st.activeLibraryId || null)
      }
      setData(api ? await api.scan() : SAMPLE)
    } catch (err) {
      // Never leave the UI stuck on "Loading…" — surface the failure instead.
      setData((d) => ({ ...d, error: String((err && err.message) || err) }))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { reload() }, [reload])

  // Lazily fetch a rendered thumbnail per module (main serializes the work).
  useEffect(() => {
    if (!api) return
    let cancelled = false
    ;(async () => {
      for (const m of data.modules) {
        const key = `${m.id}_${m.latest}`
        if (thumbs[key] !== undefined) continue
        const url = await api.thumb(m.id, m.latest)
        if (cancelled) return
        setThumbs((prev) => ({ ...prev, [key]: url || '' }))
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.modules])

  // Auto-refresh when the library folder changes on disk (silent re-scan).
  useEffect(() => {
    if (!api) return
    return api.onLibraryChanged(async () => { setData(await api.scan()) })
  }, [])

  // A drop anywhere must never navigate the window away (the folder-attach bug).
  useEffect(() => {
    const prevent = (e) => e.preventDefault()
    window.addEventListener('dragover', prevent)
    window.addEventListener('drop', prevent)
    return () => { window.removeEventListener('dragover', prevent); window.removeEventListener('drop', prevent) }
  }, [])

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
  async function onImportFolder() { if (!api) return; const r = await api.importFolder(folder); if (!r?.canceled) reload() }
  async function onDropImport(e) {
    e.preventDefault(); setDropping(false)
    if (!api || !canEdit) return
    const paths = [...(e.dataTransfer?.files || [])].map((f) => { try { return api.getFilePath(f) } catch { return null } }).filter(Boolean)
    if (!paths.length) return
    const r = await api.importPaths(paths, folder)
    if (!r?.canceled) reload()
  }
  async function onChangeTheme(t) { applyTheme(t); setSettings((s) => ({ ...s, theme: t })); if (api) await api.setSettings({ theme: t }) }
  async function onChangeRoot() { if (!api) return; const r = await api.chooseRoot(); if (!r?.canceled) reload() }

  // ---- Libraries -------------------------------------------------------------
  async function onAddLibrary() { if (!api) return; const r = await api.libraries.add(); if (!r?.canceled) reload() }
  async function onSwitchLibrary(id) {
    if (!api || id === activeLibraryId) return
    setFolder(''); setActiveTags(new Set()); setQuery('')  // filters are per-library
    await api.libraries.switch(id); reload()
  }
  async function onRenameLibrary(id, name) {
    setRenaming(null)
    if (!api || !name) return
    const st = await api.libraries.rename(id, name)
    setLibraries(st.libraries || []); setActiveLibraryId(st.activeLibraryId || null)
  }
  async function onRemoveLibrary(id) { if (!api) return; await api.libraries.remove(id); reload() }
  function onRevealLibrary(id) { api?.libraries.reveal(id) }
  async function saveEdit(id, title, tags) { if (api) await api.setMeta(id, { title, tags }); setEditing(null); reload() }
  async function createFolderNow(name) {
    setNewFolderOpen(false)
    if (!api || !name) return
    await api.createFolder(folder ? `${folder}/${name}` : name); reload()
  }
  async function onDeleteModule(m) { if (!api) return; const r = await api.deleteModule(m.id, m.title); if (!r?.canceled) reload() }
  async function onDeleteFolder() {
    if (!api || !folder) return
    const r = await api.deleteFolder(folder)
    if (!r?.canceled) { setFolder(folder.includes('/') ? folder.slice(0, folder.lastIndexOf('/')) : ''); reload() }
  }

  async function onChangeMode(m) { setSettings((s) => ({ ...s, mode: m })); if (api) await api.setSettings({ mode: m }) }
  const canEdit = settings.mode !== 'readonly'
  const crumbs = folder ? folder.split('/') : []

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand"><span className="mark">S</span> ShopDeck</div>
        {libraries.length > 0 && (
          <label className="lib-switch" title="Active library">
            <select value={activeLibraryId || ''} onChange={(e) => onSwitchLibrary(e.target.value)}>
              {libraries.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
        )}
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={'tab' + (view === t.id ? ' on' : '')} onClick={() => setView(t.id)}>{t.label}</button>
          ))}
        </nav>
        <span className="count">{data.modules.length} module{data.modules.length === 1 ? '' : 's'}</span>
      </div>

      {data.error && (
        <div className="banner err-banner">
          <span className="banner-ic">!</span>
          <span className="grow ell" title={data.error}>{data.error}</span>
          <Button label="Retry" variant="secondary" onClick={reload} />
          <Button label="Manage libraries" variant="ghost" onClick={() => setView('settings')} />
        </div>
      )}

      {view === 'library' && (
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
              {canEdit && <Button label="New folder" variant="secondary" onClick={() => setNewFolderOpen(true)} />}
              {canEdit && <Button label="Attach folder" variant="secondary" onClick={onImportFolder} />}
              {canEdit && folder && <Button label="Delete folder" variant="ghost" onClick={onDeleteFolder} />}
              {canEdit && <Button label="Import" variant="primary" onClick={onImport} />}
            </div>

            <div className={'main' + (dropping ? ' dropping' : '')}
              onDragOver={(e) => { if (canEdit) { e.preventDefault(); setDropping(true) } }}
              onDragLeave={() => setDropping(false)}
              onDrop={onDropImport}>
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
                  <div className="empty">
                    {data.modules.length > 0
                      ? 'Nothing matches your filters.'
                      : data.htmlCount > 0
                        ? <>Found {data.htmlCount} HTML file{data.htmlCount === 1 ? '' : 's'} here, but {data.htmlCount === 1 ? 'it isn’t a valid module' : 'none are valid modules'} — each needs a <code>module-manifest</code> block.{data.skipped?.[0] ? <><br />First: <code>{data.skipped[0].file}</code> — {data.skipped[0].reason}.</> : ''}</>
                        : 'Library is empty. Click Import to add a module (or run npm run seed).'}
                  </div>
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
                        {thumbs[`${m.id}_${m.latest}`]
                          ? <img className="thumb" src={thumbs[`${m.id}_${m.latest}`]} alt="" />
                          : <div className="spark">
                              {sparkHeights(m.fields?.events || m.id.length).map((h, i) => <span key={i} style={{ height: h + '%' }} />)}
                            </div>}
                        <div className="card-foot">
                          <span>{(m.fields?.events ?? 0).toLocaleString()} swaps</span>
                          <span className="row-actions">
                            {canEdit && <button className="linkbtn" onClick={(e) => { e.stopPropagation(); setEditing(m) }}>Edit</button>}
                            {m.hasSource && <button className="linkbtn" onClick={(e) => { e.stopPropagation(); api?.showSource(m.id) }}>Source</button>}
                            {canEdit && <button className="linkbtn danger" onClick={(e) => { e.stopPropagation(); onDeleteModule(m) }}>Delete</button>}
                          </span>
                        </div>
                        <div className="tags">{(m.tags || []).slice(0, 4).map((t) => <Token key={t} label={t} color="default" size="sm" />)}</div>
                        {m.versions.length > 1 && (
                          <div className="vhist" onClick={(e) => e.stopPropagation()}>
                            <span className="vhist-label">Versions</span>
                            {m.versions.slice().reverse().map((v) => (
                              <button key={v.version} className={'vchip' + (v.version === m.latest ? ' cur' : '')}
                                title={`Open v${v.version}${v.updated ? ' · ' + v.updated : ''}`}
                                onClick={() => api?.open(m.id, v.version, m.title)}>v{v.version}</button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </main>
            </div>
          </>
        )}

      {view === 'home' && <HomeView data={data} settings={settings} go={setView} onOpenRoot={() => api?.revealRoot()} />}
      {view === 'generator' && <GeneratorView go={setView} onGenerated={reload} />}
      {view === 'settings' && <SettingsView settings={settings} root={data.root}
        libraries={libraries} activeLibraryId={activeLibraryId}
        onChangeTheme={onChangeTheme} onChangeMode={onChangeMode} onChangeRoot={onChangeRoot}
        onReveal={() => api?.revealRoot()} hasApi={!!api}
        onAddLibrary={onAddLibrary} onSwitchLibrary={onSwitchLibrary}
        onRenameLibrary={(lib) => setRenaming(lib)} onRemoveLibrary={onRemoveLibrary} onRevealLibrary={onRevealLibrary} />}
      {view === 'about' && <AboutView />}

      <div className="footer">
        <span>{view === 'library' ? `${shown.length} shown` : (TABS.find((t) => t.id === view)?.label || '')}</span>
        <span className="spacer" />
        <span className="muted">theme: {settings.theme}</span>
      </div>

      {editing && <EditModal module={editing} onCancel={() => setEditing(null)} onSave={saveEdit} />}
      {newFolderOpen && <NameModal title="New folder" placeholder="Folder name"
        onCancel={() => setNewFolderOpen(false)} onSave={createFolderNow} note={folder ? `Inside: ${folder}` : 'At the library root'} />}
      {renaming && <NameModal title="Rename library" placeholder="Library name"
        initial={renaming.name} actionLabel="Save" sanitize={false}
        note={`Just the label shown in ShopDeck — the folder on disk (${renaming.root}) is not renamed.`}
        onCancel={() => setRenaming(null)} onSave={(name) => onRenameLibrary(renaming.id, name)} />}
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

function NameModal({ title, placeholder, note, initial = '', actionLabel = 'Create', sanitize = true, onCancel, onSave }) {
  const [name, setName] = useState(initial)
  const submit = () => { const v = name.trim(); onSave(sanitize ? v.replace(/[\\/]/g, '-') : v) }
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
          <Button label={actionLabel} variant="primary" onClick={submit} />
        </div>
      </div>
    </div>
  )
}

function HomeView({ data, settings, go, onOpenRoot }) {
  return (
    <div className="page">
      <h2>Welcome to ShopDeck</h2>
      <p className="muted">A library for your interactive work-item modules — stored, organized, and version-tracked.</p>
      <div className="stats">
        <div className="stat"><div className="v">{data.modules.length}</div><div className="l">Modules</div></div>
        <div className="stat"><div className="v">{data.folders.length}</div><div className="l">Folders</div></div>
        <div className="stat"><div className="v" style={{ textTransform: 'capitalize' }}>{settings.theme}</div><div className="l">Theme</div></div>
      </div>
      <div className="rootline"><span className="muted small">Library:&nbsp;</span><code>{data.root || '—'}</code></div>
      <div className="set-actions">
        <Button label="Open the library" variant="primary" onClick={() => go('library')} />
        <Button label="Open library folder" variant="ghost" onClick={onOpenRoot} />
        <Button label="Generators" variant="secondary" onClick={() => go('generator')} />
      </div>
    </div>
  )
}

function GeneratorView({ onGenerated, go }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  async function run() {
    if (!api) return
    setBusy(true); setError(''); setResult(null)
    const r = await api.generateTimeline()
    setBusy(false)
    if (r?.canceled) return
    if (r?.error) { setError(r.error); return }
    setResult(r); onGenerated?.()
  }
  return (
    <div className="page">
      <h2>Generators</h2>
      <p>Build modules from source data. Each generator turns an input into a
        self-contained module in the exact standard format.</p>
      <div className="gen-card">
        <div className="set-title">Tool-swap timeline</div>
        <p className="muted small">Pick the standard timeline spreadsheet (a workbook with a
          <code> Swap Log </code> and a <code> By Position </code> sheet). It produces a timeline
          module in the exact current format and adds it to your library under
          <code> Tooling/Timelines</code>, with the spreadsheet attached as its source.</p>
        <div className="set-actions">
          <Button label={busy ? 'Generating…' : 'Generate from spreadsheet'} variant="primary" onClick={run} />
        </div>
        {error && <div className="small err" style={{ marginTop: 8 }}>{error}</div>}
        {result && (
          <div className="small" style={{ marginTop: 8 }}>
            Created <b>{result.part}</b> — {result.events.toLocaleString()} swaps across {result.positions} positions,
            in {result.folder}. <button className="linkbtn" onClick={() => go('library')}>Open in Library</button>
          </div>
        )}
        {!api && <div className="muted small">(Runs in the desktop app.)</div>}
      </div>
    </div>
  )
}

function AboutView() {
  const [version, setVersion] = useState('')
  useEffect(() => { if (api) api.appVersion().then(setVersion) }, [])
  return (
    <div className="page">
      <h2>ShopDeck{version ? ` v${version}` : ''}</h2>
      <p>A desktop library for interactive work-item modules — self-contained HTML
        documents that ShopDeck stores, organizes in a nested folder tree,
        version-tracks, and opens at full fidelity. Point it at a local folder or a
        network share and everyone gets the same organized, searchable library.</p>
      <p className="muted small">© 2026 AxialForge · Apache-2.0 licensed</p>
      <div className="set-actions">
        <Button label="GitHub repository" variant="secondary" onClick={() => openExternal(GITHUB)} />
        <Button label="Releases / downloads" variant="secondary" onClick={() => openExternal(`${GITHUB}/releases/latest`)} />
      </div>
    </div>
  )
}

function LibrariesSection({ libraries, activeLibraryId, hasApi, onAdd, onSwitch, onRename, onRemove, onReveal }) {
  const single = libraries.length <= 1
  return (
    <section className="set-sec">
      <div className="set-title">Libraries</div>
      <div className="muted small">Keep several libraries (local folders or network shares) and switch between
        them from the bar up top. Renaming changes only the label shown here — the folder on disk is never
        touched. Removing a library just unlinks it from ShopDeck; your files stay on disk.</div>
      <div className="lib-list">
        {libraries.map((l) => {
          const active = l.id === activeLibraryId
          return (
            <div key={l.id} className={'lib-row' + (active ? ' active' : '')}>
              <div className="grow">
                <div className="lib-name">
                  <span className="ell">{l.name}</span>
                  {active && <Badge label="Active" variant="success" />}
                </div>
                <div className="muted small ell" title={l.root}>{l.root}</div>
              </div>
              <div className="lib-row-actions">
                {!active && <button className="linkbtn" onClick={() => onSwitch(l.id)}>Use</button>}
                <button className="linkbtn" onClick={() => onRename(l)}>Rename</button>
                <button className="linkbtn" onClick={() => onReveal(l.id)}>Reveal</button>
                {!single && <button className="linkbtn danger" onClick={() => onRemove(l.id)}>Remove</button>}
              </div>
            </div>
          )
        })}
      </div>
      <div className="set-actions">
        <Button label="Add library…" variant="secondary" onClick={onAdd} />
      </div>
      {!hasApi && <div className="muted small">(Browser preview — library management works in the desktop app.)</div>}
    </section>
  )
}

function SettingsView({ settings, root, libraries, activeLibraryId, onChangeTheme, onChangeMode, onChangeRoot,
  onReveal, hasApi, onAddLibrary, onSwitchLibrary, onRenameLibrary, onRemoveLibrary, onRevealLibrary }) {
  const [backupMsg, setBackupMsg] = useState('')
  async function onBackup() {
    if (!hasApi) return
    setBackupMsg('Backing up…')
    const r = await window.shopdeck.backup()
    setBackupMsg(r?.canceled ? '' : `Backed up to ${r.dest}`)
  }
  return (
    <div className="settings">
      <h2>Settings</h2>

      <section className="set-sec">
        <div className="set-title">Mode</div>
        <div className="muted small">Read-only hides import, new folder, and editing — for shop-floor viewers on a shared library.</div>
        <div style={{ marginTop: 8 }}>
          <SegmentedControl value={settings.mode || 'editing'} onChange={onChangeMode}>
            <SegmentedControlItem value="editing" label="Editing" />
            <SegmentedControlItem value="readonly" label="Read-only" />
          </SegmentedControl>
        </div>
      </section>

      <LibrariesSection libraries={libraries} activeLibraryId={activeLibraryId} hasApi={hasApi}
        onAdd={onAddLibrary} onSwitch={onSwitchLibrary} onRename={onRenameLibrary}
        onRemove={onRemoveLibrary} onReveal={onRevealLibrary} />

      <section className="set-sec">
        <div className="set-title">Active library folder</div>
        <div className="muted small">The active library's folder structure is the organization. The app only reads and writes inside it.</div>
        <div className="rootline"><code>{root || settings.libraryRoot || '—'}</code></div>
        <div className="set-actions">
          <Button label="Change folder…" variant="secondary" onClick={onChangeRoot} />
          <Button label="Open in file browser" variant="ghost" onClick={onReveal} />
          <Button label="Back up library" variant="ghost" onClick={onBackup} />
        </div>
        {backupMsg && <div className="muted small" style={{ marginTop: 6 }}>{backupMsg}</div>}
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

      <UpdatesSection hasApi={hasApi} />
    </div>
  )
}

function UpdatesSection({ hasApi }) {
  const [version, setVersion] = useState('')
  const [status, setStatus] = useState({ state: 'idle' })

  useEffect(() => {
    if (!hasApi) return
    window.shopdeck.appVersion().then(setVersion)
    return window.shopdeck.update.onStatus(setStatus)
  }, [hasApi])

  const label = {
    idle: '', checking: 'Checking…', current: "You're up to date.",
    available: `Update available: v${status.version}`,
    downloading: `Downloading… ${status.percent || 0}%`,
    downloaded: `v${status.version} ready to install`, error: status.message
  }[status.state] || ''

  return (
    <section className="set-sec">
      <div className="set-title">Updates</div>
      <div className="muted small">Manual only — nothing is checked or downloaded until you click. {version && `Current version v${version}.`}</div>
      <div className="set-actions">
        {status.state !== 'available' && status.state !== 'downloaded' &&
          <Button label="Check for updates" variant="secondary" onClick={() => window.shopdeck?.update.check()} />}
        {status.state === 'available' &&
          <Button label="Download" variant="primary" onClick={() => window.shopdeck?.update.download()} />}
        {status.state === 'downloaded' &&
          <Button label="Restart & install" variant="primary" onClick={() => window.shopdeck?.update.install()} />}
      </div>
      {label && <div className={'small ' + (status.state === 'error' ? 'err' : 'muted')} style={{ marginTop: 8 }}>{label}</div>}
      {!hasApi && <div className="muted small">(Updates run in the installed app only.)</div>}
    </section>
  )
}

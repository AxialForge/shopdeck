import { useEffect, useMemo, useState } from 'react'
import {
  Badge,
  Button,
  SegmentedControl,
  SegmentedControlItem,
  TextInput,
  Token
} from '@astryxdesign/core'

const api = window.shopdeck

// Dev fallback: when running the renderer in a plain browser (no Electron
// preload), show representative data so the UI can be built without launching
// the app. In Electron, window.shopdeck is present and this is never used.
const ALL5 = ['preform', 'blocker', 'finish', 'pierce-strip', 'trim']
const SAMPLE = [
  ['40-1471-01', 68, ALL5, true], ['40-1444-01', 700, ALL5, false],
  ['40-1328-01', 1007, ALL5, true], ['40-1428-01', 305, ALL5, false],
  ['40-1318-01', 147, ALL5, true], ['40-1339-01', 291, ['preform', 'finish', 'pierce-strip', 'trim'], true],
  ['40-1462-01', 106, ['finish', 'pierce-strip', 'trim'], true]
].map(([part, events, tags, hasSource]) => ({
  id: `tool-swap-timeline_${part}`, type: 'tool-swap-timeline', title: `Tool Swap Timeline — ${part}`,
  category: 'Tooling', description: `Die-set removal history for part ${part}.`, tags,
  fields: { part, events }, latest: 1, versions: [{ version: 1, updated: '2026-07-29' }], hasSource
}))

// Deterministic mini "spark" bars from a module's event count — a stand-in
// preview until we render real thumbnails.
function sparkHeights(seed) {
  return Array.from({ length: 10 }, (_, i) => 30 + ((seed * 7 + i * 37) % 55))
}

export default function App() {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('updated')
  const [category, setCategory] = useState('All')
  const [activeTags, setActiveTags] = useState(() => new Set())
  const [libDir, setLibDir] = useState('')

  async function reload() {
    if (!api) { setEntries(SAMPLE); setLibDir('(browser preview — no Electron)'); setLoading(false); return }
    setLoading(true)
    const [list, dir] = await Promise.all([api.list(), api.libraryDir()])
    setEntries(list)
    setLibDir(dir)
    setLoading(false)
  }

  useEffect(() => { reload() }, [])

  const categories = useMemo(() => {
    const c = new Map()
    for (const e of entries) c.set(e.category, (c.get(e.category) || 0) + 1)
    return [['All', entries.length], ...[...c.entries()].sort()]
  }, [entries])

  const tagCounts = useMemo(() => {
    const t = new Map()
    for (const e of entries) for (const tag of e.tags) t.set(tag, (t.get(tag) || 0) + 1)
    return [...t.entries()].sort((a, b) => b[1] - a[1])
  }, [entries])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = entries.filter((e) => {
      if (category !== 'All' && e.category !== category) return false
      if (activeTags.size && !e.tags.some((t) => activeTags.has(t))) return false
      if (!q) return true
      const hay = [e.title, e.id, e.description, ...(e.tags || []), e.fields?.part]
        .filter(Boolean).join(' ').toLowerCase()
      return hay.includes(q)
    })
    const updatedOf = (e) => e.versions.at(-1)?.updated || ''
    list = [...list].sort((a, b) => {
      if (sort === 'title') return a.title.localeCompare(b.title)
      if (sort === 'swaps') return (b.fields?.events || 0) - (a.fields?.events || 0)
      return updatedOf(b).localeCompare(updatedOf(a))
    })
    return list
  }, [entries, query, sort, category, activeTags])

  function toggleTag(tag) {
    setActiveTags((prev) => {
      const next = new Set(prev)
      next.has(tag) ? next.delete(tag) : next.add(tag)
      return next
    })
  }

  async function onImport() {
    if (!api) return
    const res = await api.importModules()
    if (!res?.canceled) reload()
  }

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand"><span className="mark">S</span> ShopDeck</div>
        <span className="count">{entries.length} module{entries.length === 1 ? '' : 's'}</span>
      </div>

      <div className="toolbar">
        <div className="search">
          <TextInput
            label="Search"
            value={query}
            onChange={(v) => setQuery(v)}
            placeholder="Search part, tag, or title"
            hasClear
          />
        </div>
        <div className="spacer" />
        <SegmentedControl value={sort} onChange={setSort}>
          <SegmentedControlItem value="updated" label="Updated" />
          <SegmentedControlItem value="title" label="Name" />
          <SegmentedControlItem value="swaps" label="Swaps" />
        </SegmentedControl>
        <Button label="Import" variant="primary" onClick={onImport} />
      </div>

      <div className="main">
        <aside className="sidebar">
          <div className="side-h">Category</div>
          {categories.map(([name, n]) => (
            <div
              key={name}
              className={'side-row' + (category === name ? ' active' : '')}
              onClick={() => setCategory(name)}
            >
              <span>{name}</span><span className="n">{n}</span>
            </div>
          ))}

          {tagCounts.length > 0 && <div className="side-h">Tags</div>}
          <div className="side-tags">
            {tagCounts.map(([tag, n]) => (
              <span key={tag} onClick={() => toggleTag(tag)} style={{ cursor: 'pointer', opacity: activeTags.size && !activeTags.has(tag) ? 0.45 : 1 }}>
                <Token label={`${tag} ${n}`} color={activeTags.has(tag) ? 'blue' : 'default'} size="sm" />
              </span>
            ))}
          </div>
        </aside>

        <main className="content">
          {loading && <div className="empty">Loading library…</div>}
          {!loading && shown.length === 0 && (
            <div className="empty">
              {entries.length === 0
                ? 'No modules yet. Click Import to add one, or run the seed script.'
                : 'No modules match your filters.'}
            </div>
          )}
          {!loading && shown.length > 0 && (
            <div className="grid">
              {shown.map((e) => (
                <div key={e.id} className="card" onClick={() => api?.open(e.id)} title="Open module">
                  <div className="card-top">
                    <div>
                      <div className="part">{e.fields?.part || e.title}</div>
                      <div className="muted">{e.type.replace(/-/g, ' ')}</div>
                    </div>
                    <Badge label={`v${e.latest}`} variant="neutral" />
                  </div>

                  <div className="spark">
                    {sparkHeights(e.fields?.events || e.id.length).map((h, i) => (
                      <span key={i} style={{ height: h + '%' }} />
                    ))}
                  </div>

                  <div className="card-foot">
                    <span>{(e.fields?.events ?? 0).toLocaleString()} swaps</span>
                    {e.hasSource
                      ? <Button label="Source" variant="ghost" onClick={(ev) => { ev.stopPropagation(); api?.showSource(e.id) }} />
                      : <span className="muted">no source</span>}
                  </div>

                  <div className="tags">
                    {(e.tags || []).slice(0, 3).map((t) => <Token key={t} label={t} color="default" size="sm" />)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      <div className="footer">
        <span>Library:</span> <code>{libDir || '—'}</code>
      </div>
    </div>
  )
}

// Tool-swap timeline generator. Turns the standard workbook (a "Swap Log" sheet
// of events + a "By Position" sheet of lanes) into a module in the EXACT current
// timeline format: it builds the `DATA` object and injects it into a real
// timeline HTML template, so all CSS/JS/structure stay byte-identical.
import XLSX from 'xlsx'

const slug = (s) => String(s).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
const num = (v) => {
  if (v == null || v === '') return null
  const n = Number(String(v).replace(/,/g, '').replace(/[^0-9.\-]/g, ''))
  return Number.isFinite(n) ? n : null
}
const asDate = (v) => { const s = v == null ? '' : String(v).trim(); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null }
const str = (v) => (v == null || v === '' ? null : String(v).trim())

const rowsOf = (wb, name) => XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null, raw: false })
const findSheet = (wb, want) => wb.SheetNames.find((n) => n.toLowerCase().includes(want))

// The group number is the operation's fixed rank in the forging sequence, not its
// order of appearance — a part missing Blocker still numbers Finish as 3.
const OP_SEQUENCE = ['preform', 'blocker', 'finish', 'pierce / strip', 'trim']
const normOp = (op) => String(op).toLowerCase().replace(/\s*\/\s*/g, ' / ').replace(/\s+/g, ' ').trim()

/** Build the timeline DATA object (+ derived metadata) from a parsed workbook. */
export function buildData(wb) {
  const posName = findSheet(wb, 'position')
  const logName = findSheet(wb, 'log') || findSheet(wb, 'swap')
  if (!posName || !logName) throw new Error('Workbook needs a "By Position" and a "Swap Log" sheet.')

  // ---- lanes (from By Position, in sheet order) ----
  const pos = rowsOf(wb, posName)
  const pHead = pos.findIndex((r) => r && r.includes('Operation') && r.includes('Tool'))
  if (pHead < 0) throw new Error('"By Position" sheet is missing its header row.')
  const opOrder = []
  const lanes = []
  const toolMap = new Map()
  const opNum = new Map()
  let nextUnknown = OP_SEQUENCE.length + 1
  for (const r of pos.slice(pHead + 1)) {
    const operation = str(r[0]); const tool = str(r[2])
    if (!operation || !tool) continue
    if (!opOrder.includes(operation)) opOrder.push(operation)
    if (!opNum.has(operation)) {
      const idx = OP_SEQUENCE.indexOf(normOp(operation))
      opNum.set(operation, idx >= 0 ? idx + 1 : nextUnknown++)
    }
    const group = `${opNum.get(operation)} · ${operation}`
    const lane = lanes.length
    const desc = str(r[3]) || ''
    lanes.push({ lane, group, tool, desc })
    toolMap.set(tool, { lane, group, desc, item: num(r[1]) })
  }
  if (!lanes.length) throw new Error('No tool positions found in "By Position".')

  // ---- events (from Swap Log) ----
  const log = rowsOf(wb, logName)
  const lHead = log.findIndex((r) => r && r.includes('Remove Date') && r.includes('Tool'))
  if (lHead < 0) throw new Error('"Swap Log" sheet is missing its header row.')
  const H = log[lHead]
  const c = (name) => H.indexOf(name)
  const cx = {
    removed: c('Remove Date'), shift: c('Shift'), item: c('Item'), tool: c('Tool'),
    rev: c('Rev'), serial: c('Serial Out'), reason: c('Removed For'),
    age: c('Age (hits)'), install: c('Installed'), days: c('Days In Press')
  }
  const events = []
  const dates = []
  for (const r of log.slice(lHead + 1)) {
    const tool = str(r[cx.tool]); const removed = asDate(r[cx.removed])
    if (!tool || !removed) continue
    const lm = toolMap.get(tool)
    if (!lm) continue
    const install = asDate(r[cx.install])
    events.push({
      lane: lm.lane, group: lm.group, tool, desc: lm.desc,
      item: num(r[cx.item]) ?? lm.item, rev: str(r[cx.rev]),
      serial: str(r[cx.serial]), install, removed,
      shift: num(r[cx.shift]),
      reason: str(r[cx.reason]) || 'Reason Not Listed',
      age: num(r[cx.age]), days: install ? num(r[cx.days]) : null
    })
    dates.push(removed)
    if (install) dates.push(install)
  }
  if (!events.length) throw new Error('No swap events found in "Swap Log".')
  dates.sort()

  // ---- part number (from the Swap Log title banner) ----
  const banner = (log.find((r) => r && typeof r[0] === 'string' && /Part\s+[\w-]+/i.test(r[0])) || [])[0] || ''
  const part = (String(banner).match(/Part\s+([\w-]+)/i) || [])[1] || null

  return {
    data: { part, lanes, events, dmin: dates[0], dmax: dates[dates.length - 1] },
    part, operations: opOrder, tags: opOrder.map(slug)
  }
}

const iso = (d) => d // caller passes a YYYY-MM-DD string (Date.now avoided in pure code)

/** Build the module manifest for a generated timeline. `today` = YYYY-MM-DD. */
export function buildManifest({ part, tags, events, dmin, dmax, today }) {
  return {
    schema: 1, id: `tool-swap-timeline_${part}`, type: 'tool-swap-timeline',
    title: `Tool Swap Timeline — ${part}`, version: 1,
    created: iso(today), updated: iso(today), category: 'Tooling', tags,
    description: `Die-set removal history for part ${part}.`, source: null,
    fields: {
      part, partFamily: String(part).split('-')[0], events: events.length,
      dateRange: { from: dmin, to: dmax }
    }
  }
}

/** Inject DATA + manifest + title into the template. Everything else is untouched. */
export function generateHtml(template, data, manifest) {
  let html = template
  html = html.replace(
    /const DATA\s*=\s*\{[\s\S]*?\};\s*\r?\ndocument\.title/,
    `const DATA = ${JSON.stringify(data)};\ndocument.title`
  )
  html = html.replace(
    /<script[^>]*id=["']module-manifest["'][^>]*>[\s\S]*?<\/script>/i,
    `<script type="application/json" id="module-manifest">\n${JSON.stringify(manifest, null, 2)}\n</script>`
  )
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${manifest.title}</title>`)
  return html
}

/** Full pipeline: workbook path/buffer + template → { html, part, manifest }. */
export function generateTimeline({ wb, template, today }) {
  const { data, part, tags } = buildData(wb)
  if (!part) throw new Error('Could not determine the part number from the workbook title.')
  const manifest = buildManifest({ part, tags, events: data.events, dmin: data.dmin, dmax: data.dmax, today })
  return { html: generateHtml(template, data, manifest), part, manifest, data }
}

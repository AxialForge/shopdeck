// Tests for the tool-swap timeline generator. Builds a synthetic workbook in
// memory (no external files) and checks the DATA transform, incl. the fixed
// operation numbering and blank-Installed → install:null rule.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import XLSX from 'xlsx'
import { buildData, buildManifest, generateHtml } from '../electron/generators/timeline.js'

const POS_HEADER = ['Operation', 'Item', 'Tool', 'Description', 'Swaps', 'First', 'Last', 'Avg Age (hits)', 'Avg Days', 'Broken']
const LOG_HEADER = ['Remove Date', 'Shift', 'Operation', 'Item', 'Tool', 'Description', 'Rev', 'Serial Out', 'Removed For', 'Age (hits)', 'Installed', 'Days In Press', 'Serial In (next)']

function makeWorkbook({ positions, events, title }) {
  const wb = XLSX.utils.book_new()
  const log = [[title], ['subtitle'], [], LOG_HEADER, ...events]
  const pos = [['Swaps by Die Position'], [], POS_HEADER, ...positions]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(log), 'Swap Log')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pos), 'By Position')
  return wb
}

test('buildData numbers operations by the fixed forging sequence, not appearance', () => {
  // A part with only Finish + Trim: Finish must still be 3 and Trim 5.
  const wb = makeWorkbook({
    title: 'Tool Swap Timeline — Part 99-1000-01',
    positions: [
      ['Finish', '6', 'A1FD1', 'TOP FINISH DIE', '2', '', '', '', '', '0'],
      ['Trim', '4', 'A1TD', 'TRIM BLADE', '1', '', '', '', '', '0']
    ],
    events: [
      ['2026-05-10', '1', 'Finish', '6', 'A1FD1', 'TOP FINISH DIE', 'A1', '001002', 'Wear', '10,000', '2026-04-01', '39', 'still in press'],
      ['2026-04-01', '2', 'Finish', '6', 'A1FD1', 'TOP FINISH DIE', 'A1', '001001', 'Broken', '5,000', '', '', '001002'],
      ['2026-03-15', '1', 'Trim', '4', 'A1TD', 'TRIM BLADE', 'A', '002001', 'Wear', '20,000', '', '', 'still in press']
    ]
  })
  const { data, part, tags } = buildData(wb)
  assert.equal(part, '99-1000-01')
  assert.deepEqual(data.lanes.map((l) => l.group), ['3 · Finish', '5 · Trim'])
  assert.deepEqual(tags, ['finish', 'trim'])
})

test('buildData maps event fields and treats blank Installed as install:null', () => {
  const wb = makeWorkbook({
    title: 'Tool Swap Timeline — Part 99-2000-01',
    positions: [['Preform', '3', 'A2PD1', 'TOP PREFORM DIE', '2', '', '', '', '', '0']],
    events: [
      ['2026-06-01', '1', 'Preform', '3', 'A2PD1', 'TOP PREFORM DIE', 'A', '000200', 'Wear', '12,345', '2026-05-01', '31', 'still in press'],
      ['2026-05-01', '3', 'Preform', '3', 'A2PD1', 'TOP PREFORM DIE', 'A', '000100', 'Wear', '9,000', '', '', '000200']
    ]
  })
  const { data } = buildData(wb)
  assert.equal(data.events.length, 2)
  const firstRun = data.events.find((e) => e.serial === '000100')
  assert.equal(firstRun.install, null, 'blank Installed → null (the ◆ marker)')
  assert.equal(firstRun.days, null, 'no days without an install')
  const second = data.events.find((e) => e.serial === '000200')
  assert.equal(second.install, '2026-05-01')
  assert.equal(second.days, 31)
  assert.equal(second.age, 12345, 'commas stripped from age')
  assert.equal(second.shift, 1)
  assert.equal(second.group, '1 · Preform')
  assert.equal(data.dmin, '2026-05-01')
  assert.equal(data.dmax, '2026-06-01')
})

test('generateHtml injects DATA, manifest, and title into the template', () => {
  const template =
    '<html><head><title>OLD</title>\n' +
    '<script type="application/json" id="module-manifest">\n{"old":true}\n</script>\n' +
    '<script>\nconst DATA = {"part":"OLD"};\ndocument.title = DATA.part;\n</script></head><body></body></html>'
  const data = { part: '99-3000-01', lanes: [], events: [], dmin: '2026-01-01', dmax: '2026-02-01' }
  const manifest = buildManifest({ part: '99-3000-01', tags: ['preform'], events: [], dmin: '2026-01-01', dmax: '2026-02-01', today: '2026-07-31' })
  const html = generateHtml(template, data, manifest)
  assert.match(html, /const DATA = \{"part":"99-3000-01"/)
  assert.match(html, /"id": "tool-swap-timeline_99-3000-01"/)
  assert.match(html, /<title>Tool Swap Timeline — 99-3000-01<\/title>/)
  assert.ok(!html.includes('"old":true'), 'old manifest replaced')
  assert.ok(!html.includes('const DATA = {"part":"OLD"'), 'old DATA replaced')
})

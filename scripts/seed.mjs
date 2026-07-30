// Seed the default ShopDeck library with the existing timeline modules.
// Copies them (and their .xlsx sources) into:
//   <Documents>\ShopDeck Library\Tooling\Timelines\
// The app scans that root on launch and snapshots versions into .shopdeck.
import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { resolve, join, basename, extname } from 'node:path'

const ROOT = join(homedir(), 'Documents', 'ShopDeck Library')
const DEST = join(ROOT, 'Tooling', 'Timelines')
const SRC = resolve(import.meta.dirname, '..', '..', 'Part timeline plus timeline', 'Timelines')

async function main() {
  let files
  try { files = (await fs.readdir(SRC)).filter((f) => /\.html?$/i.test(f)) }
  catch { console.error(`Source not found: ${SRC}`); process.exit(1) }

  await fs.mkdir(DEST, { recursive: true })
  console.log(`Copying ${files.length} modules into:\n  ${DEST}\n`)

  let n = 0
  for (const f of files) {
    await fs.copyFile(join(SRC, f), join(DEST, f))
    const base = basename(f, extname(f))
    for (const ext of ['.xlsx', '.xls', '.csv']) {
      const src = join(SRC, base + ext)
      try { await fs.access(src); await fs.copyFile(src, join(DEST, base + ext)) } catch { /* no source */ }
    }
    console.log(`  ${f}`)
    n++
  }
  console.log(`\nDone. ${n} modules seeded. Launch with: npm run dev`)
}
main()

// Seed the ShopDeck library from the existing tool-swap timeline modules.
// Run once: npm run seed
import { promises as fs } from 'node:fs'
import { resolve, join, basename, extname } from 'node:path'
import { importModule } from '../electron/library.js'

const ROOT = resolve(import.meta.dirname, '..')
const LIB = join(ROOT, 'library')
const SRC = resolve(ROOT, '..', 'Part timeline plus timeline', 'Timelines')

async function siblingSource(htmlPath) {
  const dir = resolve(htmlPath, '..')
  const base = basename(htmlPath, extname(htmlPath))
  for (const ext of ['.xlsx', '.xls', '.csv']) {
    const cand = join(dir, base + ext)
    try { await fs.access(cand); return cand } catch { /* keep looking */ }
  }
  return null
}

async function main() {
  let files
  try {
    files = (await fs.readdir(SRC)).filter((f) => f.toLowerCase().endsWith('.html'))
  } catch {
    console.error(`Source folder not found: ${SRC}`)
    process.exit(1)
  }
  console.log(`Seeding ${files.length} modules from:\n  ${SRC}\ninto:\n  ${LIB}\n`)

  let ok = 0
  for (const f of files) {
    const htmlPath = join(SRC, f)
    try {
      const src = await siblingSource(htmlPath)
      const { entry, action } = await importModule({ htmlPath, sourcePath: src, libDir: LIB })
      console.log(`  ${action.padEnd(11)} ${entry.id}  (${entry.fields?.events ?? '?'} events${src ? ', +source' : ''})`)
      ok++
    } catch (err) {
      console.log(`  FAILED      ${f}: ${err.message}`)
    }
  }
  console.log(`\nDone. ${ok}/${files.length} modules in the library.`)
}

main()

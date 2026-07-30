// Manual, user-initiated update check — the ONLY code path that touches the
// network. Adapted from the AxialForge/JDot manual updater: no launch check, no
// interval, nothing downloads or installs without an explicit click.
//   - network touched only on check()  (Settings → Check for updates)
//   - a build downloads only on download()
//   - it installs only on install()
// Drives electron-updater against the GitHub release feed (see electron-builder.yml
// publish block). electron-updater is bundled at build; in dev (unpacked) it
// no-ops, so check() guards on isUpdaterActive() and says so plainly.

import electronUpdater from 'electron-updater'
const { autoUpdater } = electronUpdater

let wired = false
let emit = () => {}

/** Route updater events to the renderer. */
export function onStatus(cb) { emit = typeof cb === 'function' ? cb : () => {} }

function friendlyError(err) {
  const msg = (err && err.message ? err.message : String(err)) || 'Update check failed.'
  if (/not packed|dev update config/i.test(msg)) return 'Updates only work in the installed app, not when running from source.'
  if (/net::|ENOTFOUND|EAI_AGAIN|getaddrinfo|ETIMEDOUT|ECONNREFUSED/i.test(msg)) return "Couldn't reach GitHub — check your internet connection and try again."
  if (/404|no published versions|latest\.yml/i.test(msg)) return 'No update information was found for this release.'
  return msg.split('\n')[0].slice(0, 200)
}

function configure() {
  if (wired) return
  wired = true
  autoUpdater.autoDownload = false        // never fetch a build without a click
  autoUpdater.autoInstallOnAppQuit = false // and never install one silently
  autoUpdater.allowDowngrade = false
  autoUpdater.allowPrerelease = false
  autoUpdater.fullChangelog = false
  autoUpdater.on('checking-for-update', () => emit({ state: 'checking' }))
  autoUpdater.on('update-available', (i) => emit({ state: 'available', version: i?.version || null }))
  autoUpdater.on('update-not-available', (i) => emit({ state: 'current', version: i?.version || null }))
  autoUpdater.on('download-progress', (p) => emit({ state: 'downloading', percent: Math.round(p?.percent || 0) }))
  autoUpdater.on('update-downloaded', (i) => emit({ state: 'downloaded', version: i?.version || null }))
  autoUpdater.on('error', (err) => emit({ state: 'error', message: friendlyError(err) }))
}

/** The one network call the app makes. */
export async function check() {
  configure()
  if (!autoUpdater.isUpdaterActive()) {
    emit({ state: 'error', message: 'Updates only work in the installed app, not when running from source.' })
    return { ok: false, error: 'not-packaged' }
  }
  try { const res = await autoUpdater.checkForUpdates(); return { ok: true, version: res?.updateInfo?.version || null } }
  catch (err) { emit({ state: 'error', message: friendlyError(err) }); return { ok: false, error: friendlyError(err) } }
}

export async function download() {
  configure()
  try { await autoUpdater.downloadUpdate(); return { ok: true } }
  catch (err) { emit({ state: 'error', message: friendlyError(err) }); return { ok: false, error: friendlyError(err) } }
}

export function install() {
  configure()
  setImmediate(() => autoUpdater.quitAndInstall(false, true)) // show installer UI, relaunch after
  return { ok: true }
}

/** SHOPDECK_NO_UPDATES in the env is an enforced off the user's setting can't override. */
export function updatesAllowed({ env = {}, showUpdater } = {}) {
  if (env.SHOPDECK_NO_UPDATES) return { enabled: false, enforced: true }
  return { enabled: showUpdater !== false, enforced: false }
}

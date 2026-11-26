import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { db } from '@/db'
import { cachedToken, clearToken, hasRefreshToken, preloadGis, refreshAccessToken, requestToken, revokeToken, setWorkerUrl } from '@/lib/google/gis'
import { DriveAuthError } from '@/lib/google/drive'
import { backUpNow as backUpNowEngine, listBackupInfos, restoreBackup, runSync, syncFlags, type BackupInfo } from '@/lib/google/syncEngine'
import { useSettings } from './settings'
import { useUi } from './ui'

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'dirty' | 'error' | 'login'

/** Keeps this device and the Google spreadsheet in step: on open, a few seconds after a change, when leaving, and on demand. */
export const useSync = defineStore('sync', () => {
  const settings = useSettings()
  const ui = useUi()
  const status = ref<SyncStatus>('off')
  const error = ref('')
  const connected = ref(hasRefreshToken())
  let timer: ReturnType<typeof setTimeout> | undefined
  let running: Promise<void> | null = null
  let dirty = false
  /** bumps on every local change, so a sync can tell whether something was edited while it ran */
  let version = 0
  /** true only during the first sync after opening the app: edits wait so they never land on stale local data */
  const startupLock = ref(false)
  /** a sync the user started by hand is running: UiLayer shows a "同步中" toast for it */
  const manualBusy = ref(false)
  const STARTUP_LOCK_MAX_MS = 6000

  /** call where an edit starts: false (with a toast) while the first sync is still running */
  function guardEdit(): boolean {
    if (!startupLock.value) return true
    ui.toast('同步中，完成後才能編輯', 'info')
    return false
  }

  const refreshWorker = () => setWorkerUrl(settings.workerUrl())
  watch(() => settings.s.workerUrl, refreshWorker, { immediate: true })

  function init() {
    refreshWorker()
    if (settings.workerUrl()) preloadGis()
    // any local change schedules a sync; the writes a sync makes itself do not
    for (const t of db.tables) {
      if (t.name === 'images' || t.name === 'meta') continue
      t.hook('creating', () => void touch())
      t.hook('updating', () => void touch())
      t.hook('deleting', () => void touch())
    }
    watch(() => [settings.s.ratings, settings.s.units], touch, { deep: true })
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && dirty) void syncNow(true)
    })
    window.addEventListener('online', () => dirty && void syncNow(true))
    if (connected.value) {
      // offline can't pull anything, so don't lock; the cap keeps a slow network from locking the app
      if (navigator.onLine) {
        startupLock.value = true
        setTimeout(() => (startupLock.value = false), STARTUP_LOCK_MAX_MS)
      }
      void syncNow(true)
    } else status.value = 'off'
  }

  function touch() {
    if (syncFlags.applying || !connected.value) return
    dirty = true
    version++
    if (status.value === 'idle') status.value = 'dirty'
    clearTimeout(timer)
    timer = setTimeout(() => void syncNow(true), 6000)
  }

  async function token(interactive: boolean): Promise<string | null> {
    const cached = cachedToken()
    if (cached) return cached
    const renewed = await refreshAccessToken()
    if (renewed) return renewed
    if (!interactive) return null
    return requestToken()
  }

  /** must be called straight from a click: the Google window is blocked otherwise */
  async function connect() {
    refreshWorker()
    try {
      await requestToken(true)
      connected.value = true
      ui.toast('已連線 Google', 'success')
      await syncNow(false)
    } catch (e) {
      ui.toast((e as Error).message, 'error')
    }
  }

  async function disconnect() {
    await revokeToken()
    connected.value = false
    status.value = 'off'
    error.value = ''
    settings.s.dataFileId = ''
  }

  function syncNow(quiet = false): Promise<void> {
    if (running) return running
    clearTimeout(timer)
    running = (async () => {
      const startedAt = version
      status.value = 'syncing'
      if (!quiet) manualBusy.value = true
      error.value = ''
      try {
        const t = await token(false)
        if (!t) {
          status.value = 'login'
          if (!quiet) ui.toast('需要重新連線 Google', 'error')
          return
        }
        const r = await runSync({
          token: t,
          ids: settings.s,
          shared: { get: settings.sharedValues, apply: settings.applyShared },
          save: (ids) => Object.assign(settings.s, ids),
          onMerged: () => (startupLock.value = false),
        })
        settings.s.lastSyncAt = Date.now()
        if (version === startedAt) {
          dirty = false
          status.value = 'idle'
        } else {
          // edited while syncing: that change may have missed this round, so go again
          status.value = 'dirty'
          timer = setTimeout(() => void syncNow(true), 1000)
        }
        if (!quiet) ui.toast(r.pulled ? `同步完成，更新 ${r.pulled} 筆` : '同步完成', 'success')
      } catch (e) {
        if (e instanceof DriveAuthError) {
          clearToken()
          status.value = 'login'
        } else status.value = 'error'
        error.value = (e as Error).message
        if (!quiet) ui.toast(error.value, 'error')
      } finally {
        running = null
        manualBusy.value = false
        startupLock.value = false
      }
    })()
    return running
  }

  // ---- backups kept in Drive: a daily one (3 kept) and ones made by hand (3 kept) ----
  const backups = ref<BackupInfo[]>([])
  const backupBusy = ref(false)
  const options = (t: string) => ({
    token: t,
    ids: settings.s,
    shared: { get: settings.sharedValues, apply: settings.applyShared },
    save: (ids: Partial<{ dataFileId: string }>) => Object.assign(settings.s, ids),
  })
  /** runs `job` with a token, reporting a failure as a toast */
  async function withToken(job: (t: string) => Promise<void>) {
    if (backupBusy.value) return
    backupBusy.value = true
    try {
      const t = await token(false)
      if (!t) {
        status.value = 'login'
        return ui.toast('需要重新連線 Google', 'error')
      }
      await job(t)
    } catch (e) {
      ui.toast((e as Error).message, 'error')
    } finally {
      backupBusy.value = false
    }
  }
  const loadBackups = () => withToken(async (t) => void (backups.value = await listBackupInfos(t)))
  /** syncs first so the copy holds everything on this device */
  const backUpNow = () =>
    withToken(async (t) => {
      await syncNow(true)
      await backUpNowEngine(options(t))
      backups.value = await listBackupInfos(t)
      ui.toast('已備份', 'success')
    })
  /** the current state is kept as a manual backup first, so a restore can itself be undone */
  const restore = (id: string) =>
    withToken(async (t) => {
      await syncNow(true)
      await backUpNowEngine(options(t))
      await restoreBackup(options(t), id)
      await syncNow(true)
      backups.value = await listBackupInfos(t)
      ui.toast('已還原', 'success')
    })

  return { status, error, startupLock, manualBusy, guardEdit, connected, init, connect, disconnect, syncNow, backups, backupBusy, loadBackups, backUpNow, restore }
})

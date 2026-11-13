import { ref } from 'vue'
import { registerSW } from 'virtual:pwa-register'
import { useUi } from '@/stores/ui'

/** how often an open app asks the server whether a new version is out */
const CHECK_EVERY_MS = 60 * 60 * 1000

/** a new version has been downloaded and waits for a reload */
export const updateReady = ref(false)
export const checking = ref(false)

let reg: ServiceWorkerRegistration | undefined
let reload: ((reloadPage?: boolean) => Promise<void>) | undefined

function offer() {
  useUi().toast('有新版本可以使用', 'info', { label: '更新', run: applyUpdate }, 20_000)
}

/** Registers the service worker, and looks for new versions now and then and whenever the app comes back to the front. */
export function initUpdater() {
  reload = registerSW({
    immediate: true,
    onNeedRefresh() {
      updateReady.value = true
      offer()
    },
    onRegisteredSW(_url, r) {
      reg = r
      if (!r) return
      setInterval(() => void r.update().catch(() => {}), CHECK_EVERY_MS)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void r.update().catch(() => {})
      })
    },
  })
}

/** Reload into the new version. */
export function applyUpdate() {
  void reload?.(true)
}

/** The "check for updates" button: look now and say what was found. */
export async function checkForUpdate() {
  const ui = useUi()
  if (updateReady.value) return offer()
  if (!reg) return ui.toast('目前的環境不支援更新檢查', 'info')
  checking.value = true
  try {
    await reg.update()
    // a found update downloads first; give it a moment to report
    await new Promise((r) => setTimeout(r, 1500))
    if (!updateReady.value) ui.toast('已是最新版本', 'success')
  } catch {
    ui.toast('檢查失敗，請確認網路連線', 'error')
  } finally {
    checking.value = false
  }
}

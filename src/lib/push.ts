/** Browser side of the background reminders: the push subscription and the Worker calls (see worker/src/push.js). */
export type { PushSlot } from './reminders'
import type { PushSlot } from './reminders'

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

async function call<T>(workerUrl: string, path: string, body?: unknown, keepalive = false): Promise<T> {
  const base = workerUrl.trim().replace(/\/+$/, '')
  if (!base) throw new Error('請先到「設定」填入 Worker 網址')
  let res: Response
  try {
    res = await fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      keepalive,
    })
  } catch {
    throw new Error('無法連線到 Worker')
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string } & T
  if (!res.ok) {
    if (data.error === 'push_not_configured') throw new Error('Worker 尚未設定推播（VAPID 金鑰）')
    if (data.error === 'subscription_expired') throw new Error('這台裝置的推播訂閱已失效，請關閉再重新開啟')
    throw new Error(data.error ?? `Worker 回應 ${res.status}`)
  }
  return data
}

const keyBytes = (b64u: string) => Uint8Array.from(atob(b64u.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

export async function currentSubscription() {
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

/** Ask for permission and subscribe this device. */
export async function subscribePush(workerUrl: string): Promise<PushSubscription> {
  if (!pushSupported()) throw new Error('這個瀏覽器不支援推播通知（iPhone 請先加入主畫面再開啟）')
  const { publicKey } = await call<{ publicKey: string }>(workerUrl, '/push/key')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('通知權限被拒絕，請到瀏覽器或系統設定開啟')
  const reg = await navigator.serviceWorker.ready
  // a subscription made with another key (a redeployed Worker) can never be sent to
  await (await reg.pushManager.getSubscription())?.unsubscribe()
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) })
}

export async function unsubscribePush(workerUrl: string, group: string) {
  const sub = await currentSubscription()
  if (!sub) return
  const endpoint = sub.endpoint
  await sub.unsubscribe().catch(() => {})
  if (workerUrl.trim()) await call(workerUrl, '/push/unsubscribe', { endpoint, group }).catch(() => {})
}

export async function uploadSlots(workerUrl: string, sub: PushSubscription, slots: PushSlot[], group: string, keepalive = false) {
  await call(workerUrl, '/push/sync', { subscription: sub.toJSON(), slots, group }, keepalive)
}

export async function sendTestPush(workerUrl: string, sub: PushSubscription, group: string) {
  await call(workerUrl, '/push/test', { endpoint: sub.endpoint, group })
}

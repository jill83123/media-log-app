<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { today } from '@/lib/date'
import { applyData, exportData, isDataFile } from '@/lib/google/syncEngine'
import { useSettings } from '@/stores/settings'
import { useUi } from '@/stores/ui'
import { useSync } from '@/stores/sync'
import { useData } from '@/stores/data'
import { loadDemo, clearAll } from '@/lib/demo'
import { Check, Cloud, Download, History, LogOut, RefreshCw, Upload } from '@/lib/uiIcons'
import BottomSheet from '@/components/BottomSheet.vue'
import PageHeader from '@/components/PageHeader.vue'

const settings = useSettings()
const ui = useUi()
const sync = useSync()
const data = useData()
async function addDemo() {
  if (data.works.length && !(await ui.confirm('載入示範資料？', { message: '會在現有作品之外再加入一批假資料。', confirmText: '載入' }))) return
  await loadDemo()
  ui.toast('已載入示範資料', 'success')
}
async function wipe() {
  if (!(await ui.confirm('清除所有資料？', { message: '所有作品、紀錄、標籤、分類與系列都會刪除（連線 Google 時，下次同步也會一併刪除）。', danger: true, confirmText: '清除' }))) return
  await clearAll()
  ui.toast('已清除所有資料', 'success')
}
const syncText = computed(() => {
  const last = settings.s.lastSyncAt ? `上次同步 ${new Date(settings.s.lastSyncAt).toLocaleString('zh-TW', { hour12: false })}` : '尚未同步'
  switch (sync.status) {
    case 'syncing': return '同步中…'
    case 'dirty': return `有尚未同步的變更。${last}`
    case 'login': return '需要重新連線 Google'
    case 'error': return `同步失敗：${sync.error}`
    default: return last
  }
})
const backupOpen = ref(false)
const byKind = (k: string) => sync.backups.filter((b) => b.kind === k)
const loaded = ref(false)
watch(
  () => sync.connected,
  async (c) => {
    if (c) {
      await sync.loadBackups()
      loaded.value = true
    }
  },
  { immediate: true },
)
async function restore(id: string, label: string) {
  if (await ui.confirm(`還原到 ${label} 的備份？`, { message: '會用備份取代目前的資料；還原前會先把現在的資料另存一份手動備份。', confirmText: '還原' })) await sync.restore(id)
}
const shared = { get: settings.sharedValues, apply: settings.applyShared }
const fileInput = ref<HTMLInputElement>()
async function exportJson() {
  const blob = new Blob([JSON.stringify(await exportData(shared))], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `media-log-${today()}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
async function importJson(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  let parsed: unknown
  try {
    parsed = JSON.parse(await file.text())
  } catch {
    return ui.toast('這不是有效的 JSON 檔', 'error')
  }
  if (!isDataFile(parsed)) return ui.toast('這個檔案不是本 App 匯出的資料', 'error')
  if (!(await ui.confirm('匯入這個檔案？', { message: '會用檔案內容取代目前的資料（封面圖片不包含在檔案裡）。', danger: true, confirmText: '匯入' }))) return
  await applyData(shared, parsed)
  if (sync.connected) void sync.syncNow(true)
  ui.toast('已匯入', 'success')
}
async function disconnect() {
  if (await ui.confirm('中斷 Google 連線？', { message: '雲端上的資料與本機資料都會保留。', confirmText: '中斷連線' })) await sync.disconnect()
}
</script>

<template>
  <PageHeader title="同步與服務" back="/settings" />
  <h2 class="section-title">Google 雲端硬碟</h2>
  <div v-if="!sync.connected" class="card mb-5 space-y-3">
    <p class="text-xs text-muted">備份並同步到各裝置。</p>
    <button class="btn btn-primary w-full" @click="sync.connect()"><Cloud :size="17" />連線 Google 雲端硬碟</button>
  </div>
  <div v-else class="card mb-5">
    <div class="flex items-center gap-3">
      <div class="min-w-0 flex-1">
        <p class="flex items-center gap-1.5 font-semibold">已連線<Check :size="16" class="text-success" /></p>
        <p class="mt-0.5 text-xs" :class="sync.status === 'error' || sync.status === 'login' ? 'text-danger' : 'text-muted'">{{ syncText }}</p>
      </div>
      <button class="icon-btn border-0 bg-transparent text-muted" aria-label="中斷連線" @click="disconnect"><LogOut :size="18" /></button>
      <button v-if="sync.status === 'login'" class="btn btn-primary" @click="sync.connect()">重新連線</button>
      <button v-else class="btn btn-primary" :disabled="sync.status === 'syncing'" @click="sync.syncNow()"><RefreshCw :size="16" :class="sync.status === 'syncing' && 'animate-spin'" />立即同步</button>
    </div>
  </div>

  <template v-if="sync.connected">
    <h2 class="section-title">雲端備份</h2>
    <div class="card mb-5 space-y-3">
      <p class="text-xs text-muted">自動與手動備份各保留最近 3 份。</p>
      <div class="grid grid-cols-2 gap-2">
        <button class="btn btn-soft" :disabled="sync.backupBusy" @click="sync.backUpNow()">立即備份</button>
        <button class="btn btn-soft" @click="backupOpen = true"><History :size="16" />{{ sync.backups.length ? `查看備份（${sync.backups.length}）` : '查看備份' }}</button>
      </div>
    </div>
  </template>

  <h2 class="section-title">資料</h2>
  <div class="card mb-5 space-y-3">
    <p class="text-xs text-muted">把所有資料存成 JSON 檔，或從檔案還原。匯入會取代目前的資料，封面圖片不包含在檔案裡。</p>
    <div class="grid grid-cols-2 gap-2">
      <button class="btn btn-soft" @click="exportJson"><Download :size="16" />匯出 JSON</button>
      <button class="btn btn-soft" @click="fileInput?.click()"><Upload :size="16" />匯入 JSON</button>
      <input ref="fileInput" type="file" accept="application/json,.json" class="hidden" @change="importJson" />
    </div>
  </div>

  <h2 class="section-title">服務網址</h2>
  <div class="card mb-5">
    <span class="label">Worker 網址（搜尋、Google 登入、推播）</span>
    <input v-model="settings.s.workerUrl" class="input" inputmode="url" placeholder="https://media-log-auth.xxx.workers.dev" />
  </div>

  <h2 class="section-title">測試與清除</h2>
  <ul class="card inset-divide mb-5 overflow-hidden p-0">
    <li><button class="flex w-full items-center gap-3 px-5 py-4 text-left transition active:bg-surface-2" @click="addDemo">載入示範資料</button></li>
    <li><button class="flex w-full items-center gap-3 px-5 py-4 text-left text-danger transition active:bg-surface-2" @click="wipe">清除所有資料</button></li>
  </ul>

  <BottomSheet v-model="backupOpen" title="雲端備份">
    <p class="text-xs text-muted">自動與手動備份各保留最近 3 份。</p>
    <template v-for="g in [{ kind: 'manual', title: '手動' }, { kind: 'auto', title: '自動' }]" :key="g.kind">
      <template v-if="byKind(g.kind).length">
        <h3 class="mt-4 mb-1 text-xs font-semibold text-muted">{{ g.title }}</h3>
        <ul class="text-sm">
          <li v-for="b in byKind(g.kind)" :key="b.id" class="flex items-center gap-2 py-2">
            <span class="flex-1">{{ b.label }}</span>
            <button class="text-xs font-semibold text-primary disabled:opacity-50" :disabled="sync.backupBusy" @click="restore(b.id, b.label)">還原</button>
          </li>
        </ul>
      </template>
    </template>
    <p v-if="!sync.backups.length" class="py-6 text-center text-sm text-muted">{{ loaded ? '還沒有備份' : '讀取中…' }}</p>
  </BottomSheet>
</template>

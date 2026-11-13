<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { themeById } from '@/lib/themes'
import { mergeRatings } from '@/lib/ratings'
import { workTypes } from '@/lib/meta'
import { useData } from '@/stores/data'
import { useSettings } from '@/stores/settings'
import { useSync } from '@/stores/sync'
import { applyUpdate, checkForUpdate, checking, updateReady } from '@/lib/updater'
import { ChevronRight } from '@/lib/uiIcons'

const version = __APP_VERSION__
const settings = useSettings()
const sync = useSync()
const data = useData()
const modeText = { system: '跟隨系統', light: '淺色', dark: '深色' } as const
const syncText = computed(() => (!sync.connected ? '未連線' : sync.status === 'error' || sync.status === 'login' ? '需要處理' : sync.status === 'syncing' ? '同步中' : '已連線'))

const groups = computed(() => [
  {
    title: '資料',
    items: [
      { to: '/manage/tags', label: '標籤', hint: `${data.tags.length} 個` },
      { to: '/manage/series', label: '系列', hint: `${data.series.length} 個` },
      { to: '/settings/types', label: '作品類型', hint: `${workTypes().length} 個` },
      { to: '/settings/ratings', label: '評分等級', hint: `${mergeRatings(settings.s.ratings).length} 級` },
    ],
  },
  {
    title: '一般',
    items: [
      { to: '/settings/appearance', label: '外觀', hint: `${themeById(settings.s.themeColor).name}、${modeText[settings.s.theme]}` },
      { to: '/settings/sources', label: '搜尋來源', hint: '依類型設定' },
      { to: '/settings/notify', label: '每日提醒', hint: settings.s.remindEnabled ? settings.s.remindTime : '關閉' },
      { to: '/settings/sync', label: '同步與服務', hint: syncText.value },
    ],
  },
])
</script>

<template>
  <header class="relative -mx-4 mb-3 flex min-h-14 items-center justify-center bg-bg px-4 py-2"><h1 class="text-xl font-bold">設定</h1></header>
  <template v-for="g in groups" :key="g.title">
    <h2 class="section-title">{{ g.title }}</h2>
    <ul class="card inset-divide mb-5 overflow-hidden p-0">
      <li v-for="i in g.items" :key="i.to">
        <RouterLink :to="i.to" class="flex items-center gap-2 px-5 py-4 transition active:bg-surface-2">
          <span class="flex-1">{{ i.label }}</span>
          <span class="text-sm text-muted">{{ i.hint }}</span>
          <ChevronRight :size="18" class="text-muted" />
        </RouterLink>
      </li>
    </ul>
  </template>
  <h2 class="section-title">關於</h2>
  <ul class="card inset-divide mb-5 overflow-hidden p-0">
    <li>
      <button class="flex w-full items-center gap-2 px-5 py-4 text-left transition active:bg-surface-2 disabled:opacity-60" :disabled="checking" @click="updateReady ? applyUpdate() : checkForUpdate()">
        <span class="flex-1">版本：{{ version }}</span>
        <span class="text-sm" :class="updateReady ? 'font-semibold text-primary' : 'text-muted'">{{ updateReady ? '有新版本，點此更新' : checking ? '檢查中…' : '檢查更新' }}</span>
      </button>
    </li>
  </ul>
</template>

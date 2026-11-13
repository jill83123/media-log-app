<script setup lang="ts">
import { THEMES } from '@/lib/themes'
import { useSettings } from '@/stores/settings'
import { Check } from '@/lib/uiIcons'
import PageHeader from '@/components/PageHeader.vue'

const settings = useSettings()
const modes = [
  { id: 'system', label: '跟隨系統' },
  { id: 'light', label: '淺色' },
  { id: 'dark', label: '深色' },
] as const
</script>

<template>
  <PageHeader title="外觀" back="/settings" />

  <h2 class="section-title">主題色</h2>
  <div class="card mb-5 flex flex-wrap gap-4 pt-5 pb-3">
    <button v-for="t in THEMES" :key="t.id" class="flex flex-col items-center gap-1.5" :aria-label="t.name" :aria-pressed="settings.s.themeColor === t.id" @click="settings.s.themeColor = t.id">
      <span class="grid size-7 place-items-center rounded-full ring-offset-2 ring-offset-surface transition" :class="settings.s.themeColor === t.id && 'ring-2 ring-primary'" :style="{ background: t.color }">
        <Check v-if="settings.s.themeColor === t.id" :size="14" class="text-white" />
      </span>
      <span class="text-xs" :class="settings.s.themeColor === t.id ? 'font-semibold text-ink' : 'text-muted'">{{ t.name }}</span>
    </button>
  </div>

  <h2 class="section-title">深色模式</h2>
  <div class="card mb-5 grid grid-cols-3 gap-2">
    <button v-for="m in modes" :key="m.id" class="btn" :class="settings.s.theme === m.id ? 'border-primary bg-primary-soft text-primary-strong' : 'border-line bg-surface text-ink hover:bg-surface-2'" :aria-pressed="settings.s.theme === m.id" @click="settings.s.theme = m.id">{{ m.label }}</button>
  </div>
</template>

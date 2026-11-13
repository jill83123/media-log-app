<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { WorkType } from '@/db/types'
import { workTypes } from '@/lib/meta'
import { earliest, formatFuzzy, today } from '@/lib/date'
import { eventsOf, itemsOf, RANGE_PRESETS, rangeOf, summarize, type RangeId } from '@/lib/stats'
import { useData } from '@/stores/data'
import { useSettings } from '@/stores/settings'
import PickSheet from '@/components/PickSheet.vue'
import PopupDialog from '@/components/PopupDialog.vue'
import { ChevronDown } from '@/lib/uiIcons'
import FuzzyDateField from '@/components/FuzzyDateField.vue'
import OverviewTab from '@/components/stats/OverviewTab.vue'

const data = useData()
/** one type at a time to begin with (the first in the user's order), so numbers and lists are not a mix of animes and novels */
const settings = useSettings()
/** shares the library's type pick, so choosing 小說 there shows 小說 here */
const types = computed<WorkType[]>(() => {
  const v = settings.s.libraryType || workTypes()[0]?.value
  return v ? [v] : []
})
const rangeId = ref<RangeId>('year')
const custom = ref({ from: '', to: '' })

const range = computed(() => rangeOf(rangeId.value, undefined, custom.value))
const items = computed(() => itemsOf(data.works, data.records, types.value))
const summary = computed(() => summarize(items.value, range.value))
/** every dated event; the heatmap picks its days from the time filter itself */
const allEvents = computed(() => eventsOf(items.value, data.notes, data.progressLogs))

/** one type at a time, picked from a dropdown ('' = all) */
const typeId = computed<string>({
  get: () => types.value[0] ?? '',
  set: (v) => (settings.s.libraryType = v as WorkType),
})
/** the stats are for one type at a time: there is no 全部作品 here */
const typeItems = computed(() => workTypes(typeId.value).map((t) => ({ value: t.value as string, label: t.label })))
/** a year of its own is one tap: every year older than last year that has something is listed, before 自訂 */
const olderYears = computed(() => {
  const first = Math.min(...allEvents.value.map((e) => Number(e.date.slice(0, 4))).filter(Boolean))
  const last = Number(today().slice(0, 4)) - 2
  return Number.isFinite(first) ? Array.from({ length: Math.max(0, last - first + 1) }, (_, i) => last - i) : []
})
/** 全部 first, then the narrower ranges, then the older years, 自訂 last */
const rangeItems = computed(() => {
  const presets = [...RANGE_PRESETS].sort((a, b) => Number(b.id === 'all') - Number(a.id === 'all')).map((p) => ({ value: p.id as string, label: p.label }))
  const years = olderYears.value.map((y) => ({ value: `y:${y}`, label: `${y} 年` }))
  const at = presets.findIndex((p) => p.value === 'custom')
  return [...presets.slice(0, at), ...years, ...presets.slice(at)]
})
/** the list's current choice: an older year that was picked is shown as its own entry */
const rangePick = computed(() => (rangeId.value === 'custom' && /^\d{4}$/.test(custom.value.from) && custom.value.from === custom.value.to ? `y:${custom.value.from}` : rangeId.value))
/** 自訂 asks for its two dates in a small window; the range only changes when that is confirmed */
const customOpen = ref(false)
const draft = ref({ from: '', to: '' })
function pickRange(v: string) {
  if (v.startsWith('y:')) {
    custom.value = { from: v.slice(2), to: v.slice(2) }
    rangeId.value = 'custom'
  } else if (v === 'custom') {
    draft.value = { ...custom.value }
    customOpen.value = true
  } else rangeId.value = v as RangeId
}
function applyCustom() {
  custom.value = { ...draft.value }
  rangeId.value = 'custom'
  customOpen.value = false
}
/** one pick is enough for a single year or month: an empty end (or one that would come before the start) takes the other's value */
watch(
  () => [draft.value.from, draft.value.to] as const,
  ([from, to]) => {
    if (from && (!to || earliest(to) < earliest(from))) draft.value.to = from
    else if (to && !from) draft.value.from = to
  },
)
const typeOpen = ref(false)
const rangeOpen = ref(false)
const typeTitle = computed(() => typeItems.value.find((t) => t.value === typeId.value)?.label ?? '統計')
const rangeLabel = computed(() => {
  const { from, to } = custom.value
  if (rangeId.value === 'custom' && from && to) return from === to ? formatFuzzy(from) : `${formatFuzzy(from)} – ${formatFuzzy(to)}`
  return rangeItems.value.find((r) => r.value === rangeId.value)?.label ?? ''
})
</script>

<template>
  <!-- the title and the time filter stay on screen while the page scrolls -->
  <header class="sticky-header">
    <button class="flex items-center gap-1 text-xl font-bold" aria-label="選擇作品類型" @click="typeOpen = true">{{ typeTitle }}<ChevronDown :size="18" class="text-muted" /></button>
    <button class="absolute right-4 bottom-2 flex h-10 items-center gap-1 text-sm font-semibold text-muted" aria-label="時間範圍" @click="rangeOpen = true">{{ rangeLabel }}<ChevronDown :size="16" /></button>
    <PickSheet v-model:open="typeOpen" :model-value="typeId" title="作品類型" :items="typeItems" @pick="(v: string) => (typeId = v)" />
    <PickSheet v-model:open="rangeOpen" :model-value="rangePick" title="時間範圍" :items="rangeItems" @pick="pickRange" />
  </header>
  <PopupDialog v-model="customOpen" no-focus>
    <form class="card w-full max-w-[23rem] space-y-4 p-5 shadow-xl" role="dialog" aria-label="自訂時間範圍" @submit.prevent="applyCustom">
      <h2 class="pb-1 text-lg leading-snug font-bold">自訂時間範圍</h2>
      <FuzzyDateField v-model="draft.from" label="從" />
      <FuzzyDateField v-model="draft.to" label="到" />
      <button type="submit" class="btn btn-primary w-full disabled:opacity-40" :disabled="!draft.from && !draft.to">確定</button>
    </form>
  </PopupDialog>

  <OverviewTab :summary="summary" :events="allEvents" :range="range" />
</template>

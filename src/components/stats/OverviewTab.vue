<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import type { DayEvent, Item, Range, Summary } from '@/lib/stats'
import HeatmapTab from './HeatmapTab.vue'
import BottomSheet from '@/components/BottomSheet.vue'
import WorkCover from '@/components/WorkCover.vue'
import { formatScore, scoreOf } from '@/lib/ratings'
import { typeLabel } from '@/lib/meta'

const props = defineProps<{ summary: Summary; events: DayEvent[]; range: Range }>()

/** tapping a number or a bar lists the works behind it, in the same drawer */
const listOpen = ref(false)
const listTitle = ref('')
const listItems = ref<Item[]>([])
function openList(title: string, items: Item[]) {
  listTitle.value = title
  listItems.value = items
  listOpen.value = true
}
const openRating = (value: number) => openList(`${formatScore(scoreOf(value) ?? 0)} 分`, props.summary.ratedItems.filter((i) => i.record.rating === value))
const STATES = [
  { key: 'finished', label: '看完' },
  { key: 'doing', label: '在看' },
  { key: 'paused', label: '閒置' },
  { key: 'dropped', label: '拋棄' },
] as const
const maxDist = computed(() => Math.max(1, ...props.summary.distribution.map((d) => d.count)))
</script>

<template>
  <div class="grid grid-cols-4 gap-2">
    <button v-for="st in STATES" :key="st.key" class="card text-center disabled:cursor-default" :disabled="!summary[st.key]" :aria-label="`${st.label}，${summary[st.key]} 部`" @click="openList(st.label, summary.lists[st.key])">
      <p class="text-2xl font-bold">{{ summary[st.key] }}</p>
      <p class="text-xs text-muted">{{ st.label }}</p>
    </button>
  </div>

  <HeatmapTab :events="events" :range="range" />

  <div class="mt-5 flex items-baseline justify-between pr-1">
    <h2 class="section-title">評分分佈</h2>
    <p class="text-xs text-muted">平均 <span class="text-base font-bold text-ink">{{ summary.average == null ? '—' : formatScore(summary.average) }}</span></p>
  </div>
  <div class="card">
    <!-- every level of the scale, the empty ones too -->
    <ul class="space-y-2.5 py-1">
      <li v-for="d in summary.distribution" :key="d.value">
        <button class="flex w-full items-center gap-3 text-xs leading-none disabled:cursor-default" :disabled="!d.count" :aria-label="`${formatScore(scoreOf(d.value) ?? 0)} 分，${d.count} 部`" @click="openRating(d.value)">
          <span class="w-7 shrink-0 text-right text-muted tabular-nums">{{ formatScore(scoreOf(d.value) ?? 0) }}</span>
          <span class="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
            <span class="block h-full rounded-full bg-primary transition-all" :style="{ width: `${(d.count / maxDist) * 100}%` }" />
          </span>
          <span class="w-5 shrink-0 text-right text-muted tabular-nums">{{ d.count }}</span>
        </button>
      </li>
    </ul>
  </div>

  <BottomSheet v-model="listOpen" :title="listTitle" :subtitle="`（共 ${listItems.length} 部）`">
    <ul class="card divide-y divide-line p-0">
      <li v-for="i in listItems" :key="i.record.id">
        <RouterLink :to="`/work/${i.work.id}`" class="flex items-center gap-3 px-4 py-3">
          <WorkCover :src="i.work.cover" :title="i.work.title" :icon-size="13" class="h-[52px] w-[39px] shrink-0" />
          <span class="min-w-0 flex-1">
            <span class="block truncate font-medium">{{ i.work.title }}</span>
            <span class="block truncate text-xs text-muted">{{ typeLabel(i.work.type) }}</span>
          </span>
          <span v-if="i.record.round > 1" class="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted">{{ i.record.round }} 刷</span>
        </RouterLink>
      </li>
    </ul>
  </BottomSheet>
</template>

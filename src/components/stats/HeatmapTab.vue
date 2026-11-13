<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { dayCounts, heatWeeks, level, type DayEvent, type Range } from '@/lib/stats'
import { precision, today } from '@/lib/date'

const props = defineProps<{ events: DayEvent[]; range: Range }>()

const counts = computed(() => dayCounts(props.events))
/** the days the time filter covers (no start: from the first day with anything; no end or a future one: until today) */
const picked = computed(() => {
  const first = props.events.map((e) => e.date).filter((d) => precision(d) === 'day').sort()[0]
  const from = props.range.from || first || `${today().slice(0, 4)}-01-01`
  const to = props.range.to && props.range.to < today() ? props.range.to : today()
  return { from, to }
})
/** whole calendar years around that stretch, up to today; the days outside the filter are faded */
const weeks = computed(() => {
  const { from, to } = picked.value
  if (from > to) return []
  const end = `${to.slice(0, 4)}-12-31`
  return heatWeeks(`${from.slice(0, 4)}-01-01`, end < today() ? end : today()).filter((w) => w.some(Boolean))
})
const inRange = (d: string) => d >= picked.value.from && d <= picked.value.to
const max = computed(() => Math.max(0, ...weeks.value.flat().map((d) => (d && inRange(d) ? (counts.value.get(d) ?? 0) : 0))))

const months = computed(() =>
  weeks.value.map((w, i) => {
    const first = w.find(Boolean)
    const prev = i ? weeks.value[i - 1]!.find(Boolean) : ''
    return first && (!prev || first.slice(5, 7) !== prev.slice(5, 7)) ? `${Number(first.slice(5, 7))}月` : ''
  }),
)

/** it opens on the latest end, where the filtered days are */
const scroller = ref<HTMLElement>()
async function toLatest() {
  await nextTick()
  if (scroller.value) scroller.value.scrollLeft = scroller.value.scrollWidth
}
watch([scroller, picked], toLatest, { flush: 'post' })
const shade = ['var(--surface-2)', 'color-mix(in oklab, var(--primary) 25%, var(--surface))', 'color-mix(in oklab, var(--primary) 50%, var(--surface))', 'color-mix(in oklab, var(--primary) 75%, var(--surface))', 'var(--primary)']
</script>

<template>
  <div class="mt-5 mb-2 flex items-center justify-between pr-1">
    <h2 class="section-title !mb-0">活動熱力圖</h2>
    <span class="flex items-center gap-1 text-xs text-muted">少<span v-for="(c, i) in shade" :key="i" class="size-3 rounded-[3px]" :style="{ background: c }" />多</span>
  </div>

  <div class="card">
    <div ref="scroller" v-drag-scroll class="scrollbar-none overflow-x-auto pb-1">
      <div class="inline-flex gap-[3px] pr-3">
        <div v-for="(w, i) in weeks" :key="i" class="relative flex flex-col gap-[3px]">
          <!-- the month name floats over the column instead of stretching it, so every column stays the same width -->
          <span class="h-4" />
          <span v-if="months[i]" class="absolute top-0 left-0 text-[10px] leading-4 whitespace-nowrap text-muted">{{ months[i] }}</span>
          <span
            v-for="(d, j) in w"
            :key="j"
            class="size-[13px] rounded-[3px] transition-opacity"
            :class="[!d && 'invisible', d && !inRange(d) && 'opacity-25']"
            :style="{ background: shade[level(counts.get(d) ?? 0, max)] }"
            :aria-label="d ? `${d}：${counts.get(d) ?? 0} 筆` : undefined"
          />
        </div>
      </div>
    </div>
  </div>
</template>

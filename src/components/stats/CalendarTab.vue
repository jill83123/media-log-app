<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { monthGrid, precision, today, WEEKDAYS, ym } from '@/lib/date'
import type { DayEvent } from '@/lib/stats'
import { progressLogText } from '@/lib/meta'
import { ChevronLeft, ChevronRight } from '@/lib/uiIcons'
import { scroll } from '@/router'
import BottomSheet from '@/components/BottomSheet.vue'
import WorkCover from '@/components/WorkCover.vue'

const props = defineProps<{ events: DayEvent[] }>()

const year = ref(Number(today().slice(0, 4)))
const months = computed(() => Array.from({ length: 12 }, (_, i) => `${year.value}-${String(i + 1).padStart(2, '0')}`))
const picked = ref('')
const sheet = ref(false)

/** the works that had something happen on each day (a work shows once per day) */
const byDay = computed(() => {
  const m = new Map<string, DayEvent[]>()
  // the work shown on a day is the most meaningful thing that happened: finished, review, started, progress, then a plain note
  const rank = (e: DayEvent) => (e.kind === 'finish' ? 0 : e.kind === 'note' ? (e.isNote ? 4 : 1) : e.kind === 'start' ? 2 : 3)
  for (const e of [...props.events].sort((a, b) => rank(a) - rank(b))) {
    if (precision(e.date) !== 'day') continue
    const list = m.get(e.date) ?? []
    if (!list.some((x) => x.work.id === e.work.id)) list.push(e)
    m.set(e.date, list)
  }
  return m
})
/** things known only to the month: shown under that month's grid instead of on a day */
const looseOf = (month: string) => props.events.filter((e) => precision(e.date) === 'month' && e.date === month && e.kind !== 'note')
/** the month whose date-less entries the drawer shows (instead of a day) */
const pickedMonth = ref('')
const eventsOn = computed(() => (pickedMonth.value ? looseOf(pickedMonth.value) : props.events.filter((e) => e.date === picked.value)))
/** the drawer shows each work once: everything that happened to it that day is gathered on one line */
const RANK = { finish: 0, start: 1, progress: 2, note: 3 } as const
const labelOf = (e: DayEvent) => (e.kind === 'start' ? '開始' : e.kind === 'finish' ? '看完' : e.kind === 'note' ? (e.isNote ? '筆記' : '心得') : e.log ? progressLogText(e.log, e.record.progress.unit) : '')
const rows = computed(() => {
  const m = new Map<string, { work: DayEvent['work']; labels: string[] }>()
  for (const e of [...eventsOn.value].sort((a, b) => RANK[a.kind] - RANK[b.kind])) {
    const row = m.get(e.work.id) ?? { work: e.work, labels: [] }
    const label = labelOf(e)
    if (label && !row.labels.includes(label)) row.labels.push(label)
    m.set(e.work.id, row)
  }
  return [...m.values()]
})

function pick(d: string) {
  picked.value = d
  pickedMonth.value = ''
  sheet.value = true
}
function pickMonth(m: string) {
  picked.value = ''
  pickedMonth.value = m
  sheet.value = true
}

/** open at the current month (or the top of another year) */
const root = ref<HTMLElement>()
function jump() {
  void nextTick(() => {
    const thisYear = year.value === Number(today().slice(0, 4))
    const el = thisYear ? root.value?.querySelector<HTMLElement>(`[data-month="${ym(today())}"]`) : null
    el?.scrollIntoView({ block: 'start', behavior: 'instant' })
    if (!el) window.scrollTo({ top: 0, behavior: 'instant' })
  })
}
// opened from the tab bar (or the tab tapped again): the router leaves the scroll alone and the calendar moves to this month itself
// at once, so nothing flashes; coming back with Back restores the old position instead
/** tapping the year goes back to this year and scrolls to this month, even when it is already this year */
function toThisMonth() {
  year.value = Number(today().slice(0, 4))
  jump()
}
watch(() => scroll.calendar, jump)
onMounted(() => !scroll.restored && jump())
watch(year, jump)
</script>

<template>
  <div ref="root">
    <!-- the year header stays in view while the months scroll under it -->
    <div class="sticky top-[calc(var(--page-pt)+3.5rem)] z-10 -mx-4 flex items-center justify-between bg-bg px-4">
      <button class="icon-btn border-0 bg-transparent" aria-label="前一年" @click="year--"><ChevronLeft :size="20" /></button>
      <button class="text-lg font-bold" aria-label="回到本月" @click="toThisMonth">{{ year }}</button>
      <button class="icon-btn border-0 bg-transparent" aria-label="後一年" @click="year++"><ChevronRight :size="20" /></button>
    </div>
    <div class="sticky top-[calc(var(--page-pt)+6rem)] z-10 -mx-4 grid grid-cols-7 bg-bg px-4 text-center text-xs text-muted"><span v-for="w in WEEKDAYS" :key="w" class="py-1">{{ w }}</span></div>

    <section v-for="month in months" :key="month" :data-month="month" class="scroll-mt-[calc(var(--page-pt)+8rem)] pt-3 pb-2">
      <div class="mb-2 flex items-center justify-between">
        <h2 class="section-title !mb-0">{{ Number(month.slice(5)) }} 月</h2>
        <!-- entries known only to the month sit behind a small chip instead of a card under the grid -->
        <button v-if="looseOf(month).length" class="chip min-h-0 px-2.5 py-1 text-xs text-muted" @click="pickMonth(month)">未記日期 {{ looseOf(month).length }}</button>
      </div>
      <div class="grid grid-cols-7 gap-1">
        <button
          v-for="d in monthGrid(month)"
          :key="d"
          class="relative aspect-[3/4] overflow-hidden rounded-lg border text-xs transition active:scale-95"
          :class="[ym(d) !== month ? 'invisible' : '', d === picked && sheet ? 'border-primary' : 'border-line', d === today() && 'ring-1 ring-primary']"
          @click="pick(d)"
        >
          <template v-if="byDay.get(d)?.length">
            <WorkCover :src="byDay.get(d)![0]!.work.cover" :title="byDay.get(d)![0]!.work.title" class="absolute inset-0 size-full rounded-none" />
            <span v-if="byDay.get(d)!.length > 1" class="absolute right-0.5 bottom-0.5 rounded-full bg-black/60 px-1 text-[10px] font-bold text-white">+{{ byDay.get(d)!.length - 1 }}</span>
            <span class="absolute top-0.5 left-0.5 text-[10px] leading-none font-bold" :class="byDay.get(d)![0]!.work.cover ? 'text-white [text-shadow:0_0_3px_rgb(0_0_0/0.85),0_1px_2px_rgb(0_0_0/0.7)]' : 'left-1 text-muted'">{{ Number(d.slice(8)) }}</span>
          </template>
          <span v-else class="grid size-full place-items-center text-muted">{{ Number(d.slice(8)) }}</span>
        </button>
      </div>
    </section>
  </div>

  <!-- tapping a day opens its drawer -->
  <BottomSheet v-model="sheet" :title="pickedMonth ? `${Number(pickedMonth.slice(5))} 月（未記日期）` : picked">
    <p v-if="!rows.length" class="py-6 text-center text-sm text-muted">{{ pickedMonth ? '這個月沒有紀錄' : '這天沒有紀錄' }}</p>
    <ul class="space-y-3">
      <li v-for="r in rows" :key="r.work.id">
        <RouterLink :to="`/work/${r.work.id}`" class="flex items-center gap-3 text-sm">
          <WorkCover :src="r.work.cover" :title="r.work.title" class="h-12 w-[34px] shrink-0" />
          <span class="min-w-0 flex-1">
            <span class="block truncate font-medium">{{ r.work.title }}</span>
            <span v-if="r.labels.length" class="mt-0.5 flex flex-wrap text-xs text-muted">
              <span v-for="(l, i) in r.labels" :key="l" class="whitespace-nowrap">{{ l }}<template v-if="i < r.labels.length - 1">、</template></span>
            </span>
          </span>
        </RouterLink>
      </li>
    </ul>
  </BottomSheet>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ChevronDown, ChevronLeft, ChevronRight } from '@/lib/uiIcons'
import { addDays, monthGrid, precision, today, weekday, WEEKDAYS, ym, type Precision } from '@/lib/date'
import BottomSheet from './BottomSheet.vue'

/** `dayOnly`: a full date is required (no year-only / month-only, no clearing); `max`: the last day that can be picked */
const props = defineProps<{ title?: string; dayOnly?: boolean; max?: string }>()
const open = defineModel<boolean>('open', { required: true })
/** '' | YYYY | YYYY-MM | YYYY-MM-DD */
const model = defineModel<string>({ required: true })

type Mode = Exclude<Precision, 'none'>
const mode = ref<Mode>('day')
const year = ref(Number(today().slice(0, 4)))
const month = ref(Number(today().slice(5, 7)))
const day = ref(Number(today().slice(8, 10)))
/** day mode starts on the calendar; tapping the title opens the year / month list instead */
const jumping = ref(false)
/** the first of the 12 years shown in year mode */
const yearsFrom = ref(0)
/** the list of years, opened from the month list to change the year quickly */
const yearList = ref(false)

watch(open, (o) => {
  if (!o) return
  const p = precision(model.value)
  const base = p === 'none' ? today() : model.value
  year.value = Number(base.slice(0, 4))
  month.value = p === 'year' || p === 'none' ? Number(today().slice(5, 7)) : Number(base.slice(5, 7))
  day.value = p === 'day' ? Number(base.slice(8, 10)) : Number(today().slice(8, 10))
  mode.value = p === 'none' || props.dayOnly ? 'day' : p
  jumping.value = false
  yearList.value = false
  yearsFrom.value = year.value - 5
})

const pad = (n: number) => String(n).padStart(2, '0')
const daysIn = (y: number, m: number) => new Date(y, m, 0).getDate()
const monthStr = computed(() => `${year.value}-${pad(month.value)}`)
const cells = computed(() => monthGrid(monthStr.value))
const result = computed(() =>
  mode.value === 'year' ? `${year.value}` : mode.value === 'month' ? monthStr.value : `${monthStr.value}-${pad(Math.min(day.value, daysIn(year.value, month.value)))}`,
)
const chosenDay = computed(() => `${monthStr.value}-${pad(Math.min(day.value, daysIn(year.value, month.value)))}`)

const modes: { id: Mode; label: string }[] = [
  { id: 'year', label: '只填年' },
  { id: 'month', label: '年月' },
  { id: 'day', label: '年月日' },
]
function setMode(m: Mode) {
  mode.value = m
  jumping.value = false
  yearList.value = false
  yearsFrom.value = year.value - 5
}
function pickYear(y: number) {
  year.value = y
  yearList.value = false
}
function openYears() {
  yearsFrom.value = year.value - 5
  yearList.value = true
}

/** one month back / forward, across years */
function step(n: number) {
  const t = year.value * 12 + (month.value - 1) + n
  year.value = Math.floor(t / 12)
  month.value = (t % 12) + 1
}
const nextBlocked = computed(() => !!props.max && ym(props.max) <= monthStr.value)

function pickDay(d: string) {
  if (props.max && d > props.max) return
  if (ym(d) !== monthStr.value) {
    year.value = Number(d.slice(0, 4))
    month.value = Number(d.slice(5, 7))
  }
  day.value = Number(d.slice(8, 10))
}
function pickMonth(m: number) {
  month.value = m
  jumping.value = false
}

function confirm() {
  model.value = result.value
  open.value = false
}
function clear() {
  model.value = ''
  open.value = false
}
function goTo(d: string) {
  year.value = Number(d.slice(0, 4))
  month.value = Number(d.slice(5, 7))
  day.value = Number(d.slice(8, 10))
  jumping.value = false
}
const shortcuts = [
  { label: '今天', run: () => goTo(today()) },
  { label: '昨天', run: () => goTo(addDays(today(), -1)) },
]
</script>

<template>
  <BottomSheet v-model="open" high :title="title ?? '選擇日期'">
    <div v-if="!dayOnly" class="mb-4 grid grid-cols-3 gap-1 rounded-2xl bg-surface-2 p-1">
      <button v-for="m in modes" :key="m.id" class="rounded-xl py-2 text-sm transition" :class="mode === m.id ? 'bg-surface font-semibold text-primary shadow-sm' : 'text-muted'" @click="setMode(m.id)">
        {{ m.label }}
      </button>
    </div>

    <!-- year only: a page of twelve years -->
    <template v-if="mode === 'year' || yearList">
      <div class="mb-3 flex items-center justify-between">
        <button class="icon-btn border-0 bg-transparent" aria-label="前十二年" @click="yearsFrom -= 12"><ChevronLeft :size="22" /></button>
        <span class="text-sm text-muted">{{ yearsFrom }} – {{ yearsFrom + 11 }}</span>
        <button class="icon-btn border-0 bg-transparent" aria-label="後十二年" @click="yearsFrom += 12"><ChevronRight :size="22" /></button>
      </div>
      <div class="grid grid-cols-4 gap-2">
        <button v-for="y in 12" :key="y" class="rounded-2xl py-3 text-sm transition active:scale-95" :class="yearsFrom + y - 1 === year ? 'bg-primary font-semibold text-white' : 'bg-surface-2'" @click="pickYear(yearsFrom + y - 1)">{{ yearsFrom + y - 1 }}</button>
      </div>
    </template>

    <!-- year + month: the year with arrows, then the twelve months (also what opens when the title is tapped in day mode) -->
    <template v-else-if="mode === 'month' || jumping">
      <div class="mb-3 flex items-center justify-between">
        <button class="icon-btn border-0 bg-transparent" aria-label="前一年" @click="year--"><ChevronLeft :size="22" /></button>
        <button class="flex items-center gap-1 rounded-lg px-2 py-1 text-lg font-semibold" aria-label="快速選年" @click="openYears">{{ year }} 年<ChevronDown :size="16" class="text-muted" /></button>
        <button class="icon-btn border-0 bg-transparent" aria-label="後一年" @click="year++"><ChevronRight :size="22" /></button>
      </div>
      <div class="grid grid-cols-4 gap-2">
        <button v-for="m in 12" :key="m" class="rounded-2xl py-3 text-sm transition active:scale-95" :class="m === month ? 'bg-primary font-semibold text-white' : 'bg-surface-2'" @click="pickMonth(m)">{{ m }} 月</button>
      </div>
    </template>

    <!-- a day: the month's calendar, month by month -->
    <template v-else>
      <div class="mb-2 flex items-center justify-between">
        <button class="icon-btn border-0 bg-transparent" aria-label="上個月" @click="step(-1)"><ChevronLeft :size="22" /></button>
        <button class="flex items-center gap-1 rounded-lg px-2 py-1 text-lg font-semibold" aria-label="換年月" @click="jumping = true">{{ year }} 年 {{ month }} 月<ChevronDown :size="16" class="text-muted" /></button>
        <button class="icon-btn border-0 bg-transparent disabled:opacity-30" aria-label="下個月" :disabled="nextBlocked" @click="step(1)"><ChevronRight :size="22" /></button>
      </div>
      <div class="grid grid-cols-7 text-center text-xs text-muted">
        <span v-for="w in WEEKDAYS" :key="w" class="py-1">{{ w }}</span>
      </div>
      <div class="grid grid-cols-7 gap-y-1">
        <button
          v-for="d in cells"
          :key="d"
          class="mx-auto grid size-10 place-items-center rounded-full text-sm transition active:scale-90"
          :class="[
            d === chosenDay ? 'bg-primary font-semibold text-white' : '',
            d !== chosenDay && d === today() ? 'border border-primary font-semibold text-primary' : '',
            d !== chosenDay && ym(d) !== monthStr ? 'text-muted/40' : '',
            d !== chosenDay && ym(d) === monthStr && weekday(d) === 0 ? 'text-danger' : '',
            max && d > max ? 'pointer-events-none opacity-30' : '',
          ]"
          :aria-label="d"
          @click="pickDay(d)"
        >
          {{ Number(d.slice(8)) }}
        </button>
      </div>
      <div class="mt-3 flex gap-2">
        <button v-for="s in shortcuts" :key="s.label" class="chip" @click="s.run">{{ s.label }}</button>
      </div>
    </template>

    <template #footer>
      <div class="grid gap-2" :class="!dayOnly && 'grid-cols-[auto_1fr]'">
        <button v-if="!dayOnly" class="btn btn-ghost" @click="clear">清除</button>
        <button class="btn btn-primary" @click="confirm">確定 {{ result.replaceAll('-', '/') }}</button>
      </div>
    </template>
  </BottomSheet>
</template>

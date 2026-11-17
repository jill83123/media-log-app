<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import type { Rec, Series, Work, WorkNote } from '@/db/types'
import { formatFuzzy } from '@/lib/date'
import { inRange, type Range } from '@/lib/stats'
import RatingBadge from '@/components/RatingBadge.vue'
import WorkCover from '@/components/WorkCover.vue'

const props = defineProps<{ works: Work[]; notes: WorkNote[]; series: Series[]; records: Rec[]; range: Range }>()

/** a work's score, as in its own page: the newest round that has one */
const ratingOf = computed(() => {
  const m = new Map<string, number>()
  for (const r of [...props.records].sort((a, b) => a.round - b.round)) if (r.rating != null) m.set(r.workId, r.rating)
  return m
})

/** every 心得 (not 筆記) of the chosen type and time range, newest first; undated ones go last */
const list = computed(() => {
  const byId = new Map(props.works.map((w) => [w.id, w]))
  const workReviews = props.notes
    .filter((n) => n.kind !== 'note' && byId.has(n.workId) && inRange(n.date, props.range))
    .map((note) => ({ note, work: byId.get(note.workId)!, series: undefined as Series | undefined }))
  // a series' own reviews sit in the same list; the series shows up when one of its works is of the chosen type
  const seriesReviews = props.series
    .filter((s) => props.works.some((w) => w.seriesId === s.id))
    .flatMap((s) =>
      (s.reviews ?? [])
        .filter((r) => inRange(r.date, props.range))
        .map((r) => ({ note: { ...r, workId: s.id } as WorkNote, work: props.works.filter((w) => w.seriesId === s.id).sort((a, b) => (a.seriesOrder ?? 1e9) - (b.seriesOrder ?? 1e9))[0]!, series: s })),
    )
  return [...workReviews, ...seriesReviews]
    .sort((a, b) => (a.note.date === b.note.date ? b.note.updatedAt - a.note.updatedAt : !a.note.date ? 1 : !b.note.date ? -1 : a.note.date < b.note.date ? 1 : -1))
})
</script>

<template>
  <div class="mb-2 px-1 text-xs text-muted">共 {{ list.length }} 筆</div>
  <p v-if="!list.length" class="py-16 text-center text-sm text-muted">這個範圍內還沒有心得。</p>
  <ul class="space-y-3">
    <li v-for="x in list" :key="x.note.id">
      <RouterLink :to="x.series ? { path: `/series/${x.series.id}`, query: { tab: 'review' } } : { path: `/work/${x.work.id}`, query: { tab: 'review' } }" class="card flex items-center gap-3 text-left">
        <WorkCover :src="x.series?.cover || x.work.cover" :title="x.series?.name ?? x.work.title" class="h-16 w-[46px] shrink-0" />
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 text-xs text-muted">
            <span class="truncate text-sm font-medium text-ink">{{ x.series ? `${x.series.name}（系列）` : x.work.title }}</span>
            <span class="ml-auto shrink-0">{{ formatFuzzy(x.note.date) }}</span>
          </div>
          <RatingBadge v-if="x.series ? x.series.rating != null : ratingOf.has(x.work.id)" :value="x.series ? x.series.rating! : ratingOf.get(x.work.id)!" class="mt-0.5 text-xs leading-4" />
          <div v-else class="mt-0.5 text-xs leading-4 text-muted">未評分</div>
          <p class="mt-0.5 line-clamp-1 text-sm leading-[1.45] whitespace-pre-wrap"><template v-if="x.note.title"><span class="font-medium"><span class="-ml-[0.5em]">【</span>{{ x.note.title }}】</span></template>{{ x.note.body }}</p>
        </div>
      </RouterLink>
    </li>
  </ul>
</template>

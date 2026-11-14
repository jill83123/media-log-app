<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import type { Rec, Work, WorkNote } from '@/db/types'
import { formatFuzzy } from '@/lib/date'
import { inRange, type Range } from '@/lib/stats'
import RatingBadge from '@/components/RatingBadge.vue'
import WorkCover from '@/components/WorkCover.vue'

const props = defineProps<{ works: Work[]; notes: WorkNote[]; records: Rec[]; range: Range }>()

/** a work's score, as in its own page: the newest round that has one */
const ratingOf = computed(() => {
  const m = new Map<string, number>()
  for (const r of [...props.records].sort((a, b) => a.round - b.round)) if (r.rating != null) m.set(r.workId, r.rating)
  return m
})

/** every 心得 (not 筆記) of the chosen type and time range, newest first; undated ones go last */
const list = computed(() => {
  const byId = new Map(props.works.map((w) => [w.id, w]))
  return props.notes
    .filter((n) => n.kind !== 'note' && byId.has(n.workId) && inRange(n.date, props.range))
    .map((note) => ({ note, work: byId.get(note.workId)! }))
    .sort((a, b) => (a.note.date === b.note.date ? b.note.updatedAt - a.note.updatedAt : !a.note.date ? 1 : !b.note.date ? -1 : a.note.date < b.note.date ? 1 : -1))
})
</script>

<template>
  <div class="mb-2 px-1 text-xs text-muted">共 {{ list.length }} 筆</div>
  <p v-if="!list.length" class="py-16 text-center text-sm text-muted">這個範圍內還沒有心得。</p>
  <ul class="space-y-3">
    <li v-for="x in list" :key="x.note.id">
      <RouterLink :to="{ path: `/work/${x.work.id}`, query: { tab: 'review' } }" class="card flex items-center gap-3 text-left">
        <WorkCover :src="x.work.cover" :title="x.work.title" class="h-16 w-[46px] shrink-0" />
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 text-xs text-muted">
            <span class="truncate text-sm font-medium text-ink">{{ x.work.title }}</span>
            <span class="ml-auto shrink-0">{{ formatFuzzy(x.note.date) }}</span>
          </div>
          <RatingBadge v-if="ratingOf.has(x.work.id)" :value="ratingOf.get(x.work.id)!" class="mt-0.5 text-xs leading-4" />
          <div v-else class="mt-0.5 text-xs leading-4 text-muted">未評分</div>
          <p v-if="x.note.title" class="mt-0.5 font-medium">{{ x.note.title }}</p>
          <p class="line-clamp-1 text-sm leading-[1.45] whitespace-pre-wrap" :class="'mt-0.5'">{{ x.note.body }}</p>
        </div>
      </RouterLink>
    </li>
  </ul>
</template>

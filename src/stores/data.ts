import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import { liveQuery } from 'dexie'
import { table } from '@/db'
import type { Base, Category, ProgressLog, Rec, Series, Tag, TableMap, TableName, Work, WorkNote } from '@/db/types'
import { earliest } from '@/lib/date'
import { migrateCategoriesToTags } from '@/lib/repo'

/** All live (not deleted) rows, kept in memory and refreshed whenever IndexedDB changes. */
export const useData = defineStore('data', () => {
  const ready = ref(false)
  const works = shallowRef<Work[]>([])
  const series = shallowRef<Series[]>([])
  const records = shallowRef<Rec[]>([])
  const notes = shallowRef<WorkNote[]>([])
  const progressLogs = shallowRef<ProgressLog[]>([])
  const tags = shallowRef<Tag[]>([])
  const categories = shallowRef<Category[]>([])

  /** rows the user ordered by hand come first, in that order; the rest keep their place after them */
  const byOrder = <T extends { order?: number }>(rows: T[]) => [...rows].sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || 0)

  let started = false
  function live<K extends TableName>(name: K, target: { value: TableMap[K][] }, pending: Set<K>) {
    pending.add(name)
    liveQuery(() => table(name).filter((x: Base) => !x.deleted).toArray()).subscribe({
      next: (rows) => {
        target.value = (name === 'tags' || name === 'series' ? byOrder(rows as { order?: number }[]) : rows) as TableMap[K][]
        pending.delete(name)
        if (!pending.size) ready.value = true
      },
      error: (e) => console.error(e),
    })
  }

  function start() {
    if (started) return
    started = true
    const pending = new Set<TableName>()
    live('works', works, pending)
    live('series', series, pending)
    live('records', records, pending)
    live('notes', notes, pending)
    live('progressLogs', progressLogs, pending)
    live('tags', tags, pending)
    live('categories', categories, pending)
    // categories were merged into tags: turn any (old or newly synced) into tags
    watch(categories, (c) => c.length && void migrateCategoriesToTags(), { immediate: true })
  }

  const workById = computed(() => new Map(works.value.map((w) => [w.id, w])))

  /** the record that shows on the work's card: the newest round */
  const latestRecord = computed(() => {
    const m = new Map<string, Rec>()
    for (const r of records.value) {
      const cur = m.get(r.workId)
      if (!cur || r.round > cur.round) m.set(r.workId, r)
    }
    return m
  })

  /** works with their newest record, newest activity first (the default library order) */
  const library = computed(() =>
    works.value
      .map((work) => ({ work, record: latestRecord.value.get(work.id) }))
      .sort((a, b) => {
        const key = (x: { work: Work; record?: Rec }) => Math.max(x.record?.updatedAt ?? 0, x.work.updatedAt, Date.parse(earliest(x.record?.end ?? '')) || 0)
        return key(b) - key(a)
      }),
  )

  return { ready, start, works, series, records, notes, progressLogs, tags, categories, workById, latestRecord, library }
})

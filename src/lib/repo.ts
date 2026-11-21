import { db, table } from '@/db'
import type { Progress, ProgressLog, Rec, Status, TableName, TableMap, Work } from '@/db/types'
import { uid } from './id'
import { today } from './date'
import { pruneLocalImages } from './imageGc'

const now = () => Date.now()

export function emptyProgress(unit = '集'): Progress {
  return { current: 0, total: 0, unit, infinite: false }
}

export async function put<K extends TableName>(name: K, row: TableMap[K]): Promise<void> {
  await table(name).put({ ...row, updatedAt: now() } as TableMap[K])
}

/** rows are never removed, only marked, so the deletion can sync */
export async function remove(name: TableName, id: string): Promise<void> {
  await table(name).update(id, { deleted: true, updatedAt: now() } as never)
}

export async function createWork(
  input: Partial<Work> & Pick<Work, 'title' | 'type'>,
): Promise<Work> {
  const work: Work = { id: uid(), updatedAt: now(), createdAt: now(), tagIds: [], ...input }
  await db.works.put(work)
  return work
}

export async function createRecord(workId: string, patch: Partial<Rec> = {}): Promise<Rec> {
  const existing = await db.records.where('workId').equals(workId).filter((r) => !r.deleted).toArray()
  const rec: Rec = {
    id: uid(),
    updatedAt: now(),
    createdAt: now(),
    workId,
    round: existing.reduce((m, r) => Math.max(m, r.round), 0) + 1,
    status: 'todo',
    progress: emptyProgress(),
    rating: null,
    // the start date is when it was started, not when it was added: a want-to-watch record has none yet
    start: patch.status === 'doing' ? today() : '',
    end: '',
    ...patch,
  }
  await db.records.put(rec)
  return rec
}

/** Watch/read it again: a fresh record in the next round; earlier rounds stay as they were. */
export async function startNewRound(prev: Rec, work?: Work): Promise<Rec> {
  const d = work?.defaultProgress
  return createRecord(prev.workId, {
    status: 'doing',
    progress: { ...prev.progress, ...(d && { total: d.total, unit: d.unit, infinite: d.infinite }), current: 0 },
    start: today(),
  })
}

/**
 * Change where a round stands. Reaching the total on a known-length work finishes it
 * (the user can still undo by editing the status).
 */
export async function setProgress(rec: Rec, value: number): Promise<Rec> {
  const current = Math.max(0, value)
  const p = rec.progress
  const reachedEnd = !p.infinite && p.total > 0 && current >= p.total
  const next: Rec = {
    ...rec,
    progress: { ...p, current },
    status: reachedEnd ? 'done' : rec.status === 'todo' && current > 0 ? 'doing' : rec.status,
    updatedAt: now(),
  }
  if (next.status === 'doing' && !next.start) next.start = today()
  if (next.status === 'done' && !next.end) next.end = today()
  await db.records.put(next)
  if (current !== p.current) await logChange(next, p.current, current)
  return next
}

/** the id is made from the round and the day, so a day only ever has one entry per round (and devices agree on it) */
export const progressLogId = (recordId: string, date: string) => `plog-${recordId}-${date}`

/** remember where a round stood on a day (today unless told otherwise); the latest value of the day wins */
export async function logProgress(rec: Pick<Rec, 'id' | 'workId'>, value: number, date = today(), from?: number): Promise<void> {
  const id = progressLogId(rec.id, date)
  const row: ProgressLog = { id, updatedAt: now(), workId: rec.workId, recordId: rec.id, date, value: Math.max(0, value) }
  if (from != null) row.from = Math.max(0, from)
  await db.progressLogs.put(row)
}

/** an automatic entry: the day's range starts where the round stood before the day's first change */
export async function logChange(rec: Pick<Rec, 'id' | 'workId'>, before: number, value: number): Promise<void> {
  const day = (await db.progressLogs.get(progressLogId(rec.id, today())))?.from
  // a day's range continues from the latest earlier day, even if that day was edited after today's entry was made
  const prev = (await db.progressLogs.where('recordId').equals(rec.id).toArray()).filter((l) => l.date < today()).sort((a, b) => b.date.localeCompare(a.date))[0]
  await logProgress(rec, value, today(), prev?.value ?? day ?? before)
}

export async function setStatus(rec: Rec, status: Status): Promise<Rec> {
  const next: Rec = { ...rec, status, updatedAt: now() }
  if (status === 'doing' && !next.start) next.start = today()
  if (status === 'done' && !next.end) next.end = today()
  await db.records.put(next)
  return next
}

/** removes one round together with its daily entries */
export async function removeRecord(id: string) {
  await db.transaction('rw', db.records, db.progressLogs, async () => {
    for (const l of await db.progressLogs.where('recordId').equals(id).toArray()) await remove('progressLogs', l.id)
    await remove('records', id)
  })
}

export async function createTag(name: string): Promise<string> {
  const id = uid()
  await db.tags.put({ id, name, order: await db.tags.count(), updatedAt: now() })
  return id
}
export async function createSeries(name: string): Promise<string> {
  const id = uid()
  await db.series.put({ id, name, order: await db.series.count(), updatedAt: now() })
  return id
}
export async function createCategory(name: string, parentId?: string): Promise<string> {
  const id = uid()
  const order = await db.categories.count()
  await db.categories.put({ id, name, parentId, order, updatedAt: now() })
  return id
}

/** deleting a tag/category/series also clears it from the works that used it */
export async function removeTag(id: string) {
  await db.transaction('rw', db.tags, db.works, db.series, async () => {
    for (const w of await db.works.filter((w) => w.tagIds.includes(id)).toArray())
      await db.works.update(w.id, { tagIds: w.tagIds.filter((t) => t !== id), updatedAt: now() })
    for (const s of await db.series.filter((s) => !!s.tagIds?.includes(id)).toArray())
      await db.series.update(s.id, { tagIds: s.tagIds!.filter((t) => t !== id), updatedAt: now() })
    await remove('tags', id)
  })
}
export async function removeCategory(id: string) {
  await db.transaction('rw', db.categories, db.works, async () => {
    const all = await db.categories.filter((c) => !c.deleted).toArray()
    const gone = new Set<string>([id])
    for (let grew = true; grew; ) {
      grew = false
      for (const c of all) {
        if (c.parentId && gone.has(c.parentId) && !gone.has(c.id)) {
          gone.add(c.id)
          grew = true
        }
      }
    }
    for (const w of await db.works.filter((w) => !!w.categoryId && gone.has(w.categoryId)).toArray())
      await db.works.update(w.id, { categoryId: undefined, updatedAt: now() })
    for (const g of gone) await remove('categories', g)
  })
}
export async function removeSeries(id: string) {
  await db.transaction('rw', db.series, db.works, async () => {
    for (const w of await db.works.where('seriesId').equals(id).toArray())
      await db.works.update(w.id, { seriesId: undefined, seriesOrder: undefined, updatedAt: now() })
    await remove('series', id)
  })
}
/**
 * Categories were merged into tags: every category becomes a tag of the same name (reusing one that already has it),
 * its works get that tag, and the category is retired. Safe to run again; also catches categories that arrive from another device.
 */
export async function migrateCategoriesToTags(): Promise<void> {
  const cats = await db.categories.filter((c) => !c.deleted).toArray()
  if (!cats.length) return
  await db.transaction('rw', db.categories, db.tags, db.works, async () => {
    const tags = await db.tags.filter((t) => !t.deleted).toArray()
    for (const c of cats) {
      let tagId = tags.find((t) => t.name === c.name)?.id
      if (!tagId) {
        tagId = await createTag(c.name)
        tags.push({ id: tagId, name: c.name, updatedAt: now() })
      }
      for (const w of await db.works.filter((w) => w.categoryId === c.id).toArray()) {
        await db.works.update(w.id, { tagIds: w.tagIds.includes(tagId) ? w.tagIds : [...w.tagIds, tagId], categoryId: undefined, updatedAt: now() })
      }
      await remove('categories', c.id)
    }
  })
}

/** removes a work with all its rounds and notes */
export async function removeWork(id: string) {
  const recs = await db.records.where('workId').equals(id).toArray()
  await db.transaction('rw', db.works, db.records, db.notes, db.progressLogs, async () => {
    for (const n of await db.notes.where('workId').equals(id).toArray()) await remove('notes', n.id)
    for (const l of await db.progressLogs.where('workId').equals(id).toArray()) await remove('progressLogs', l.id)
    for (const r of recs) await remove('records', r.id)
    await remove('works', id)
  })
  // its cover picture is no longer used: drop the copy kept on this device (Drive's copy goes at the next sync)
  await pruneLocalImages().catch(() => {})
}

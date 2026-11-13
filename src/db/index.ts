import Dexie, { type EntityTable } from 'dexie'
import type { Category, ImageRow, MetaRow, ProgressLog, Rec, Series, Tag, TableMap, TableName, Work, WorkNote } from './types'

export class AppDB extends Dexie {
  works!: EntityTable<Work, 'id'>
  series!: EntityTable<Series, 'id'>
  records!: EntityTable<Rec, 'id'>
  notes!: EntityTable<WorkNote, 'id'>
  progressLogs!: EntityTable<ProgressLog, 'id'>
  tags!: EntityTable<Tag, 'id'>
  categories!: EntityTable<Category, 'id'>
  meta!: EntityTable<MetaRow, 'key'>
  images!: EntityTable<ImageRow, 'id'>

  constructor(name = 'media-log') {
    super(name)
    this.version(1).stores({
      works: 'id, type, seriesId, updatedAt',
      series: 'id, updatedAt',
      records: 'id, workId, status, updatedAt',
      progressLogs: 'id, recordId, updatedAt',
      tags: 'id, updatedAt',
      categories: 'id, updatedAt',
      meta: 'key',
    })
    // cover pictures kept on this device (the originals live in Google Drive once synced)
    this.version(2).stores({ images: 'id' })
    // the 輕小說 type was folded into 小說
    this.version(3).stores({}).upgrade((tx) => tx.table('works').toCollection().filter((w) => w.type === 'lightnovel').modify({ type: 'novel', updatedAt: Date.now() }))
    // reviews are free notes now, no longer tied to a round
    this.version(4)
      .stores({ notes: 'id, workId, recordId, updatedAt' })
      .upgrade(async (tx) => {
        const at = Date.now()
        const recs = await tx.table('records').filter((r) => !r.deleted && typeof r.review === 'string' && r.review.trim() !== '').toArray()
        for (const r of recs) {
          await tx.table('notes').put({ id: `note-${r.id}`, updatedAt: at, workId: r.workId, recordId: r.id, date: r.end || r.start || '', body: r.review.trim() })
          await tx.table('records').update(r.id, { review: '', updatedAt: at })
        }
      })
    // progress history is gone (a round only keeps where it stands now): its notes become notes of the work,
    // every note gets a date, and every round gets a start date
    this.version(5)
      .stores({ progressLogs: null, notes: 'id, workId, updatedAt' })
      .upgrade(async (tx) => {
        const at = Date.now()
        const day = (t: number) => {
          const d = new Date(t)
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        }
        const recs = await tx.table('records').toArray()
        const byId = new Map(recs.map((r) => [r.id, r]))
        const logs = await tx.table('progressLogs').filter((l) => !l.deleted && typeof l.note === 'string' && l.note.trim() !== '').toArray()
        for (const l of logs) {
          const r = byId.get(l.recordId)
          if (!r || r.deleted) continue
          await tx.table('notes').put({ id: `note-${l.id}`, updatedAt: at, workId: r.workId, kind: 'note', title: `${l.value}${r.progress?.unit ?? ''}`, date: l.date || day(l.updatedAt), body: l.note.trim() })
        }
        for (const n of await tx.table('notes').filter((n) => !n.deleted && !n.date).toArray()) await tx.table('notes').update(n.id, { date: day(n.updatedAt), updatedAt: at })
        for (const r of recs.filter((r) => !r.deleted && !r.start)) await tx.table('records').update(r.id, { start: r.end || day(r.createdAt ?? r.updatedAt), updatedAt: at })
      })
    // notes that came from progress updates (titled like "80%" or "12集") are 筆記, the rest stay 心得;
    // this also fixes devices that already ran step 5 before notes had a kind
    this.version(6).upgrade(async (tx) => {
      const at = Date.now()
      for (const n of await tx.table('notes').filter((n) => !n.deleted && !n.kind && n.id.startsWith('note-') && /^\d+[^\d\s]*$/.test(n.title ?? '')).toArray())
        await tx.table('notes').update(n.id, { kind: 'note', updatedAt: at })
    })
    // a day-by-day record of where each round got to (the old progress history is not brought back)
    this.version(7).stores({ progressLogs: 'id, workId, recordId, date, updatedAt' })
  }
}

export const db = new AppDB()

export const table = <K extends TableName>(name: K) => db[name] as unknown as EntityTable<TableMap[K], 'id'>

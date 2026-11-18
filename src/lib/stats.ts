import type { ProgressLog, Rec, Work, WorkNote, WorkType } from '@/db/types'
import { getRatingLevels, scoreOf } from './ratings'
import { addMonths, addYm, daysInMonth, earliest, latest, precision, today, within, ym, type FuzzyDate } from './date'

export interface Range {
  /** full dates, or '' for no limit */
  from: string
  to: string
}

export type RangeId = 'all' | 'month' | 'lastMonth' | '3m' | '6m' | 'year' | 'lastYear' | 'custom'

export const RANGE_PRESETS: { id: RangeId; label: string }[] = [
  { id: 'month', label: '本月' },
  { id: 'lastMonth', label: '上月' },
  { id: '3m', label: '過去三個月' },
  { id: '6m', label: '過去半年' },
  { id: 'year', label: '今年' },
  { id: 'lastYear', label: '去年' },
  { id: 'all', label: '全部時間' },
  { id: 'custom', label: '自訂' },
]

const lastDay = (m: string) => `${m}-${String(daysInMonth(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1)).padStart(2, '0')}`

export function rangeOf(id: RangeId, now = today(), custom: Range = { from: '', to: '' }): Range {
  const y = Number(now.slice(0, 4))
  const m = ym(now)
  switch (id) {
    case 'month':
      return { from: `${m}-01`, to: lastDay(m) }
    case 'lastMonth': {
      const p = addYm(m, -1)
      return { from: `${p}-01`, to: lastDay(p) }
    }
    case '3m':
      return { from: `${addYm(m, -2)}-01`, to: lastDay(m) }
    case '6m':
      return { from: `${addYm(m, -5)}-01`, to: lastDay(m) }
    case 'year':
      return { from: `${y}-01-01`, to: `${y}-12-31` }
    case 'lastYear':
      return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` }
    case 'custom':
      return { from: earliest(custom.from), to: latest(custom.to) }
    default:
      return { from: '', to: '' }
  }
}

export interface Item {
  work: Work
  record: Rec
}

/** the date a record belongs to for counting: when it ended, else when it started */
export const recordDate = (r: Rec): FuzzyDate => (precision(r.end) !== 'none' ? r.end : r.start)

export function inRange(d: FuzzyDate, range: Range): boolean {
  if (!range.from && !range.to) return true
  if (precision(d) === 'none') return false
  return within(d, range.from || '0000-01-01', range.to || '9999-12-31')
}

export function itemsOf(works: Work[], records: Rec[], types: WorkType[]): Item[] {
  const byId = new Map(works.map((w) => [w.id, w]))
  const out: Item[] = []
  for (const record of records) {
    const work = byId.get(record.workId)
    if (work && (!types.length || types.includes(work.type))) out.push({ work, record })
  }
  return out
}

export interface Summary {
  finished: number
  doing: number
  paused: number
  dropped: number
  rated: number
  /** the rounds behind each count, newest first: what tapping a number on the stats page lists */
  lists: { finished: Item[]; doing: Item[]; paused: Item[]; dropped: Item[] }
  /** the finished items that carry a score, newest first: what each bar of the distribution is made of */
  ratedItems: Item[]
  /** mean of the scores the user sees (their own rating numbers) */
  average: number | null
  /** one entry per rating level, best first (value = the level's key) */
  distribution: { value: number; count: number }[]
  byType: { type: WorkType; count: number }[]
  /** finished per month, ordered */
  perMonth: { month: string; count: number }[]
  unrated: number
}

export function summarize(items: Item[], range: Range): Summary {
  const finishedItems = items.filter((i) => i.record.status === 'done' && inRange(recordDate(i.record), range))
  const ratings = finishedItems.map((i) => i.record.rating).filter((v): v is number => v != null)
  const scores = ratings.map((r) => scoreOf(r)).filter((v): v is number => v != null)
  const dist = new Map<number, number>()
  for (const l of getRatingLevels()) dist.set(l.value, 0)
  for (const r of ratings) dist.set(r, (dist.get(r) ?? 0) + 1)
  const types = new Map<WorkType, number>()
  for (const i of finishedItems) types.set(i.work.type, (types.get(i.work.type) ?? 0) + 1)
  const months = new Map<string, number>()
  for (const i of finishedItems) {
    const d = recordDate(i.record)
    if (precision(d) === 'year' || precision(d) === 'none') continue
    months.set(ym(d), (months.get(ym(d)) ?? 0) + 1)
  }
  // a continuous run of months so quiet months show as empty bars
  const keys = [...months.keys()].sort()
  const perMonth: Summary['perMonth'] = []
  if (keys.length) {
    const from = range.from ? ym(range.from) : keys[0]!
    const to = range.to ? ym(range.to) : keys[keys.length - 1]!
    for (let m = from, n = 0; m <= to && n < 120; m = addYm(m, 1), n++) perMonth.push({ month: m, count: months.get(m) ?? 0 })
  }
  const newest = (a: Item, b: Item) => earliest(recordDate(b.record)).localeCompare(earliest(recordDate(a.record))) || b.record.updatedAt - a.record.updatedAt
  const lists = {
    finished: [...finishedItems].sort(newest),
    doing: items.filter((i) => i.record.status === 'doing').sort(newest),
    paused: items.filter((i) => i.record.status === 'paused').sort(newest),
    dropped: items.filter((i) => i.record.status === 'dropped' && inRange(recordDate(i.record), range)).sort(newest),
  }
  return {
    finished: lists.finished.length,
    doing: lists.doing.length,
    paused: lists.paused.length,
    dropped: lists.dropped.length,
    lists,
    rated: ratings.length,
    ratedItems: lists.finished.filter((i) => i.record.rating != null),
    average: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
    distribution: getRatingLevels().map((l) => ({ value: l.value, count: dist.get(l.value) ?? 0 })),
    byType: [...types.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
    perMonth,
    unrated: finishedItems.length - ratings.length,
  }
}

export interface DayEvent {
  date: FuzzyDate
  kind: 'start' | 'finish' | 'progress' | 'note'
  work: Work
  record: Rec
  /** for a 'progress' event: the day's entry */
  log?: ProgressLog
  /** for a 'note' event: true for a 筆記, false for a 心得 */
  isNote?: boolean
}

/** every dated thing that happened: starts, finishes, the days progress was logged, and notes */
export function eventsOf(items: Item[], notes: WorkNote[], logs: ProgressLog[] = []): DayEvent[] {
  const out: DayEvent[] = []
  for (const { work, record } of items) {
    if (precision(record.start) !== 'none') out.push({ date: record.start, kind: 'start', work, record })
    if (record.status === 'done' && precision(record.end) !== 'none') out.push({ date: record.end, kind: 'finish', work, record })
  }
  const byRecord = new Map(items.map((it) => [it.record.id, it]))
  for (const log of logs) {
    const it = byRecord.get(log.recordId)
    if (it && precision(log.date) === 'day') out.push({ date: log.date, kind: 'progress', work: it.work, record: it.record, log })
  }
  // a note counts for the work's newest round
  const newest = new Map<string, Item>()
  for (const it of items) if (!newest.has(it.work.id) || it.record.round > newest.get(it.work.id)!.record.round) newest.set(it.work.id, it)
  for (const n of notes) {
    const it = newest.get(n.workId)
    if (it && precision(n.date) === 'day') out.push({ date: n.date, kind: 'note', work: it.work, record: it.record, isNote: n.kind === 'note' })
  }
  return out
}

/** activity count per day (notes + starts + finishes with a full date), for the heatmap */
export function dayCounts(events: DayEvent[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const e of events) if (precision(e.date) === 'day') m.set(e.date, (m.get(e.date) ?? 0) + 1)
  return m
}

/** 0–4 shade for a count, relative to the busiest day */
export function level(count: number, max: number): number {
  if (count <= 0 || max <= 0) return 0
  return Math.min(4, Math.max(1, Math.ceil((count / max) * 4)))
}

/** weeks (Sunday first) covering [from, to]; each cell is a date or '' for padding */
export function heatWeeks(from: string, to: string): string[][] {
  const start = new Date(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, Number(from.slice(8, 10)), 12)
  const weeks: string[][] = []
  let week: string[] = Array.from({ length: start.getDay() }, () => '')
  for (let d = new Date(start); ; d.setDate(d.getDate() + 1)) {
    const s = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (s > to) break
    week.push(s)
    if (week.length === 7) {
      weeks.push(week)
      week = []
    }
  }
  if (week.length) weeks.push([...week, ...Array.from({ length: 7 - week.length }, () => '')])
  return weeks
}

/** one year back from today, so the heatmap always ends on a full recent stretch */
export const lastYearSpan = (now = today()): Range => ({ from: addMonths(now, -12), to: now })

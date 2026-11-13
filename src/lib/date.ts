/**
 * Dates are plain strings so they can be fuzzy: '' (unknown), 'YYYY', 'YYYY-MM' or 'YYYY-MM-DD'.
 * Everything uses the device's local time.
 */
export type FuzzyDate = string
export type Precision = 'none' | 'year' | 'month' | 'day'

export const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

const pad = (n: number) => String(n).padStart(2, '0')

export function precision(d: FuzzyDate): Precision {
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return 'day'
  if (/^\d{4}-\d{2}$/.test(d)) return 'month'
  if (/^\d{4}$/.test(d)) return 'year'
  return 'none'
}

export function today(): string {
  const n = new Date()
  return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`
}

export const ym = (d: string) => d.slice(0, 7)

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate()
}

/** a Date at local noon (immune to DST edges) */
function toDate(d: string): Date {
  return new Date(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)), 12)
}

function fromDate(x: Date): string {
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`
}

export function addDays(d: string, n: number): string {
  const x = toDate(d)
  x.setDate(x.getDate() + n)
  return fromDate(x)
}

/** YYYY-MM moved by n months */
export function addYm(m: string, n: number): string {
  const total = Number(m.slice(0, 4)) * 12 + (Number(m.slice(5, 7)) - 1) + n
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`
}

export function addMonths(d: string, n: number): string {
  const target = addYm(ym(d), n)
  const day = Math.min(Number(d.slice(8, 10)), daysInMonth(Number(target.slice(0, 4)), Number(target.slice(5)) - 1))
  return `${target}-${pad(day)}`
}

export function weekday(d: string): number {
  return toDate(d).getDay()
}

/** the days shown for a month page: whole weeks, Sunday first */
export function monthGrid(m: string): string[] {
  const first = `${m}-01`
  const start = addDays(first, -weekday(first))
  const count = daysInMonth(Number(m.slice(0, 4)), Number(m.slice(5)) - 1)
  const weeks = Math.ceil((weekday(first) + count) / 7)
  return Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i))
}

/** 2026 / 2026/11 / 2026/11/12; '' when unknown */
export function formatFuzzy(d: FuzzyDate, empty = ''): string {
  switch (precision(d)) {
    case 'year':
      return d
    case 'month':
    case 'day':
      return d.replaceAll('-', '/')
    default:
      return empty
  }
}

/** 2026-11-12 style for compact lists; fuzzy dates keep their own precision */
export function formatShort(d: FuzzyDate, empty = ''): string {
  return precision(d) === 'none' ? empty : d
}

/** the first day a fuzzy date could mean, for sorting and for placing it on a timeline */
export function earliest(d: FuzzyDate): string {
  switch (precision(d)) {
    case 'year':
      return `${d}-01-01`
    case 'month':
      return `${d}-01`
    case 'day':
      return d
    default:
      return ''
  }
}

/** the last day a fuzzy date could mean */
export function latest(d: FuzzyDate): string {
  switch (precision(d)) {
    case 'year':
      return `${d}-12-31`
    case 'month':
      return `${d}-${pad(daysInMonth(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1))}`
    case 'day':
      return d
    default:
      return ''
  }
}

/** Does a fuzzy date fall inside [from, to] (full dates)? A fuzzy date counts when it lies wholly inside. */
export function within(d: FuzzyDate, from: string, to: string): boolean {
  if (precision(d) === 'none') return false
  return earliest(d) >= from && latest(d) <= to
}

/** Whole days from start to end, counting both ends (one day = 1). Only exact when both are full dates. */
export function daysSpan(start: FuzzyDate, end: FuzzyDate): number | null {
  if (precision(start) !== 'day' || precision(end) !== 'day') return null
  const diff = Math.round((toDate(end).getTime() - toDate(start).getTime()) / 86400000)
  return diff < 0 ? null : diff + 1
}

/** "12 天", "約 30 天" when one end is fuzzy, or '' when it cannot be told */
export function formatSpan(start: FuzzyDate, end: FuzzyDate): string {
  const exact = daysSpan(start, end)
  if (exact != null) return `${exact} 天`
  if (precision(start) === 'none' || precision(end) === 'none') return ''
  // both ends known but at least one is fuzzy: estimate between the midpoints
  const mid = (d: string) => {
    const a = toDate(earliest(d)).getTime()
    const b = toDate(latest(d)).getTime()
    return (a + b) / 2
  }
  const est = Math.round((mid(end) - mid(start)) / 86400000)
  return est >= 0 ? `約 ${est + 1} 天` : ''
}

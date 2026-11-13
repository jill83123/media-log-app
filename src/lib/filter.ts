import { scoreOf } from './ratings'
import type { Rec, Status, Work, WorkType } from '@/db/types'

export interface LibraryFilter {
  query: string
  types: WorkType[]
  statuses: Status[]
  tagIds: string[]
  categoryId: string
  /** only works whose score (the number the user sees) is at least this; 0 = no limit */
  minRating: number
  /** finished but not scored */
  unrated: boolean
  /** only works with a start or end date in this year ('2026'); '' = every year */
  year: string
}

export const emptyFilter = (): LibraryFilter => ({ query: '', types: [], statuses: [], tagIds: [], categoryId: '', minRating: 0, unrated: false, year: '' })

/** how many filters (besides the search text) are active */
export const filterCount = (f: LibraryFilter) =>
  [f.types.length, f.year ? 1 : 0, f.statuses.length, f.tagIds.length, f.categoryId ? 1 : 0, f.minRating ? 1 : 0, f.unrated ? 1 : 0].filter(Boolean).length

/** categoryId plus every category below it */
export function descendants(id: string, cats: { id: string; parentId?: string }[]): string[] {
  const out = [id]
  for (const c of cats) if (c.parentId === id) out.push(...descendants(c.id, cats))
  return out
}

export function matches(
  item: { work: Work; record?: Rec },
  f: LibraryFilter,
  cats: { id: string; parentId?: string }[] = [],
  /** the years any round of this work started or ended in; a work with no dates at all counts as the current year */
  years?: Set<string>,
): boolean {
  const { work, record } = item
  const q = f.query.trim().toLowerCase()
  if (q && ![work.title, work.originalTitle, work.creators].some((s) => s?.toLowerCase().includes(q))) return false
  if (f.year && years && !years.has(f.year)) return false
  if (f.types.length && !f.types.includes(work.type)) return false
  if (f.statuses.length && !f.statuses.includes(record?.status ?? 'todo')) return false
  if (f.tagIds.length && !f.tagIds.every((t) => work.tagIds.includes(t))) return false
  if (f.categoryId && !(work.categoryId && descendants(f.categoryId, cats).includes(work.categoryId))) return false
  if (f.minRating && !(record?.rating != null && (scoreOf(record.rating) ?? -Infinity) >= f.minRating)) return false
  if (f.unrated && !(record && record.status === 'done' && record.rating == null)) return false
  return true
}

/** the years a work's rounds fall in, by their start and end dates */
export function yearsOf(records: Pick<Rec, 'start' | 'end'>[], fallback: string): Set<string> {
  const out = new Set<string>()
  for (const r of records) for (const d of [r.start, r.end]) if (d) out.add(d.slice(0, 4))
  if (!out.size) out.add(fallback)
  return out
}

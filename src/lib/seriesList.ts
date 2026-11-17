import type { Series, Work } from '@/db/types'

export interface SeriesRow {
  id: string
  name: string
  /** how many works it holds */
  count: number
  /** the work type it mostly holds ('' = no works yet) */
  group: string
  rating?: number
  /** when the series was last changed */
  updatedAt: number
  /** the cover of its first work (the first one that has a cover, if the first has none) */
  cover?: string
}

/** every series with what the lists show of it; the order is the series' own */
export function seriesRows(series: Series[], works: Work[]): SeriesRow[] {
  return series.map((s) => {
    const mine = works.filter((w) => w.seriesId === s.id)
    const counts = new Map<string, number>()
    for (const w of mine) counts.set(w.type, (counts.get(w.type) ?? 0) + 1)
    const group = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
    const cover = [...mine].sort((a, b) => (a.seriesOrder ?? 1e9) - (b.seriesOrder ?? 1e9)).find((w) => w.cover)?.cover
    return { id: s.id, name: s.name, count: mine.length, group, rating: s.rating, updatedAt: s.updatedAt, cover }
  })
}

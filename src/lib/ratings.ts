import { shallowRef } from 'vue'

export interface RatingLevel {
  /** a fixed key, never reused: what a record stores. The defaults use 5, 4.5 … 0.5 (the old star values) */
  value: number
  /** the number the user sees for this level; editable */
  score: number
  name: string
  desc: string
}

/** The default 10 levels. Any number of levels is allowed; numbers, names and descriptions are all editable. */
export const DEFAULT_RATINGS: RatingLevel[] = [
  { value: 5, score: 5, name: '神作', desc: '令人深深著迷，值得反覆回味。' },
  { value: 4.5, score: 4.5, name: '非常推薦', desc: '過程充滿驚喜或十分享受，讓人意猶未盡。' },
  { value: 4, score: 4, name: '推薦', desc: '過程十分享受，雖然有些小缺點，但整體還是很吸引人。' },
  { value: 3.5, score: 3.5, name: '不錯', desc: '沒有感到特別驚艷，但看完後仍感到滿足。' },
  { value: 3, score: 3, name: '還行', desc: '有些亮點，但整體表現偏普通，適合有興趣的人觀看。' },
  { value: 2.5, score: 2.5, name: '普通', desc: '中規中矩，不到喜歡也不反感，適合打發時間。' },
  { value: 2, score: 2, name: '失望', desc: '不如預期，部分不錯但缺點多，可能僅適合特定觀眾。' },
  { value: 1.5, score: 1.5, name: '差', desc: '缺點非常多，很難投入其中，但還是努力多看了幾集。' },
  { value: 1, score: 1, name: '非常差', desc: '幾乎沒有值得稱讚的地方，很快就放棄了。' },
  { value: 0.5, score: 0.5, name: '踩雷', desc: '完全不值得浪費時間。' },
]

/** best first: by score, ties by key */
export const sortLevels = (l: RatingLevel[]) => [...l].sort((a, b) => b.score - a.score || b.value - a.value)

/**
 * The user's levels. Nothing saved → the defaults. A saved list is the whole list, of any length.
 */
export function mergeRatings(saved: Partial<RatingLevel>[] | undefined): RatingLevel[] {
  const ok = (saved ?? []).filter((s) => typeof s.value === 'number' && Number.isFinite(s.value))
  if (!ok.length) return sortLevels(DEFAULT_RATINGS)
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
  const byKey = new Map<number, RatingLevel>()
  for (const s of ok) {
    byKey.set(s.value!, { value: s.value!, score: num(s.score, s.value!), name: s.name ?? '', desc: s.desc ?? '' })
  }
  return sortLevels([...byKey.values()])
}

/** a key for a new level that no record has used */
export const newLevelKey = (l: RatingLevel[]) => Math.floor(Math.max(0, ...l.map((x) => x.value))) + 1

const levelsRef = shallowRef(sortLevels(DEFAULT_RATINGS))
/** the settings store keeps this in step with the user's levels, so every screen shows the same numbers */
export const setRatingLevels = (l: RatingLevel[]) => (levelsRef.value = sortLevels(l))
export const getRatingLevels = () => levelsRef.value

/** the number shown for a stored rating; undefined when its level no longer exists */
export const scoreOf = (key: number): number | undefined => levelsRef.value.find((l) => l.value === key)?.score

/** 0.5 … 5 stars for a level, from its place in the list: the best is 5, the worst the smallest step */
export function starsOf(key: number): number {
  const n = levelsRef.value.length
  const i = levelsRef.value.findIndex((l) => l.value === key)
  if (i < 0 || n === 0) return 0
  return Math.max(0.5, Math.round(((5 * (n - i)) / n) * 2) / 2)
}

/** "4.5", "5", "10", "92.46": whole numbers lose the ".0", one decimal below 10 */
export function formatScore(score: number): string {
  const r = Math.round(score * 100) / 100
  return Number.isInteger(r) || Math.abs(r) >= 10 ? String(r) : r.toFixed(1)
}

export function formatRating(key: number | null | undefined): string {
  if (key == null) return '未評分'
  const s = scoreOf(key)
  return s == null ? '—' : formatScore(s)
}

/** how many of 5 stars are full / half / empty, e.g. 3.5 → 3 full + 1 half */
export function starParts(v: number): { full: number; half: boolean; empty: number } {
  const full = Math.floor(v)
  const half = v - full >= 0.5
  return { full, half, empty: 5 - full - (half ? 1 : 0) }
}

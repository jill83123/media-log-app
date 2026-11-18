import { shallowRef } from 'vue'
import type { Status, WorkType } from '@/db/types'

export interface TypeDef {
  value: WorkType
  label: string
  unit: string
  /** left out of the pickers (works of this type stay and still show their name) */
  hidden?: boolean
  /** added by the user: can be renamed and deleted */
  custom?: boolean
}

export const DEFAULT_TYPES: TypeDef[] = [
  { value: 'anime', label: '動畫', unit: '集' },
  { value: 'series', label: '劇集', unit: '集' },
  { value: 'movie', label: '電影', unit: '%' },
  { value: 'manga', label: '漫畫', unit: '話' },
  { value: 'novel', label: '小說', unit: '%' },
  { value: 'book', label: '書籍', unit: '頁' },
]
export const BUILTIN_TYPE_IDS = DEFAULT_TYPES.map((t) => t.value)

/** the saved list is the user's order; built-in types that are missing from it are put back at the end */
export function mergeTypes(saved: Partial<TypeDef>[]): TypeDef[] {
  const out: TypeDef[] = []
  for (const t of saved) {
    if (!t.value || t.value === 'lightnovel' || out.some((x) => x.value === t.value)) continue
    const base = DEFAULT_TYPES.find((d) => d.value === t.value)
    out.push({ value: t.value, label: t.label || base?.label || t.value, unit: t.unit ?? base?.unit ?? '%', hidden: !!t.hidden, custom: !base })
  }
  for (const d of DEFAULT_TYPES) if (!out.some((x) => x.value === d.value)) out.push({ ...d })
  return out
}

const typesRef = shallowRef<TypeDef[]>(DEFAULT_TYPES)
/** the settings store keeps this in step with the user's list */
export const setTypes = (list: TypeDef[]) => (typesRef.value = list)
/** every type, in the user's order */
export const allTypes = () => typesRef.value
/** the types to offer in pickers, plus `keep` if a work already has that (hidden) type */
export const workTypes = (keep?: WorkType) => typesRef.value.filter((t) => !t.hidden || t.value === keep)
export const typeLabel = (t: WorkType) => typesRef.value.find((x) => x.value === t)?.label ?? '未分類'
export const typeUnit = (t: WorkType) => typesRef.value.find((x) => x.value === t)?.unit ?? '%'

export const STATUSES: { value: Status; label: string; tone: string }[] = [
  { value: 'todo', label: '未看', tone: 'bg-surface-2 text-muted' },
  { value: 'doing', label: '在看', tone: 'bg-primary-soft text-primary-strong' },
  { value: 'paused', label: '閒置', tone: 'bg-warn/15 text-warn' },
  { value: 'done', label: '看完', tone: 'bg-success/15 text-success' },
  { value: 'dropped', label: '拋棄', tone: 'bg-danger/15 text-danger' },
]
export const statusLabel = (s: Status) => STATUSES.find((x) => x.value === s)?.label ?? s

/** "7%", "6 / 12 集", "12 集（連載中）" */
export function progressText(p: { current: number; total: number; unit: string; infinite: boolean }): string {
  const pct = p.unit === '%'
  if (p.infinite || !p.total) return pct ? `${p.current}%` : `${p.current} ${p.unit}`
  return pct ? `${p.current}%` : `${p.current} / ${p.total} ${p.unit}`
}
/**
 * A day's `from` is stored as where the round stood BEFORE the day (the previous day's end, so days chain), but it is shown
 * and edited as the first step of that day: stored 14 → shown 15. Only the display/edit layer converts; stored data is untouched.
 */
export const fromToStart = (from: number) => from + 1
export const startToFrom = (start: number) => Math.max(0, start - 1)
/**
 * Every unit (% included), range of that day's steps plus the gap: stored 14 → 17 → "進度 15～17 集（3 集）",
 * 3 → 8% → "進度 4～8%（5%）", 17 → 18 → "進度 18 集（1 集）". Only where it got to is known → "進度 4%".
 */
export function progressLogParts(l: { value: number; from?: number }, unit: string): { text: string; diff: string } {
  const diff = l.from != null ? l.value - l.from : 0
  const u = unit === '%' ? '%' : ` ${unit}`
  if (l.from == null || diff <= 0) return { text: `進度 ${l.value}${u}`, diff: '' }
  const start = fromToStart(l.from)
  return { text: `進度 ${start === l.value ? l.value : `${start}～${l.value}`}${u}`, diff: `（${diff}${u}）` }
}
export function progressLogText(l: { value: number; from?: number }, unit: string): string {
  const p = progressLogParts(l, unit)
  return p.text + p.diff
}
export const progressRatio = (p: { current: number; total: number; infinite: boolean }) =>
  p.infinite || !p.total ? 0 : Math.min(1, p.current / p.total)

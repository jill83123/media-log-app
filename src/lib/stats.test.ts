import { describe, expect, it } from 'vitest'
import type { Rec, Work } from '@/db/types'
import { dayCounts, eventsOf, heatWeeks, inRange, itemsOf, level, rangeOf, summarize } from './stats'

const w = (id: string, type: Work['type'] = 'anime'): Work => ({ id, updatedAt: 0, title: id, type, tagIds: [] })
const r = (p: Partial<Rec> & { workId: string }): Rec => ({
  id: p.workId + (p.round ?? 1), updatedAt: 0, round: 1, status: 'done',
  progress: { current: 0, total: 0, unit: '集', infinite: false }, rating: null, start: '', end: '', ...p,
})

describe('ranges', () => {
  it('builds presets from a date', () => {
    expect(rangeOf('month', '2026-11-12')).toEqual({ from: '2026-11-01', to: '2026-11-30' })
    expect(rangeOf('lastMonth', '2026-01-10')).toEqual({ from: '2025-12-01', to: '2025-12-31' })
    expect(rangeOf('3m', '2026-11-12')).toEqual({ from: '2026-09-01', to: '2026-11-30' })
    expect(rangeOf('lastYear', '2026-11-12')).toEqual({ from: '2025-01-01', to: '2025-12-31' })
    expect(rangeOf('all')).toEqual({ from: '', to: '' })
  })
  it('puts fuzzy dates inside a range only when wholly inside', () => {
    const month = rangeOf('month', '2026-11-12')
    expect(inRange('2026-11', month)).toBe(true)
    expect(inRange('2026', month)).toBe(false)
    expect(inRange('', month)).toBe(false)
    expect(inRange('', { from: '', to: '' })).toBe(true)
  })
})

describe('summary', () => {
  const works = [w('a'), w('b', 'movie'), w('c')]
  const records = [
    r({ workId: 'a', end: '2026-10-05', rating: 4.5 }),
    r({ workId: 'b', end: '2026-11', rating: 3 }),
    r({ workId: 'c', end: '2026-11-02' }),
    r({ workId: 'c', round: 2, status: 'doing', start: '2026-11-10' }),
  ]
  it('counts finished, averages scores and leaves unrated out of the average', () => {
    const s = summarize(itemsOf(works, records, []), rangeOf('all'))
    expect(s.finished).toBe(3)
    expect(s.rated).toBe(2)
    expect(s.average).toBeCloseTo(3.75)
    expect(s.unrated).toBe(1)
    expect(s.doing).toBe(1)
    expect(s.distribution.find((d) => d.value === 4.5)?.count).toBe(1)
    expect(s.distribution).toHaveLength(10)
  })
  it('filters by type and range', () => {
    expect(summarize(itemsOf(works, records, ['movie']), rangeOf('all')).finished).toBe(1)
    expect(summarize(itemsOf(works, records, []), rangeOf('month', '2026-11-12')).finished).toBe(2)
  })
  it('fills quiet months with zero', () => {
    const s = summarize(itemsOf(works, records, []), rangeOf('3m', '2026-11-12'))
    expect(s.perMonth.map((m) => m.month)).toEqual(['2026-09', '2026-10', '2026-11'])
    expect(s.perMonth.map((m) => m.count)).toEqual([0, 1, 2])
  })
})

describe('events and heatmap', () => {
  it('collects starts, finishes and notes; the heatmap only uses full dates', () => {
    const items = itemsOf([w('a')], [r({ workId: 'a', start: '2026-10-05', end: '2026-11' })], [])
    const ev = eventsOf(items, [{ id: 'n', updatedAt: 0, workId: 'a', date: '2026-10-05', body: 'x' }])
    expect(ev.map((e) => e.kind).sort()).toEqual(['finish', 'note', 'start'])
    expect(dayCounts(ev).get('2026-10-05')).toBe(2)
    expect([...dayCounts(ev).keys()]).toEqual(['2026-10-05'])
  })
  it('counts the days progress was logged, but only for rounds that are in the list', () => {
    const items = itemsOf([w('a'), w('b')], [r({ workId: 'a', status: 'doing' }), r({ workId: 'b', status: 'doing' })], ['anime'])
    const logs = [
      { id: 'l1', updatedAt: 0, workId: 'a', recordId: 'a1', date: '2026-10-06', value: 3 },
      { id: 'l2', updatedAt: 0, workId: 'a', recordId: 'a1', date: '2026-10', value: 4 },
      { id: 'l3', updatedAt: 0, workId: 'zz', recordId: 'zz1', date: '2026-10-07', value: 1 },
    ]
    const ev = eventsOf(items, [], logs)
    expect(ev.filter((e) => e.kind === 'progress').map((e) => e.date)).toEqual(['2026-10-06'])
  })
  it('shades relative to the busiest day', () => {
    expect(level(0, 5)).toBe(0)
    expect(level(1, 5)).toBe(1)
    expect(level(5, 5)).toBe(4)
  })
  it('lays dates into Sunday-first weeks', () => {
    const weeks = heatWeeks('2026-11-01', '2026-11-14')
    expect(weeks[0]![0]).toBe('2026-11-01') // 2026-11-01 is a Sunday
    expect(weeks).toHaveLength(2)
    expect(weeks.every((x) => x.length === 7)).toBe(true)
  })
})

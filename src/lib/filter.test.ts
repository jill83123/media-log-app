import { describe, expect, it } from 'vitest'
import type { Rec, Work } from '@/db/types'
import { creatorNames, emptyFilter, matches } from './filter'

const work = (p: Partial<Work> = {}): Work => ({ id: 'w', updatedAt: 0, title: 'Silent Witch', type: 'novel', tagIds: ['a'], ...p })
const rec = (p: Partial<Rec> = {}): Rec => ({
  id: 'r', updatedAt: 0, workId: 'w', round: 1, status: 'doing',
  progress: { current: 0, total: 0, unit: '%', infinite: false }, rating: null, start: '', end: '', ...p,
})

describe('library filter', () => {
  it('matches title, original title and creators', () => {
    const f = { ...emptyFilter(), query: 'witch' }
    expect(matches({ work: work() }, f)).toBe(true)
    expect(matches({ work: work({ title: 'x', creators: 'Witch Author' }) }, f)).toBe(true)
    expect(matches({ work: work({ title: 'x' }) }, f)).toBe(false)
  })
  it('requires all chosen tags and any chosen status', () => {
    expect(matches({ work: work(), record: rec() }, { ...emptyFilter(), tagIds: ['a', 'b'] })).toBe(false)
    expect(matches({ work: work(), record: rec() }, { ...emptyFilter(), statuses: ['doing', 'done'] })).toBe(true)
    expect(matches({ work: work() }, { ...emptyFilter(), statuses: ['todo'] })).toBe(true)
  })
  it('finds finished works without a score', () => {
    const f = { ...emptyFilter(), unrated: true }
    expect(matches({ work: work(), record: rec({ status: 'done' }) }, f)).toBe(true)
    expect(matches({ work: work(), record: rec({ status: 'done', rating: 4 }) }, f)).toBe(false)
  })
  it('splits creators into names and filters by exactly one name', () => {
    expect(creatorNames('A、B / C, D，A')).toEqual(['A', 'B', 'C', 'D'])
    expect(creatorNames('J.K.羅琳')).toEqual(['J.K.羅琳'])
    expect(creatorNames(undefined)).toEqual([])
    const f = { ...emptyFilter(), creator: '東野圭吾' }
    expect(matches({ work: work({ creators: '東野圭吾' }) }, f)).toBe(true)
    expect(matches({ work: work({ creators: '某某、東野圭吾' }) }, f)).toBe(true)
    // a different name that merely contains it does not count
    expect(matches({ work: work({ creators: '東野圭吾朗' }) }, f)).toBe(false)
    expect(matches({ work: work() }, f)).toBe(false)
  })
  it('category filter includes sub-categories', () => {
    const cats = [{ id: 'p' }, { id: 'c', parentId: 'p' }]
    expect(matches({ work: work({ categoryId: 'c' }) }, { ...emptyFilter(), categoryId: 'p' }, cats)).toBe(true)
  })
})

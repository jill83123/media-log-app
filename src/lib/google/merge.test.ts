import { describe, expect, it } from 'vitest'
import { mergeRows, purgeOld } from './merge'

const row = (id: string, updatedAt: number, extra: object = {}) => ({ id, updatedAt, ...extra })

describe('mergeRows', () => {
  it('takes the newer copy of each row', () => {
    const r = mergeRows([row('a', 5, { v: 'mine' })], [row('a', 9, { v: 'theirs' })])
    expect(r.merged).toEqual([row('a', 9, { v: 'theirs' })])
    expect(r.toLocal).toHaveLength(1)
    expect(r.sheetStale).toBe(false)
  })
  it('keeps this device copy on a tie or when newer, and flags the sheet', () => {
    expect(mergeRows([row('a', 5)], [row('a', 5)])).toMatchObject({ toLocal: [], sheetStale: false })
    expect(mergeRows([row('a', 9)], [row('a', 5)])).toMatchObject({ toLocal: [], sheetStale: true })
  })
  it('combines rows that exist on one side only', () => {
    const r = mergeRows([row('a', 1)], [row('b', 1)])
    expect(r.merged.map((x) => x.id).sort()).toEqual(['a', 'b'])
    expect(r.toLocal.map((x) => x.id)).toEqual(['b'])
    expect(r.sheetStale).toBe(true)
  })
  it('lets a newer deletion win', () => {
    const r = mergeRows([row('a', 5)], [row('a', 9, { deleted: true })])
    expect(r.merged[0]).toMatchObject({ deleted: true })
    expect(r.toLocal).toHaveLength(1)
  })
})

describe('purgeOld', () => {
  it('drops old tombstones only', () => {
    const now = 200 * 86400000
    const rows = [row('old', 1, { deleted: true }), row('new', now - 1000, { deleted: true }), row('live', 1)]
    expect(purgeOld(rows, now).map((x) => x.id)).toEqual(['new', 'live'])
  })
})

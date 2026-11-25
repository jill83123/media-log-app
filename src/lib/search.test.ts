import { describe, expect, it } from 'vitest'
import { defaultRoles, joinRoles, rolesOf } from './search'

describe('creator roles', () => {
  it('takes a single text as the director for films and shows, the author otherwise', () => {
    expect(rolesOf({ creators: '宮崎駿', type: 'movie' })).toEqual({ director: '宮崎駿' })
    expect(rolesOf({ creators: '東野圭吾', type: 'novel' })).toEqual({ author: '東野圭吾' })
    expect(rolesOf({ creators: '', roles: undefined })).toEqual({})
    expect(rolesOf({ creators: 'x', roles: { studio: 'MADHOUSE' } })).toEqual({ studio: 'MADHOUSE' })
  })
  it('switches on only the author at first, the director for films', () => {
    const all = { author: '山田鐘人', director: '斎藤圭一郎', studio: 'MADHOUSE', publisher: '小學館' }
    expect(defaultRoles(all, 'anime')).toEqual(['author'])
    expect(defaultRoles(all, 'movie')).toEqual(['director'])
    // no author: the first one that exists, so the choice is not empty
    expect(defaultRoles({ director: '甲', studio: '乙' }, 'anime')).toEqual(['director'])
    expect(defaultRoles({}, 'anime')).toEqual([])
  })
  it('joins the switched-on names once each, in a fixed order', () => {
    const all = { author: '甲', director: '乙', studio: '丙、甲' }
    expect(joinRoles(all, ['studio', 'author'])).toBe('甲、丙')
    expect(joinRoles(all, [])).toBe('')
  })
})

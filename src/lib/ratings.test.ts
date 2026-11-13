import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_RATINGS, formatRating, formatScore, mergeRatings, newLevelKey, scoreOf, setRatingLevels, starsOf } from './ratings'

afterEach(() => setRatingLevels(DEFAULT_RATINGS))

describe('rating levels', () => {
  it('defaults to ten levels, best first', () => {
    const l = mergeRatings([])
    expect(l).toHaveLength(10)
    expect(l[0]!.value).toBe(5)
    expect(formatRating(4.5)).toBe('4.5')
    expect(formatRating(5)).toBe('5')
    expect(formatRating(null)).toBe('未評分')
  })
  it('treats a saved list as the whole list, of any length', () => {
    const l = mergeRatings([
      { value: 1, score: 3, name: '好', desc: '' },
      { value: 2, score: 2, name: '普通', desc: '' },
      { value: 3, score: 1, name: '差', desc: '' },
    ])
    expect(l.map((x) => x.name)).toEqual(['好', '普通', '差'])
    setRatingLevels(l)
    expect(starsOf(1)).toBe(5)
    expect(starsOf(3)).toBe(1.5) // worst of three: 5 * 1/3 = 1.67, to the nearest half
  })
  it('keeps the star count of ten levels at 5 … 0.5', () => {
    expect(starsOf(5)).toBe(5)
    expect(starsOf(4.5)).toBe(4.5)
    expect(starsOf(0.5)).toBe(0.5)
  })
  it('shows the user numbers and a dash for a removed level', () => {
    setRatingLevels([{ value: 1, score: 100, name: 'a', desc: '' }])
    expect(formatRating(1)).toBe('100')
    expect(formatRating(9)).toBe('—')
    expect(scoreOf(9)).toBeUndefined()
  })
  it('picks a new key above every existing one', () => {
    expect(newLevelKey(DEFAULT_RATINGS)).toBe(6)
    expect(newLevelKey([])).toBe(1)
  })
  it('formats large and small scores', () => {
    expect(formatScore(85)).toBe('85')
    expect(formatScore(9.5)).toBe('9.5')
    expect(formatScore(92.456)).toBe('92.46')
  })
})

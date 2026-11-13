import { describe, expect, it } from 'vitest'
import { addMonths, addYm, daysSpan, earliest, formatFuzzy, formatSpan, latest, monthGrid, precision, within } from './date'

describe('fuzzy dates', () => {
  it('detects precision', () => {
    expect(precision('')).toBe('none')
    expect(precision('2026')).toBe('year')
    expect(precision('2026-11')).toBe('month')
    expect(precision('2026-11-12')).toBe('day')
    expect(precision('2026-1')).toBe('none')
  })
  it('formats', () => {
    expect(formatFuzzy('2026-11')).toBe('2026/11')
    expect(formatFuzzy('2026-11-05')).toBe('2026/11/05')
    expect(formatFuzzy('', '不填')).toBe('不填')
  })
  it('bounds a fuzzy date', () => {
    expect(earliest('2026-02')).toBe('2026-02-01')
    expect(latest('2026-02')).toBe('2026-02-28')
    expect(latest('2024-02')).toBe('2024-02-29')
    expect(latest('2026')).toBe('2026-12-31')
  })
  it('range check needs the whole fuzzy span inside', () => {
    expect(within('2026-11', '2026-11-01', '2026-11-30')).toBe(true)
    expect(within('2026-11', '2026-11-05', '2026-11-30')).toBe(false)
    expect(within('', '2026-01-01', '2026-12-31')).toBe(false)
  })
  it('counts days inclusively, exactly only for full dates', () => {
    expect(daysSpan('2026-10-05', '2026-10-05')).toBe(1)
    expect(daysSpan('2026-10-05', '2026-11-12')).toBe(39)
    expect(daysSpan('2026-10', '2026-11-12')).toBeNull()
    expect(daysSpan('2026-11-12', '2026-10-05')).toBeNull()
  })
  it('formats a span with an estimate for fuzzy ends and blank when unknown', () => {
    expect(formatSpan('2026-10-05', '2026-11-12')).toBe('39 天')
    expect(formatSpan('2026-10', '2026-11')).toMatch(/^約 \d+ 天$/)
    expect(formatSpan('', '2026-11-12')).toBe('')
  })
  it('month math', () => {
    expect(addYm('2026-12', 1)).toBe('2027-01')
    expect(addYm('2026-01', -1)).toBe('2025-12')
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
  })
  it('month grid is whole weeks starting on Sunday', () => {
    const g = monthGrid('2026-11')
    expect(g.length % 7).toBe(0)
    expect(g).toContain('2026-11-30')
  })
})

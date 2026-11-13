import { describe, expect, it } from 'vitest'
import { planSlots } from './reminders'

// 2026-11-12 10:00 local
const now = new Date(2026, 10, 12, 10, 0).getTime()
const base = { now, time: '21:00', daily: true, doing: [], activeToday: false }

describe('planSlots', () => {
  it('plans a daily reminder for two weeks, starting today when the time has not passed', () => {
    const s = planSlots(base)
    expect(s).toHaveLength(14)
    expect(new Date(s[0]!.t).getDate()).toBe(12)
    expect(new Date(s[0]!.t).getHours()).toBe(21)
  })
  it('starts tomorrow when the time already passed or today is already recorded', () => {
    expect(new Date(planSlots({ ...base, now: new Date(2026, 10, 12, 22, 0).getTime() })[0]!.t).getDate()).toBe(13)
    expect(new Date(planSlots({ ...base, activeToday: true })[0]!.t).getDate()).toBe(13)
  })
  it('names the works in progress', () => {
    const s = planSlots({ ...base, doing: [{ id: 'a', title: '芙莉蓮' }] })
    expect(s[0]!.body).toContain('《芙莉蓮》')
  })
  it('plans nothing when everything is off', () => {
    expect(planSlots({ ...base, daily: false })).toEqual([])
  })
})

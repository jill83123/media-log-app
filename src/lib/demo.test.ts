import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import { today } from './date'
import { loadDemo } from './demo'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('sample data', () => {
  it('has believable days: never in the future, never going backwards or past the total, with days skipped', async () => {
    await loadDemo()
    const recs = new Map((await db.records.toArray()).map((r) => [r.id, r]))
    const logs = await db.progressLogs.toArray()
    expect(logs.length).toBeGreaterThan(100)
    const byRec = new Map<string, typeof logs>()
    for (const l of logs) byRec.set(l.recordId, [...(byRec.get(l.recordId) ?? []), l])
    for (const [id, list] of byRec) {
      const r = recs.get(id)!
      const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date))
      sorted.forEach((l, i) => {
        expect(l.date <= today()).toBe(true)
        expect(l.date >= r.start).toBe(true)
        if (l.from != null) expect(l.from).toBeLessThan(l.value)
        if (i) expect(l.value).toBeGreaterThanOrEqual(sorted[i - 1]!.value)
        if (!r.progress.infinite && r.progress.total) expect(l.value).toBeLessThanOrEqual(r.progress.total)
      })
      expect(sorted[sorted.length - 1]!.value).toBe(r.progress.current)
    }
    // some days were filled in afterwards and only know where they got to
    expect(logs.some((l) => l.from == null)).toBe(true)
    // notes written along the way say how far in they were
    expect((await db.notes.toArray()).some((n) => n.kind === 'note' && n.progress != null)).toBe(true)
  })
})

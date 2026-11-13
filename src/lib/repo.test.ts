import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import { createRecord, createWork, logProgress, remove, removeRecord, setProgress, startNewRound } from './repo'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('records', () => {
  it('numbers rounds and keeps old rounds when starting again', async () => {
    const w = await createWork({ title: 'A', type: 'anime' })
    const r1 = await createRecord(w.id, { status: 'done', progress: { current: 12, total: 12, unit: '集', infinite: false } })
    const r2 = await startNewRound(r1)
    expect(r2.round).toBe(2)
    expect(r2.progress.current).toBe(0)
    expect(r2.progress.total).toBe(12)
    expect(await db.records.where('workId').equals(w.id).count()).toBe(2)
  })

  it('starts the work on the first progress and gives every round a start date', async () => {
    const w = await createWork({ title: 'B', type: 'book' })
    let r = await createRecord(w.id, { progress: { current: 0, total: 100, unit: '%', infinite: false } })
    r = await setProgress(r, 7)
    expect(r.status).toBe('doing')
    expect(r.start).not.toBe('')
    expect(r.progress.current).toBe(7)
  })

  it('finishes at the total, but never for infinite progress', async () => {
    const w = await createWork({ title: 'C', type: 'anime' })
    const r = await createRecord(w.id, { progress: { current: 0, total: 12, unit: '集', infinite: false } })
    expect((await setProgress(r, 12)).status).toBe('done')
    const inf = await createRecord(w.id, { progress: { current: 0, total: 12, unit: '集', infinite: true } })
    expect((await setProgress(inf, 50)).status).toBe('doing')
  })

  it('logs where a round got to, once per day, and the latest value of the day wins', async () => {
    const w = await createWork({ title: 'E', type: 'anime' })
    let r = await createRecord(w.id, { progress: { current: 0, total: 12, unit: '集', infinite: false } })
    r = await setProgress(r, 3)
    r = await setProgress(r, 5)
    const logs = await db.progressLogs.where('recordId').equals(r.id).toArray()
    expect(logs).toHaveLength(1)
    expect(logs[0]!.value).toBe(5)
    await logProgress(r, 2, '2026-01-01')
    expect(await db.progressLogs.where('recordId').equals(r.id).count()).toBe(2)
    await removeRecord(r.id)
    expect((await db.progressLogs.where('recordId').equals(r.id).toArray()).every((l) => l.deleted)).toBe(true)
  })

  it('removing only marks the row', async () => {
    const w = await createWork({ title: 'D', type: 'movie' })
    await remove('works', w.id)
    expect((await db.works.get(w.id))?.deleted).toBe(true)
  })
})

import { db, table } from '@/db'
import type { Base, TableName } from '@/db/types'
import * as dv from './drive'
import { mergeRows, purgeOld } from './merge'
import { today } from '../date'
import { pruneLocalImages, referencedImages, unusedImages } from '../imageGc'

/** hooks that watch the database should ignore writes made while a sync applies remote rows */
export const syncFlags = { applying: false }

export interface SyncSettings {
  /** the data file in the app's hidden Drive folder */
  dataFileId: string
}

export interface SharedValue {
  key: string
  updatedAt: number
  value: unknown
}

export interface SyncOptions {
  token: string
  ids: SyncSettings
  /** settings shared between devices (rating levels, units) */
  shared: { get: () => SharedValue[]; apply: (key: string, value: unknown, updatedAt: number) => void }
  /** the engine reports new ids it created so they can be remembered */
  save: (ids: Partial<SyncSettings>) => void
  /** called once this device and Drive agree; what is left (clean-up) does not touch the data */
  onMerged?: () => void
}

export interface SyncResult {
  /** rows taken from Drive */
  pulled: number
  /** the Drive copy was rewritten (it was missing rows or had older ones) */
  pushed: boolean
}

/** what the data file holds: every table's rows (deleted ones as tombstones) and the shared settings */
interface DataFile {
  v: 1
  tables: Partial<Record<TableName, Base[]>>
  settings: SharedValue[]
}

const TABLE_NAMES: TableName[] = ['works', 'records', 'notes', 'progressLogs', 'series', 'tags', 'categories']

/** the data file's id and contents; both empty when it has not been made yet */
async function loadFile(o: SyncOptions): Promise<{ id: string; data: DataFile | null }> {
  let id = o.ids.dataFileId
  if (id) {
    try {
      return { id, data: await dv.readData<DataFile>(o.token, id) }
    } catch (e) {
      if (!(e instanceof dv.DriveNotFoundError)) throw e
    }
  }
  id = (await dv.findDataFile(o.token)) ?? ''
  if (!id) return { id: '', data: null }
  return { id, data: await dv.readData<DataFile>(o.token, id) }
}

/**
 * Local pictures (data: URLs) go to Drive and the work then points at the Drive file.
 * A cover whose Drive file is missing (made before the move to the hidden folder) is uploaded again from the copy kept here.
 */
async function uploadCovers(o: SyncOptions, remote: Map<string, dv.RemoteImage>) {
  const works = await db.works.filter((w) => !w.deleted && !!w.cover).toArray()
  for (const w of works) {
    let blob: Blob | undefined
    if (w.cover!.startsWith('data:')) blob = await (await fetch(w.cover!)).blob()
    else if (w.cover!.startsWith('drive:')) {
      const id = w.cover!.slice('drive:'.length)
      if (!remote.has(id)) blob = (await db.images.get(id))?.blob
    }
    if (!blob) continue
    const fileId = await dv.uploadImage(o.token, { id: w.id, blob })
    await db.transaction('rw', db.images, db.works, async () => {
      await db.images.put({ id: fileId, blob: blob! })
      await db.works.update(w.id, { cover: `drive:${fileId}`, updatedAt: Date.now() })
    })
  }
}

export async function runSync(o: SyncOptions): Promise<SyncResult> {
  const { token } = o
  // the data file and the picture list are independent requests
  const [file, images] = await Promise.all([loadFile(o), dv.listImages(token)])
  const remoteData = file.data
  await uploadCovers(o, images)

  let pulled = 0
  let stale = !remoteData
  const out: DataFile = { v: 1, tables: {}, settings: [] }

  for (const name of TABLE_NAMES) {
    const remote = remoteData?.tables?.[name] ?? []
    const tbl = table(name) as unknown as { toArray(): Promise<Base[]>; bulkPut(r: Base[]): Promise<unknown>; bulkDelete(ids: string[]): Promise<void> }
    const local = await tbl.toArray()
    const r = mergeRows(local, remote)
    if (r.toLocal.length) {
      syncFlags.applying = true
      try {
        await tbl.bulkPut(r.toLocal)
      } finally {
        syncFlags.applying = false
      }
      pulled += r.toLocal.length
    }
    const keep = purgeOld(r.merged)
    if (keep.length !== r.merged.length) {
      syncFlags.applying = true
      try {
        const keepIds = new Set(keep.map((x) => x.id))
        await tbl.bulkDelete(r.merged.filter((x) => !keepIds.has(x.id)).map((x) => x.id))
      } finally {
        syncFlags.applying = false
      }
      stale = true
    }
    if (r.sheetStale) stale = true
    out.tables[name] = [...keep].sort((a, b) => b.updatedAt - a.updatedAt)
  }

  // shared settings: one entry per key
  const theirs = new Map((remoteData?.settings ?? []).map((s) => [s.key, s]))
  for (const m of o.shared.get()) {
    const t = theirs.get(m.key)
    if (t && t.updatedAt > m.updatedAt) o.shared.apply(m.key, t.value, t.updatedAt)
    else if (!t || t.updatedAt < m.updatedAt) stale = true
  }
  out.settings = o.shared.get()

  if (stale) {
    // the backup is of what Drive held before, which is already in memory, so it can go up while the new data does
    const [id] = await Promise.all([dv.writeData(token, file.id, out), remoteData ? backUp(token, remoteData) : undefined])
    if (id !== o.ids.dataFileId) o.save({ dataFileId: id })
  } else if (file.id !== o.ids.dataFileId) o.save({ dataFileId: file.id })
  o.onMerged?.()

  // pictures only become unused when rows changed, here or on Drive
  if (stale || pulled) await cleanImages(o, images)
  return { pulled, pushed: stale }
}

/** how many backups of each kind (daily, manual) Drive keeps */
export const KEEP_BACKUPS = 3

export interface BackupInfo {
  id: string
  /** 'auto' = the daily one, 'manual' = made with the button */
  kind: 'auto' | 'manual'
  /** "11/13" or "11/13 16:28" */
  label: string
}

const pad = (n: number) => String(n).padStart(2, '0')

/** the backups in Drive, newest first */
export async function listBackupInfos(token: string): Promise<BackupInfo[]> {
  return (await dv.listBackups(token)).map((f) => {
    const manual = f.name.startsWith(dv.MANUAL_PREFIX)
    const m = f.name.slice((manual ? dv.MANUAL_PREFIX : dv.AUTO_PREFIX).length).match(/^(\d{4})-(\d{2})-(\d{2})(?:-(\d{2})(\d{2}))?/)
    const label = m ? `${m[1]}/${m[2]}/${m[3]}${m[4] ? ` ${m[4]}:${m[5]}` : ''}` : f.name
    return { id: f.id, kind: manual ? 'manual' : 'auto', label }
  })
}

/** keeps only the newest KEEP_BACKUPS files of one kind */
async function trimBackups(token: string, prefix: string) {
  const mine = (await dv.listBackups(token)).filter((f) => f.name.startsWith(prefix))
  for (const old of mine.slice(KEEP_BACKUPS)) await dv.deleteFile(token, old.id)
}

/**
 * The first time the data file is about to be rewritten on a day, the copy as it was before is kept as that day's backup;
 * only the newest few are kept. A failure here must not stop the sync.
 */
async function backUp(token: string, before: DataFile) {
  try {
    const day = today()
    const d = new Date()
    const name = `${dv.AUTO_PREFIX}${day}-${pad(d.getHours())}${pad(d.getMinutes())}.json`
    if (!(await dv.listBackups(token)).some((f) => f.name.startsWith(`${dv.AUTO_PREFIX}${day}`))) await dv.writeBackup(token, name, before)
    await trimBackups(token, dv.AUTO_PREFIX)
  } catch {
    /* tried again at the next sync */
  }
}

/** keeps a copy of what Drive holds right now (call after a sync, so it is up to date) */
export async function backUpNow(o: SyncOptions) {
  const file = await loadFile(o)
  if (!file.data) throw new Error('雲端還沒有資料可以備份')
  const d = new Date()
  const stamp = `${today()}-${pad(d.getHours())}${pad(d.getMinutes())}`
  await dv.writeBackup(o.token, `${dv.MANUAL_PREFIX}${stamp}.json`, file.data)
  await trimBackups(o.token, dv.MANUAL_PREFIX)
}

/**
 * Puts a backup's contents back on this device. Every row is stamped as changed now (and rows the backup does not have
 * are marked deleted), so the next sync makes the other devices and Drive follow instead of undoing it.
 */
export async function restoreBackup(o: SyncOptions, fileId: string) {
  await applyData(o.shared, await dv.readData<DataFile>(o.token, fileId))
}

/** everything on this device as a JSON-able object (for the export file) */
export async function exportData(shared: SyncOptions['shared']): Promise<DataFile> {
  const out: DataFile = { v: 1, tables: {}, settings: shared.get() }
  for (const name of TABLE_NAMES) out.tables[name] = await (table(name) as unknown as { toArray(): Promise<Base[]> }).toArray()
  return out
}

/** whether `x` looks like a file made by exportData */
export const isDataFile = (x: unknown): x is DataFile => !!x && typeof x === 'object' && (x as DataFile).v === 1 && typeof (x as DataFile).tables === 'object'

/** replaces what this device holds with `data` (see restoreBackup) */
export async function applyData(shared: SyncOptions['shared'], data: DataFile) {
  const now = Date.now()
  syncFlags.applying = true
  try {
    for (const name of TABLE_NAMES) {
      const tbl = table(name) as unknown as { toArray(): Promise<Base[]>; bulkPut(r: Base[]): Promise<unknown> }
      const back = data.tables?.[name] ?? []
      const ids = new Set(back.map((r) => r.id))
      const gone = (await tbl.toArray()).filter((r) => !ids.has(r.id) && !r.deleted).map((r) => ({ ...r, deleted: true, updatedAt: now }))
      await tbl.bulkPut([...back.map((r) => ({ ...r, updatedAt: now })), ...gone])
    }
    for (const s of data.settings ?? []) shared.apply(s.key, s.value, now)
  } finally {
    syncFlags.applying = false
  }
}

/** pictures of deleted works, or replaced by another cover, are removed from Drive and from this device so the data does not keep growing */
async function cleanImages(o: SyncOptions, remote: Map<string, dv.RemoteImage>) {
  try {
    const used = await referencedImages()
    for (const id of unusedImages(remote, used)) await dv.deleteFile(o.token, id)
    await pruneLocalImages()
  } catch {
    /* clean-up is retried at the next sync; it must not fail the sync itself */
  }
}

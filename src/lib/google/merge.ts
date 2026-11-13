import type { Base } from '@/db/types'

export interface MergeResult<T extends Base> {
  /** every row, newest version of each */
  merged: T[]
  /** rows that must be written to this device (new from the sheet, or newer there) */
  toLocal: T[]
  /** the sheet is missing rows or holds older versions: it has to be rewritten */
  sheetStale: boolean
}

/**
 * Last-write-wins per row. A deleted row is just a row with `deleted` set, so deletions travel like edits.
 * On a tie this device's copy stays.
 */
export function mergeRows<T extends Base>(local: T[], remote: T[]): MergeResult<T> {
  const l = new Map(local.map((r) => [r.id, r]))
  const r = new Map(remote.map((x) => [x.id, x]))
  const merged: T[] = []
  const toLocal: T[] = []
  let sheetStale = false
  for (const [id, mine] of l) {
    const theirs = r.get(id)
    if (!theirs) {
      merged.push(mine)
      sheetStale = true
    } else if (theirs.updatedAt > mine.updatedAt) {
      merged.push(theirs)
      toLocal.push(theirs)
    } else {
      merged.push(mine)
      if (theirs.updatedAt < mine.updatedAt) sheetStale = true
    }
  }
  for (const [id, theirs] of r) {
    if (!l.has(id)) {
      merged.push(theirs)
      toLocal.push(theirs)
    }
  }
  return { merged, toLocal, sheetStale }
}

/** a deleted row older than this is dropped for good during a sync */
export const TOMBSTONE_DAYS = 90
export const purgeOld = <T extends Base>(rows: T[], now = Date.now()): T[] =>
  rows.filter((x) => !(x.deleted && now - x.updatedAt > TOMBSTONE_DAYS * 86400000))

import { db } from '@/db'

/** pictures this much younger than now are left alone: another device may have uploaded one whose work has not synced yet */
export const IMAGE_GRACE_MS = 24 * 3600 * 1000

/** the Drive file ids that live works still point at */
export async function referencedImages(): Promise<Set<string>> {
  const works = await db.works.filter((w) => !w.deleted && !!w.cover?.startsWith('drive:')).toArray()
  return new Set(works.map((w) => w.cover!.slice('drive:'.length)))
}

/** the files nothing points at any more (and that are old enough to be sure of it) */
export function unusedImages<T extends { createdAt: number }>(files: Map<string, T>, referenced: Set<string>, now = Date.now()): string[] {
  return [...files].filter(([id, f]) => !referenced.has(id) && now - f.createdAt > IMAGE_GRACE_MS).map(([id]) => id)
}

/** drops the copies kept on this device for covers that no work uses any more */
export async function pruneLocalImages(): Promise<void> {
  const used = await referencedImages()
  const gone = (await db.images.toCollection().primaryKeys()).filter((id) => !used.has(id))
  if (gone.length) await db.images.bulkDelete(gone)
}

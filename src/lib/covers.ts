import { ref, watch, type Ref } from 'vue'
import { db } from '@/db'
import { aiToken } from '@/lib/google/gis'
import { downloadFile } from '@/lib/google/drive'

const urls = new Map<string, string>()
const inflight = new Map<string, Promise<string | undefined>>()

/**
 * Where to load a cover from. Web addresses and local pictures are used as they are;
 * `drive:<id>` covers come from the copy kept on this device, or are downloaded once from Google Drive.
 */
export async function resolveCover(src: string | undefined): Promise<string | undefined> {
  if (!src || !src.startsWith('drive:')) return src
  const id = src.slice('drive:'.length)
  const known = urls.get(id)
  if (known) return known
  let p = inflight.get(id)
  if (!p) {
    p = (async () => {
      try {
        let row = await db.images.get(id)
        if (!row) {
          const token = await aiToken()
          if (!token) return undefined
          const blob = await downloadFile(token, id)
          row = { id, blob }
          await db.images.put(row)
        }
        const url = URL.createObjectURL(row.blob)
        urls.set(id, url)
        return url
      } catch {
        return undefined
      } finally {
        inflight.delete(id)
      }
    })()
    inflight.set(id, p)
  }
  return p
}

/** a reactive src for <img>: updates when the cover is a Drive file that finishes loading */
export function useCover(src: () => string | undefined): Ref<string | undefined> {
  const out = ref<string | undefined>()
  watch(
    src,
    (s) => {
      if (!s?.startsWith('drive:')) out.value = s
      else {
        out.value = undefined
        void resolveCover(s).then((u) => {
          if (src() === s) out.value = u
        })
      }
    },
    { immediate: true },
  )
  return out
}

/* Minimal Google Drive v3 REST client. Everything lives in the app's hidden data folder (drive.appdata scope). */

const DRIVE = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
const SPACE = 'appDataFolder'

export class DriveAuthError extends Error {}
export class DriveNotFoundError extends Error {}

async function call(token: string, url: string, init: RequestInit = {}) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body && !(init.headers as Record<string, string> | undefined)?.['Content-Type'] ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers as Record<string, string> | undefined),
    },
  })
  if (res.status === 401) throw new DriveAuthError('Google 授權已失效，請重新登入')
  if (res.status === 404) throw new DriveNotFoundError('找不到檔案')
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    if (res.status === 403 && /insufficient|scope|permission/i.test(text) && !/rate|quota/i.test(text)) {
      throw new DriveAuthError('Google 沒有給這個 App 資料夾的權限，請重新連線並勾選權限')
    }
    throw new Error(`Google 錯誤 ${res.status}: ${text.slice(0, 300)}`)
  }
  return res
}

const enc = encodeURIComponent

const DATA_NAME = 'media-log.json'

/** The data file this app made earlier (found again on another device or after the browser data was cleared). */
export async function findDataFile(token: string): Promise<string | null> {
  const q = `name='${DATA_NAME}' and trashed=false`
  const res = await call(token, `${DRIVE}/files?spaces=${SPACE}&q=${enc(q)}&fields=files(id)&orderBy=modifiedTime desc&pageSize=5`)
  return ((await res.json()) as { files?: { id: string }[] }).files?.[0]?.id ?? null
}

export async function readData<T>(token: string, id: string): Promise<T> {
  const res = await call(token, `${DRIVE}/files/${id}?alt=media`)
  return (await res.json()) as T
}

/** Writes the data file; makes it first when there is no id yet. Returns the file id. */
export async function writeData(token: string, id: string, data: unknown): Promise<string> {
  const body = JSON.stringify(data)
  if (id) {
    await call(token, `${UPLOAD}/files/${id}?uploadType=media&fields=id`, { method: 'PATCH', body, headers: { 'Content-Type': 'application/json' } })
    return id
  }
  const boundary = `ab${Math.random().toString(36).slice(2)}`
  const meta = { name: DATA_NAME, mimeType: 'application/json', parents: [SPACE] }
  const res = await call(token, `${UPLOAD}/files?uploadType=multipart&fields=id`, {
    method: 'POST',
    body: `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`,
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
  })
  return ((await res.json()) as { id: string }).id
}

// ---- backups ----------------------------------------------------------------

export const AUTO_PREFIX = 'media-log-backup-'
export const MANUAL_PREFIX = 'media-log-manual-'

/** every backup file, newest first (the date is in the name) */
export async function listBackups(token: string): Promise<{ id: string; name: string }[]> {
  const q = `name contains 'media-log-' and trashed=false`
  const res = await call(token, `${DRIVE}/files?spaces=${SPACE}&q=${enc(q)}&fields=files(id,name)&pageSize=200`)
  const files = ((await res.json()) as { files?: { id: string; name: string }[] }).files ?? []
  return files.filter((f) => f.name.startsWith(AUTO_PREFIX) || f.name.startsWith(MANUAL_PREFIX)).sort((a, b) => b.name.localeCompare(a.name))
}

/** saves `data` as a backup file called `name` */
export async function writeBackup(token: string, name: string, data: unknown) {
  const boundary = `ab${Math.random().toString(36).slice(2)}`
  const meta = { name, mimeType: 'application/json', parents: [SPACE] }
  await call(token, `${UPLOAD}/files?uploadType=multipart&fields=id`, {
    method: 'POST',
    body: `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(data)}\r\n--${boundary}--`,
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
  })
}

// ---- cover pictures ---------------------------------------------------------

export interface RemoteImage {
  fileId: string
  createdAt: number
}

/** Every picture this app keeps in Drive, by Drive file id. Throws when the list cannot be read completely. */
export async function listImages(token: string): Promise<Map<string, RemoteImage>> {
  const q = `appProperties has { key='mediaLogImage' and value='1' } and trashed=false`
  const out = new Map<string, RemoteImage>()
  let page = ''
  do {
    const res = await call(
      token,
      `${DRIVE}/files?spaces=${SPACE}&q=${enc(q)}&fields=nextPageToken,files(id,createdTime,appProperties)&pageSize=1000${page ? `&pageToken=${enc(page)}` : ''}`,
    )
    const data = (await res.json()) as {
      nextPageToken?: string
      files?: { id: string; createdTime?: string; appProperties?: Record<string, string> }[]
    }
    for (const f of data.files ?? []) {
      const made = Number(f.appProperties?.createdAt) || Date.parse(f.createdTime ?? '') || Date.now()
      out.set(f.id, { fileId: f.id, createdAt: made })
    }
    page = data.nextPageToken ?? ''
  } while (page)
  return out
}

export async function uploadImage(token: string, img: { id: string; blob: Blob }): Promise<string> {
  const boundary = `ab${Math.random().toString(36).slice(2)}`
  const meta = {
    name: `${img.id}.jpg`,
    mimeType: 'image/jpeg',
    parents: [SPACE],
    appProperties: { mediaLogImage: '1', createdAt: String(Date.now()) },
  }
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
    `--${boundary}\r\nContent-Type: image/jpeg\r\n\r\n`,
    img.blob,
    `\r\n--${boundary}--`,
  ])
  const res = await call(token, `${UPLOAD}/files?uploadType=multipart&fields=id`, {
    method: 'POST',
    body,
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
  })
  return ((await res.json()) as { id: string }).id
}

export async function downloadFile(token: string, fileId: string): Promise<Blob> {
  const res = await call(token, `${DRIVE}/files/${fileId}?alt=media`)
  return await res.blob()
}

/** A file that is already gone counts as deleted. */
export async function deleteFile(token: string, fileId: string) {
  try {
    await call(token, `${DRIVE}/files/${fileId}`, { method: 'DELETE' })
  } catch (e) {
    if (!(e instanceof DriveNotFoundError)) throw e
  }
}

import type { ExternalIds, Work, WorkType } from '@/db/types'

export type SourceId = 'bangumi' | 'gamer' | 'douban' | 'books' | 'bookwalker' | 'goodreads' | 'openlibrary'

export const SOURCE_LIST: { id: SourceId; label: string; hint: string }[] = [
  { id: 'bangumi', label: 'Bangumi', hint: '動畫、漫畫、小說' },
  { id: 'gamer', label: '動畫瘋', hint: '繁體中文動畫' },
  { id: 'douban', label: '豆瓣', hint: '電影、書籍、劇集' },
  { id: 'books', label: '博客來', hint: '中文書籍（可能被擋）' },
  { id: 'bookwalker', label: 'BOOK☆WALKER', hint: '繁體中文電子書，輕小說、漫畫' },
  { id: 'goodreads', label: 'Goodreads', hint: '國外書籍' },
  { id: 'openlibrary', label: 'Open Library', hint: '國外書籍備援' },
]
export const DEFAULT_SOURCES: SourceId[] = ['gamer', 'books', 'bookwalker', 'bangumi', 'douban', 'goodreads']

/** what a name in "作者／製作" can be: the original author, the director, the animation studio, the publisher */
export type CreatorRole = 'author' | 'director' | 'studio' | 'publisher'
export const CREATOR_ROLES: { id: CreatorRole; label: string }[] = [
  { id: 'author', label: '原作' },
  { id: 'director', label: '導演' },
  { id: 'studio', label: '製作' },
  { id: 'publisher', label: '出版' },
]
export type CreatorRoles = Partial<Record<CreatorRole, string>>

/** the roles of a result; a source that only gives one text has it taken as the director for films and shows, the author otherwise */
export function rolesOf(r: { creators?: string; roles?: CreatorRoles; type?: string }): CreatorRoles {
  if (r.roles && Object.keys(r.roles).length) return r.roles
  if (!r.creators) return {}
  return { [r.type === 'movie' || r.type === 'series' ? 'director' : 'author']: r.creators }
}
/** the roles switched on at first: the author (the director for films), else the first one there is; the rest start off */
export function defaultRoles(roles: CreatorRoles, type?: string): CreatorRole[] {
  const order: CreatorRole[] = type === 'movie' ? ['director', 'author', 'studio', 'publisher'] : ['author', 'director', 'studio', 'publisher']
  const first = order.find((k) => roles[k])
  return first ? [first] : []
}
/** the names of the switched-on roles as one text, each name once */
export function joinRoles(roles: CreatorRoles, on: CreatorRole[]): string {
  const names = CREATOR_ROLES.filter((k) => on.includes(k.id)).flatMap((k) => (roles[k.id] ?? '').split('、'))
  return [...new Set(names.map((n) => n.trim()).filter(Boolean))].join('、')
}

export interface SearchResult {
  source: SourceId
  id: string
  title: string
  cover?: string
  creators?: string
  /** every role the site names, when it says (Bangumi, 動畫瘋's detail page) */
  roles?: CreatorRoles
  /** the year it came out, when the site says */
  year?: string
  type?: WorkType
  /** how many episodes the site says it has */
  eps?: number
  url?: string
}

export interface SearchResponse {
  results: SearchResult[]
  /** sources that could not be reached, with the reason */
  errors: Record<string, string>
}

export const WORKER_URL: string = (import.meta.env.VITE_WORKER_URL as string | undefined) ?? ''

const base = (workerUrl: string) => workerUrl.replace(/\/+$/, '')

export async function searchWorks(workerUrl: string, q: string, type: WorkType | '', sources: SourceId[], signal?: AbortSignal): Promise<SearchResponse> {
  const params = new URLSearchParams({ q, sources: sources.join(',') })
  if (type) params.set('type', type)
  const res = await fetch(`${base(workerUrl)}/search?${params}`, { signal })
  if (!res.ok) throw new Error(`搜尋服務錯誤 ${res.status}`)
  return res.json()
}

/** the author / cover that the search list did not include */
export async function fetchDetail(workerUrl: string, r: SearchResult): Promise<Partial<SearchResult>> {
  const params = new URLSearchParams({ source: r.source, id: r.id, url: r.url ?? '' })
  const res = await fetch(`${base(workerUrl)}/detail?${params}`)
  if (!res.ok) return {}
  return res.json()
}

const EXT_KEY: Record<SourceId, keyof ExternalIds | undefined> = { bangumi: 'bangumi', gamer: 'gamer', bookwalker: 'bookwalker', douban: 'douban', books: 'books', goodreads: 'goodreads', openlibrary: undefined }

export function toWorkDraft(r: SearchResult, fallbackType: WorkType): Partial<Work> {
  const key = EXT_KEY[r.source]
  return {
    title: r.title,
    type: r.type ?? fallbackType,
    cover: r.cover,
    creators: r.creators,
    ext: key ? { [key]: r.id } : {},
  }
}

/** an already saved work that came from the same source id */
export function findExisting(works: Work[], r: SearchResult): Work | undefined {
  const key = EXT_KEY[r.source]
  return works.find((w) => key && w.ext?.[key] === r.id)
}

/** the sources that make sense for each kind of work (the rest are not listed in settings) */
const SUITABLE_BY_TYPE: Partial<Record<string, SourceId[]>> = {
  anime: ['gamer', 'bangumi', 'douban'],
  series: ['douban', 'bangumi'],
  movie: ['douban', 'bangumi'],
  manga: ['bangumi', 'books', 'bookwalker', 'douban'],
  novel: ['books', 'bookwalker', 'bangumi', 'goodreads', 'douban'],
  book: ['books', 'bookwalker', 'goodreads', 'douban', 'openlibrary'],
}
/** the ones asked by default, in order (Douban only where nothing else covers the kind) */
const DEFAULTS_BY_TYPE: Partial<Record<string, SourceId[]>> = {
  anime: ['gamer', 'bangumi'],
  series: ['douban', 'bangumi'],
  movie: ['douban', 'bangumi'],
  manga: ['bangumi', 'books', 'bookwalker'],
  novel: ['books', 'bookwalker', 'bangumi'],
  book: ['books', 'bookwalker'],
}
export const suitableSourcesFor = (type: string): SourceId[] => [...(SUITABLE_BY_TYPE[type] ?? SOURCE_LIST.map((s) => s.id))]
export const defaultSourcesFor = (type: string): SourceId[] => [...(DEFAULTS_BY_TYPE[type] ?? ['gamer', 'books', 'bookwalker', 'bangumi'])]
/** the sources to ask for this kind of work, in order: the user's own list for the type, else the default one */
export const sourcesFor = (type: string, mine: Record<string, SourceId[]> = {}): SourceId[] => {
  const ok = suitableSourcesFor(type)
  return (mine[type] ?? defaultSourcesFor(type)).filter((s) => ok.includes(s))
}

/** Douban pictures refuse to load on other sites: they go through the Worker, which fetches them with Douban's own Referer */
const BLOCKED_IMAGE = /^https:\/\/[^/]*\.doubanio\.com\//
export const needsProxy = (url?: string) => !!url && BLOCKED_IMAGE.test(url)
export const proxiedImage = (workerUrl: string, url: string) => `${base(workerUrl)}/img?u=${encodeURIComponent(url)}`
/** the address to show a search result's picture from */
export const shownImage = (workerUrl: string, url?: string) => (url && needsProxy(url) ? proxiedImage(workerUrl, url) : url)

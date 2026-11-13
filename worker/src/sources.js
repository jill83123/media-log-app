/**
 * Search sources. What reaches the app is kept small, only what the log needs:
 *   { source, id, title, cover?, creators?, type?, url }
 * Parsers are pure functions (exported) so they can be tested without network access.
 */

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
const BGM_UA = 'media-log/0.1 (personal media tracker)'

export const SOURCES = ['bangumi', 'gamer', 'douban', 'books', 'bookwalker', 'goodreads', 'openlibrary']

const BOOKISH = ['manga', 'lightnovel', 'novel', 'book']
const VIDEO = ['anime', 'movie', 'series']
const isBookish = (t) => BOOKISH.includes(t)
const isVideo = (t) => VIDEO.includes(t)

export const decodeEntities = (s = '') =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
const stripTags = (s = '') => decodeEntities(s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).trim()
const https = (u) => (u ? u.replace(/^http:/, 'https:').replace(/^\/\//, 'https://') : undefined)
const year = (s) => (s ?? '').match(/(\d{4})/)?.[1]

async function get(url, headers = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': BROWSER_UA, 'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.7', ...headers } })
  if (!res.ok) throw new Error(`upstream ${res.status}`)
  return res
}

// ---------- Bangumi ----------
export function bgmType(platform = '', fallback) {
  if (/漫画/.test(platform)) return 'manga'
  if (/小说/.test(platform)) return 'lightnovel'
  if (/画集|其他/.test(platform)) return 'book'
  if (/剧场版|电影/.test(platform)) return 'movie'
  if (/剧|欧美|日剧|华语/.test(platform)) return 'series'
  if (/TV|WEB|OVA|OAD|动画/i.test(platform)) return 'anime'
  return fallback
}
export function parseBangumi(json, fallbackType) {
  return (json?.data ?? []).map((s) => {
    const info = Array.isArray(s.infobox) ? s.infobox : []
    const pick = (...keys) => {
      for (const k of keys) {
        const v = info.find((i) => i.key === k)?.value
        if (typeof v === 'string') return v
        if (Array.isArray(v)) return v.map((x) => x.v).join('、')
      }
    }
    return {
      source: 'bangumi',
      id: String(s.id),
      title: s.name_cn || s.name,
      originalTitle: s.name_cn ? s.name : undefined,
      cover: https(s.images?.common ?? s.images?.large),
      creators: pick('作者', '原作', '导演', '制作'),
      year: year(s.date),
      summary: s.summary || undefined,
      type: bgmType(s.platform, fallbackType),
      isbn: pick('ISBN'),
      eps: s.eps || s.total_episodes || undefined,
      url: `https://bgm.tv/subject/${s.id}`,
    }
  })
}
async function bangumi(q, type) {
  const filterType = isBookish(type) ? [1] : type === 'anime' ? [2] : type === 'movie' || type === 'series' ? [2, 6] : [1, 2, 6]
  const res = await fetch('https://api.bgm.tv/v0/search/subjects?limit=15', {
    method: 'POST',
    headers: { 'User-Agent': BGM_UA, 'Content-Type': 'application/json' },
    body: JSON.stringify({ keyword: q, filter: { type: filterType } }),
  })
  if (!res.ok) throw new Error(`upstream ${res.status}`)
  return parseBangumi(await res.json(), type)
}

// ---------- 巴哈姆特動畫瘋 (Traditional Chinese titles; the list also says how many episodes) ----------
export function parseGamer(html) {
  const out = []
  // the page's second list ("wish list") has no sn= links, so only the search results match
  for (const block of html.split("<a href='animeRef.php?sn=").slice(1)) {
    const id = block.match(/^(\d+)/)?.[1]
    const title = decodeEntities(block.match(/<p class='theme-name'>([^<]*)<\/p>/)?.[1] ?? '').trim()
    if (!id || !title) continue
    const cover = block.match(/data-src='([^']+)'/)?.[1]
    const eps = Number(block.match(/共\s*(\d+)\s*集/)?.[1]) || undefined
    out.push({ source: 'gamer', id, title, cover: https(cover), type: 'anime', eps, year: year(block.match(/年份：([^<]*)</)?.[1]) })
  }
  return out.slice(0, 15)
}
async function gamer(q) {
  const res = await get(`https://ani.gamer.com.tw/search.php?keyword=${encodeURIComponent(q)}`)
  return parseGamer(await res.text())
}

// ---------- Douban ----------
export function parseDoubanSuggest(list, fallbackType) {
  return (Array.isArray(list) ? list : [])
    .filter((x) => x.id)
    .map((x) => ({
      source: 'douban',
      id: String(x.id),
      title: x.title,
      originalTitle: x.sub_title || undefined,
      cover: https(x.img?.replace('s_ratio_poster', 'm_ratio_poster')),
      year: x.year || undefined,
      type: x.episode ? 'series' : fallbackType === 'anime' ? 'anime' : 'movie',
      url: `https://movie.douban.com/subject/${x.id}/`,
    }))
}
export function parseDoubanBooks(html, fallbackType) {
  const line = html.split('\n').find((l) => l.includes('window.__DATA__ = '))
  if (!line) return []
  let data
  try {
    data = JSON.parse(line.slice(line.indexOf('{')).replace(/;\s*$/, ''))
  } catch {
    return []
  }
  return (data.items ?? [])
    .filter((x) => x.tpl_name === 'search_subject')
    .map((x) => {
      const parts = String(x.abstract ?? '').split(' / ')
      return {
        source: 'douban',
        id: String(x.id),
        title: x.title,
        cover: https(x.cover_url?.replace('/m/public/', '/l/public/')),
        creators: parts[0] || undefined,
        year: year(parts.find((p) => /^\d{4}([-/]\d{1,2})?$/.test(p.trim()))),
        type: isBookish(fallbackType) ? fallbackType : 'book',
        url: x.url,
      }
    })
}
async function douban(q, type) {
  const jobs = []
  if (!type || isBookish(type) || type === 'other')
    jobs.push(
      get(`https://search.douban.com/book/subject_search?search_text=${encodeURIComponent(q)}&cat=1001`)
        .then((r) => r.text())
        .then((h) => parseDoubanBooks(h, type)),
    )
  if (!type || isVideo(type) || type === 'other')
    jobs.push(
      get(`https://movie.douban.com/j/subject_suggest?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((j) => parseDoubanSuggest(j, type)),
    )
  const settled = await Promise.allSettled(jobs)
  const ok = settled.filter((s) => s.status === 'fulfilled').flatMap((s) => s.value)
  if (!ok.length && settled.every((s) => s.status === 'rejected')) throw settled[0].reason
  return ok
}

// ---------- 博客來 ----------
export function parseBooks(html) {
  const out = []
  const blocks = html.split('<div class="table-td" id="prod-itemlist-').slice(1)
  for (const b of blocks) {
    const id = b.match(/^(\w+)"/)?.[1]
    const title = decodeEntities(b.match(/<h4><a[^>]*title="([^"]*)"/)?.[1] ?? '')
    if (!id || !title) continue
    const imgSrc = decodeEntities(b.match(/data-src="([^"]+)"/)?.[1] ?? '')
    const raw = imgSrc.match(/[?&]i=([^&]+)/)?.[1]
    const authors = [...b.matchAll(/rel='go_author'[^>]*title='([^']*)'/g)].map((m) => decodeEntities(m[1]))
    out.push({
      source: 'books',
      id,
      title,
      cover: https(raw ? decodeURIComponent(raw) : imgSrc),
      creators: [...new Set(authors)].join('、') || undefined,
      type: 'book',
      url: `https://www.books.com.tw/products/${id}`,
    })
  }
  return out.slice(0, 15)
}
async function books(q) {
  // NB: a /cat/BKA segment makes博客來 answer 403, so the plain key URL is used
  const res = await get(`https://search.books.com.tw/search/query/key/${encodeURIComponent(q)}`)
  return parseBooks(await res.text())
}

// ---------- BOOK☆WALKER 台灣 (Traditional Chinese e-books, one entry per volume) ----------
export function parseBookWalker(html) {
  const out = []
  for (const b of html.split('<div class="bookitem">').slice(1)) {
    const id = b.match(/bookwalker\.com\.tw\/product\/(\d+)/)?.[1]
    const title = decodeEntities(b.match(/<h4 class="bookname"[^>]*>([^<]*)<\/h4>/)?.[1] ?? '').trim()
    if (!id || !title) continue
    const creators = decodeEntities(b.match(/<h5 class="booknamesub"[^>]*>\s*([^<]*?)\s*<\/h5>/)?.[1] ?? '').replace(/\s*\/\s*/g, '、').trim()
    out.push({ source: 'bookwalker', id, title, cover: https(b.match(/data-src="([^"]+)"/)?.[1]), creators: creators || undefined, type: 'book', url: `https://www.bookwalker.com.tw/product/${id}` })
  }
  return out.slice(0, 15)
}
async function bookwalker(q) {
  const res = await get(`https://www.bookwalker.com.tw/search?w=${encodeURIComponent(q)}&mid=0`)
  return parseBookWalker(await res.text())
}

// ---------- Goodreads ----------
export function parseGoodreads(list) {
  return (Array.isArray(list) ? list : [])
    .filter((x) => x.bookId)
    .map((x) => ({
      source: 'goodreads',
      id: String(x.bookId),
      title: x.bookTitleBare || x.title,
      cover: https(x.imageUrl?.replace(/\._S[XY]\d+_/, '')),
      creators: x.author?.name,
      summary: x.description?.html ? stripTags(x.description.html) : undefined,
      type: 'book',
      url: `https://www.goodreads.com${x.bookUrl}`,
    }))
}
async function goodreads(q) {
  const res = await get(`https://www.goodreads.com/book/auto_complete?format=json&q=${encodeURIComponent(q)}`)
  return parseGoodreads(await res.json())
}

// ---------- Open Library (CORS-free fallback for foreign books) ----------
export function parseOpenLibrary(json) {
  return (json?.docs ?? []).map((d) => ({
    source: 'openlibrary',
    id: d.key,
    title: d.title,
    cover: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : undefined,
    creators: (d.author_name ?? []).slice(0, 3).join('、') || undefined,
    year: d.first_publish_year ? String(d.first_publish_year) : undefined,
    isbn: d.isbn?.[0],
    type: 'book',
    url: `https://openlibrary.org${d.key}`,
  }))
}
async function openlibrary(q) {
  const res = await get(
    `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=15&fields=key,title,author_name,first_publish_year,cover_i,isbn`,
  )
  return parseOpenLibrary(await res.json())
}

const IMPL = { bangumi, gamer, douban, books, bookwalker, goodreads, openlibrary }

/** the parsers read more than the app wants (summary, year, ISBN…); only these fields are sent on */
export const slim = (r) => ({ source: r.source, id: r.id, title: r.title, cover: r.cover, creators: r.creators, type: r.type, eps: r.eps, url: r.url })

/** Runs the chosen sources at once; a source that fails is reported but does not stop the others. */
export async function search(q, type, sources) {
  const list = sources.filter((s) => IMPL[s])
  const settled = await Promise.allSettled(list.map((s) => IMPL[s](q, type)))
  return {
    results: settled.flatMap((r) => (r.status === 'fulfilled' ? r.value.map(slim) : [])),
    errors: Object.fromEntries(list.flatMap((s, i) => (settled[i].status === 'rejected' ? [[s, String(settled[i].reason?.message ?? 'failed')]] : []))),
  }
}

// ---------- detail pages ----------
const DETAIL_HOSTS = ['book.douban.com', 'movie.douban.com', 'www.books.com.tw', 'www.goodreads.com', 'openlibrary.org']

/** author and cover from a page's JSON-LD, falling back to og: meta tags (summary, year and ISBN are read too, but not sent on) */
export function parseDetail(html) {
  const out = {}
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const j = JSON.parse(m[1].replace(/[\r\n\t]+/g, ' '))
      const o = Array.isArray(j) ? j[0] : j
      if (!o || typeof o !== 'object') continue
      out.summary ??= o.description ? stripTags(String(o.description)) : undefined
      const a = o.author ?? o.director
      out.creators ??= Array.isArray(a) ? a.map((x) => x.name).join('、') : a?.name
      out.isbn ??= o.isbn
      out.year ??= year(o.datePublished)
    } catch {
      /* not JSON */
    }
  }
  const og = (p) => decodeEntities(html.match(new RegExp(`<meta[^>]+property="og:${p}"[^>]+content="([^"]*)"`, 'i'))?.[1] ?? '')
  out.summary ??= og('description') || undefined
  out.cover = https(og('image')) || undefined
  out.isbn ??= html.match(/ISBN(?:13)?[：:\s]*(97[89]\d{10})/)?.[1]
  return out
}

export async function detail(source, id, url) {
  if (source === 'bangumi') {
    const res = await fetch(`https://api.bgm.tv/v0/subjects/${encodeURIComponent(id)}`, { headers: { 'User-Agent': BGM_UA } })
    if (!res.ok) throw new Error(`upstream ${res.status}`)
    const s = await res.json()
    const [r] = parseBangumi({ data: [s] })
    return { creators: r.creators, cover: r.cover }
  }
  const u = new URL(url)
  if (!DETAIL_HOSTS.includes(u.hostname)) throw new Error('host not allowed')
  const { creators, cover } = parseDetail(await (await get(u.href)).text())
  return { creators, cover }
}

/**
 * Picture proxy for hosts that refuse to show their images on other sites (hot-link protection).
 * Only the hosts listed here are fetched, so this cannot be used as an open proxy.
 */

/** host suffix -> the Referer that host expects */
const HOSTS = [{ suffix: '.doubanio.com', referer: 'https://www.douban.com/' }]
const MAX_BYTES = 3 * 1024 * 1024
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

/** the Referer for an allowed image address, or '' when the address is not allowed */
export function refererFor(raw) {
  let u
  try {
    u = new URL(raw)
  } catch {
    return ''
  }
  if (u.protocol !== 'https:') return ''
  return HOSTS.find((h) => u.hostname.endsWith(h.suffix))?.referer ?? ''
}

export async function fetchImage(raw, cors, ctx) {
  const referer = refererFor(raw)
  if (!referer) return new Response('host not allowed', { status: 400, headers: cors })
  const cache = globalThis.caches?.default
  const key = new Request(`https://img.cache/${encodeURIComponent(raw)}`)
  const hit = cache && (await cache.match(key))
  const out = hit ?? (await upstream(raw, referer))
  if (!hit && out.ok && cache) ctx?.waitUntil?.(cache.put(key, out.clone()))
  const res = new Response(out.body, out)
  for (const [k, v] of Object.entries(cors)) res.headers.set(k, v)
  return res
}

async function upstream(raw, referer) {
  const r = await fetch(raw, { headers: { Referer: referer, 'User-Agent': BROWSER_UA, Accept: 'image/*' } })
  const type = r.headers.get('Content-Type') ?? ''
  if (!r.ok || !type.startsWith('image/')) return new Response('upstream failed', { status: 502 })
  const buf = await r.arrayBuffer()
  if (buf.byteLength > MAX_BYTES) return new Response('too large', { status: 502 })
  return new Response(buf, { headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=604800' } })
}

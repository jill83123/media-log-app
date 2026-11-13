/**
 * Server side of the media log, three jobs:
 *
 *   GET  /search?q=&type=&sources=bangumi,douban,books,goodreads,openlibrary
 *                                      -> { results: [...], errors: { source: reason } }
 *   GET  /detail?source=&id=&url=      -> { creators?, cover? }   (fills in what the search list left out)
 *   GET  /img?u=<image url>            -> the picture, fetched with the site's own Referer (hot-link protected hosts only)
 *   GET  /config                      -> { clientId }
 *   POST /token    { code }            -> { access_token, expires_in, refresh_token, scope }   (Google sign-in, keeps the client secret)
 *   POST /refresh  { refresh_token }   -> { access_token, expires_in, scope }
 *   POST /revoke   { token }           -> {}
 *   /push/*                            -> reminders, see push.js
 *
 * Search results are cached for an hour so repeated searches do not hammer the sites.
 */

import { handlePush } from './push.js'
import { detail, search, SOURCES } from './sources.js'
import { fetchImage } from './img.js'

// Durable Object class must be exported from the entry file
export { PushGroup } from './push.js'

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
const CACHE_SECONDS = 3600

function json(body, status, cors, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra, ...cors },
  })
}

async function exchange(env, params) {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      ...params,
    }),
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}

/** run `make` once per URL and reuse the answer for an hour */
async function cached(request, ctx, make) {
  const cache = globalThis.caches?.default
  const key = new Request(new URL(request.url).toString(), { method: 'GET' })
  const hit = cache && (await cache.match(key))
  if (hit) return hit.json()
  const value = await make()
  if (cache && value && !Object.keys(value.errors ?? {}).length) {
    const res = new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${CACHE_SECONDS}` } })
    ctx?.waitUntil?.(cache.put(key, res))
  }
  return value
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') ?? ''
    const allowed = (env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const cors = allowed.includes(origin)
      ? {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
          Vary: 'Origin',
        }
      : null

    // a plain <img> sends no Origin header, so pictures are served to it too; the host list in img.js is what limits the proxy
    if (request.method === 'GET' && new URL(request.url).pathname === '/img' && (!origin || cors)) {
      return fetchImage(new URL(request.url).searchParams.get('u') ?? '', cors ?? {}, ctx)
    }
    if (!cors) return json({ error: 'forbidden_origin' }, 403, {})
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    const url = new URL(request.url)
    const path = url.pathname

    if (request.method === 'GET' && path === '/search') {
      const q = (url.searchParams.get('q') ?? '').trim().slice(0, 100)
      if (!q) return json({ results: [], errors: {} }, 200, cors)
      const type = url.searchParams.get('type') || undefined
      const sources = (url.searchParams.get('sources') ?? SOURCES.join(',')).split(',').filter((s) => SOURCES.includes(s))
      try {
        return json(await cached(request, ctx, () => search(q, type, sources)), 200, cors)
      } catch (e) {
        return json({ error: 'search_failed', message: String(e?.message ?? e) }, 502, cors)
      }
    }

    if (request.method === 'GET' && path === '/detail') {
      const source = url.searchParams.get('source') ?? ''
      try {
        const out = await cached(request, ctx, () => detail(source, url.searchParams.get('id') ?? '', url.searchParams.get('url') ?? ''))
        return json(out, 200, cors)
      } catch (e) {
        return json({ error: 'detail_failed', message: String(e?.message ?? e) }, 502, cors)
      }
    }

    if (path.startsWith('/push/')) {
      const pushBody = request.method === 'POST' ? await request.json().catch(() => null) : {}
      if (!pushBody || typeof pushBody !== 'object') return json({ error: 'bad_request' }, 400, cors)
      return handlePush(request, env, path, pushBody, (b, status) => json(b, status, cors))
    }

    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return json({ error: 'worker_not_configured' }, 500, cors)
    if (request.method === 'GET' && path === '/config') return json({ clientId: env.GOOGLE_CLIENT_ID }, 200, cors)
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors)

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') return json({ error: 'bad_request' }, 400, cors)

    if (path === '/token' || path === '/refresh') {
      const isCode = path === '/token'
      const value = isCode ? body.code : body.refresh_token
      if (typeof value !== 'string' || !value) return json({ error: 'bad_request' }, 400, cors)
      const r = await exchange(
        env,
        isCode
          ? { grant_type: 'authorization_code', code: value, redirect_uri: 'postmessage' }
          : { grant_type: 'refresh_token', refresh_token: value },
      )
      if (!r.ok) {
        return json(
          { error: r.data.error ?? 'google_error', error_description: r.data.error_description },
          r.status === 400 || r.status === 401 ? r.status : 502,
          cors,
        )
      }
      const { access_token, expires_in, refresh_token, scope } = r.data
      return json({ access_token, expires_in, refresh_token, scope }, 200, cors)
    }

    if (path === '/revoke') {
      if (typeof body.token !== 'string' || !body.token) return json({ error: 'bad_request' }, 400, cors)
      await fetch(GOOGLE_REVOKE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: body.token }),
      })
      return json({}, 200, cors)
    }

    return json({ error: 'not_found' }, 404, cors)
  },
}

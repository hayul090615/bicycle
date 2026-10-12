import { randomUUID } from 'node:crypto'

const VISITOR_COOKIE = 'ttareungi_visitor_id_v1'
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function siteVisit(request, response) {
  response.setHeader('Cache-Control', 'no-store')
  const cookie = String(request.headers.cookie ?? '').split(';').map(value => value.trim())
    .find(value => value.startsWith(`${VISITOR_COOKIE}=`))?.slice(VISITOR_COOKIE.length + 1)
  const visitorId = cookie && uuidPattern.test(cookie) ? cookie : randomUUID()
  if (visitorId !== cookie) {
    const secure = process.env.VERCEL || request.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''
    response.setHeader('Set-Cookie', `${VISITOR_COOKIE}=${visitorId}; Max-Age=31536000; Path=/; HttpOnly; SameSite=Lax${secure}`)
  }
  const databaseUrl = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim()
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!databaseUrl || !serviceKey) return response.status(200).json({ storage: 'browser' })
  try {
    const result = await fetch(`${databaseUrl.replace(/\/$/, '')}/rest/v1/rpc/record_site_visit`, {
      method: 'POST',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_visitor_id: visitorId }),
      signal: AbortSignal.timeout(2000),
    })
    if (!result.ok) throw new Error(`Visit database returned ${result.status}`)
    const previouslyVisited = await result.json()
    if (typeof previouslyVisited !== 'boolean') throw new Error('Invalid visit database response')
    return response.status(200).json({ storage: 'database', previouslyVisited })
  } catch (error) {
    console.error('[site-visit]', error instanceof Error ? error.message : 'Database unavailable')
    return response.status(200).json({ storage: 'browser' })
  }
}

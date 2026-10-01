const SERVICE_URL = 'http://openapi.seoul.go.kr:8088'
const SERVICE_NAME = 'mgisToiletPoi'
let toiletCache = null
let toiletCacheExpiresAt = 0

async function loadToilets(key) {
  if (toiletCache && Date.now() < toiletCacheExpiresAt) return toiletCache
  const pages = await Promise.all(Array.from({ length: 5 }, async (_, index) => {
    const start = index * 1000 + 1
    const end = start + 999
    const response = await fetch(`${SERVICE_URL}/${encodeURIComponent(key)}/json/${SERVICE_NAME}/${start}/${end}/`, { signal: AbortSignal.timeout(8000) })
    if (!response.ok) throw new Error(`Seoul toilet API returned ${response.status}`)
    const payload = await response.json()
    const data = payload?.[SERVICE_NAME]
    if (data?.RESULT?.CODE && data.RESULT.CODE !== 'INFO-000') throw new Error(data.RESULT.MESSAGE || 'Seoul toilet API request failed')
    return data?.row ?? []
  }))
  const rows = pages.flat()
  toiletCache = rows.map(row => ({
    id: `seoul-toilet-${row.OBJECTID}`,
    name: String(row.CONTS_NAME || row.VALUE_09 || '공중화장실').trim(),
    lat: Number(row.COORD_Y),
    lng: Number(row.COORD_X),
    kind: 'toilet',
    distanceMeters: 0,
    address: String(row.ADDR_NEW || row.ADDR_OLD || '').trim(),
    hours: String(row.VALUE_02 || '').replaceAll('|', ' ').trim(),
  })).filter(place => Number.isFinite(place.lat) && Number.isFinite(place.lng))
  toiletCacheExpiresAt = Date.now() + 6 * 60 * 60 * 1000
  return toiletCache
}

export default async function seoulToilets(request, response) {
  if (request.method !== 'GET') return response.status(405).json({ error: 'method_not_allowed' })
  const key = process.env.SEOUL_TOILET_API_KEY
  if (!key) return response.status(503).json({ error: 'toilet_api_not_configured' })
  const bounds = ['west', 'south', 'east', 'north'].map(name => Number(request.query?.[name]))
  if (bounds.some(value => !Number.isFinite(value)) || bounds[0] > bounds[2] || bounds[1] > bounds[3]) {
    return response.status(400).json({ error: 'invalid_bounds' })
  }
  try {
    const [west, south, east, north] = bounds
    const places = await loadToilets(key)
    const filtered = places.filter(place => place.lng >= west && place.lng <= east && place.lat >= south && place.lat <= north).slice(0, 250)
    response.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
    return response.status(200).json({ places: filtered })
  } catch {
    return response.status(502).json({ error: 'toilet_api_unavailable' })
  }
}

const SEOUL_BIKE_API = 'http://openapi.seoul.go.kr:8088'
const MAX_STATIONS = 6000
const CACHE_MS = 60_000
let cached = { rows: [], updatedAt: 0 }

function metersBetween(from, to) {
  const radians = Math.PI / 180
  const latitude = (to.lat - from.lat) * radians
  const longitude = (to.lng - from.lng) * radians
  const arc = Math.sin(latitude / 2) ** 2 + Math.cos(from.lat * radians) * Math.cos(to.lat * radians) * Math.sin(longitude / 2) ** 2
  return 6371000 * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc))
}

async function fetchPage(key, start, end) {
  const url = `${SEOUL_BIKE_API}/${encodeURIComponent(key)}/json/bikeList/${start}/${end}/`
  const response = await fetch(url, { signal: AbortSignal.timeout(9000) })
  if (!response.ok) throw new Error(`Seoul bike API ${response.status}`)
  const data = await response.json()
  if (!data.rentBikeStatus || data.rentBikeStatus.RESULT?.CODE !== 'INFO-000') {
    throw new Error(data.RESULT?.MESSAGE || data.rentBikeStatus?.RESULT?.MESSAGE || 'Seoul bike data unavailable')
  }
  return data.rentBikeStatus
}

async function loadStations(key) {
  if (cached.rows.length && Date.now() - cached.updatedAt < CACHE_MS) return cached
  const first = await fetchPage(key, 1, 1000)
  const total = Math.min(Number(first.list_total_count) || 0, MAX_STATIONS)
  const ranges = []
  for (let start = 1001; start <= total; start += 1000) ranges.push([start, Math.min(total, start + 999)])
  const pages = await Promise.all(ranges.map(([start, end]) => fetchPage(key, start, end)))
  const rows = [first, ...pages].flatMap(page => page.row || [])
    .map(row => {
      const lat = Number(row.stationLatitude)
      const lng = Number(row.stationLongitude)
      const available = Number(row.parkingBikeTotCnt)
      const numberedName = String(row.stationName || '').trim()
      const number = numberedName.match(/^(\d+)\.\s*/)
      return {
        id: number?.[1] || String(row.stationId || ''),
        name: numberedName.replace(/^(\d+)\.\s*/, ''),
        lat, lng,
        available: Number.isFinite(available) ? Math.max(0, available) : null,
      }
    }).filter(row => Number.isFinite(row.lat) && Number.isFinite(row.lng) && row.name)
  cached = { rows, updatedAt: Date.now() }
  return cached
}

export default async function handler(request, response) {
  const origin = request.headers.origin
  const allowedOrigins = new Set([
    'https://seoul-ttareungi-typing.vercel.app',
    'https://hayul090615.github.io',
    'http://localhost:5173',
  ])
  if (origin && allowedOrigins.has(origin)) response.setHeader('Access-Control-Allow-Origin', origin)
  response.setHeader('Vary', 'Origin')
  response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  response.setHeader('Cache-Control', 'public, s-maxage=45, stale-while-revalidate=15')
  if (request.method === 'OPTIONS') return response.status(204).end()
  if (request.method !== 'GET') return response.status(405).json({ error: 'method_not_allowed' })
  const lat = Number(request.query.lat)
  const lng = Number(request.query.lng)
  const radiusMeters = request.query.radius === '500' ? 500 : 5_000
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 37.3 || lat > 37.75 || lng < 126.6 || lng > 127.4) {
    return response.status(400).json({ error: 'location_outside_seoul' })
  }
  const key = process.env.SEOUL_BIKE_API_KEY
  if (!key) return response.status(503).json({ error: 'api_key_not_configured' })
  try {
    const data = await loadStations(key)
    const stations = data.rows.map(station => ({ ...station, distanceMeters: metersBetween({ lat, lng }, station) }))
      .filter(station => station.distanceMeters <= radiusMeters)
      .sort((first, second) => first.distanceMeters - second.distanceMeters)
      .slice(0, radiusMeters === 500 ? undefined : 5)
    return response.status(200).json({ stations, updatedAt: new Date(data.updatedAt).toISOString(), live: true })
  } catch {
    return response.status(502).json({ error: 'bike_data_unavailable' })
  }
}

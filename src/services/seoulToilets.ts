import type { LonLat } from './bikeRoute'
import type { RouteAmenity } from './routeConditions'

type SeoulToilet = RouteAmenity & { address: string; hours: string }

export async function fetchSeoulToiletsAlongRoute(path: LonLat[], signal: AbortSignal): Promise<SeoulToilet[]> {
  if (path.length < 2) return []
  const longitudes = path.map(point => point[0])
  const latitudes = path.map(point => point[1])
  const padding = 0.004
  const query = new URLSearchParams({
    west: String(Math.min(...longitudes) - padding),
    south: String(Math.min(...latitudes) - padding),
    east: String(Math.max(...longitudes) + padding),
    north: String(Math.max(...latitudes) + padding),
  })
  const response = await fetch(`/api/seoul-toilets?${query}`, { signal })
  if (!response.ok) throw new Error(`toilet lookup failed (${response.status})`)
  const payload = await response.json() as { places?: SeoulToilet[] }
  return Array.isArray(payload.places) ? payload.places : []
}

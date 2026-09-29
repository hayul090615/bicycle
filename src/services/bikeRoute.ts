import { getTouristStation, type TouristRoute } from '../data/touristRoutes'

export type LonLat = [number, number]
export interface BikeRouteResult { geometry: LonLat[]; waypoints: LonLat[]; distanceMeters?: number }

export async function fetchBikeRoute(route: TouristRoute, signal: AbortSignal): Promise<BikeRouteResult> {
  const stations = route.stops.map(({ stationId }) => getTouristStation(stationId))
  const waypoints = stations.map(({ lng, lat }) => [lng, lat] as LonLat)
  return fetchBikePath(waypoints, signal, true)
}

export async function fetchBikePath(waypoints: LonLat[], signal: AbortSignal, cache = false): Promise<BikeRouteResult> {
  const cacheKey = `osm-bike-route-v1-${waypoints.map(([lng, lat]) => `${lng.toFixed(5)},${lat.toFixed(5)}`).join(';')}`
  if (cache) {
    try {
      const cached = localStorage.getItem(cacheKey)
      if (cached) return JSON.parse(cached) as BikeRouteResult
    } catch { /* cache is optional */ }
  }
  const path = waypoints.map(([lng, lat]) => `${lng},${lat}`).join(';')
  const url = `https://routing.openstreetmap.de/routed-bike/route/v1/driving/${path}?overview=full&geometries=geojson&steps=false`
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`bike route ${response.status}`)
  const data = await response.json() as { code: string; routes?: Array<{ geometry?: { coordinates?: LonLat[] }; distance?: number }>; waypoints?: Array<{ location: LonLat }> }
  const geometry = data.routes?.[0]?.geometry?.coordinates
  if (data.code !== 'Ok' || !geometry || geometry.length < 2) throw new Error('bike route unavailable')
  const result = { geometry, waypoints: data.waypoints?.map(({ location }) => location) ?? waypoints, distanceMeters: data.routes?.[0]?.distance }
  if (cache) {
    try { localStorage.setItem(cacheKey, JSON.stringify(result)) } catch { /* cache is optional */ }
  }
  return result
}

import { getTouristStation, type TouristRoute } from '../data/touristRoutes'

export type LonLat = [number, number]
export interface BikeRouteInstruction { point: LonLat; maneuver: string; modifier?: string; roadName: string; distanceMeters: number }
export interface BikeRouteResult { geometry: LonLat[]; waypoints: LonLat[]; distanceMeters?: number; instructions: BikeRouteInstruction[] }

export async function fetchBikePaths(waypoints: LonLat[], signal: AbortSignal): Promise<BikeRouteResult[]> {
  const path = waypoints.map(([lng, lat]) => `${lng},${lat}`).join(';')
  const url = `https://routing.openstreetmap.de/routed-bike/route/v1/driving/${path}?overview=full&geometries=geojson&steps=true&alternatives=true`
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`bike route ${response.status}`)
  const data = await response.json() as { code: string; routes?: Array<{ geometry?: { coordinates?: LonLat[] }; distance?: number; legs?: Array<{ steps?: Array<{ distance?: number; name?: string; maneuver?: { type?: string; modifier?: string; location?: LonLat } }> }> }>; waypoints?: Array<{ location: LonLat }> }
  if (data.code !== 'Ok') throw new Error('bike route unavailable')
  const routes = (data.routes ?? []).flatMap(candidate => {
    const geometry = candidate.geometry?.coordinates
    if (!geometry || geometry.length < 2) return []
    const instructions = (candidate.legs ?? []).flatMap(leg => leg.steps ?? []).flatMap(step => {
      const location = step.maneuver?.location
      if (!location || !step.maneuver?.type) return []
      return [{ point: location, maneuver: step.maneuver.type, modifier: step.maneuver.modifier, roadName: step.name?.trim() ?? '', distanceMeters: step.distance ?? 0 }]
    })
    return [{ geometry, waypoints: data.waypoints?.map(({ location }) => location) ?? waypoints, distanceMeters: candidate.distance, instructions }]
  })
  if (!routes.length) throw new Error('bike route unavailable')
  return routes
}

export async function fetchBikeRoute(route: TouristRoute, signal: AbortSignal): Promise<BikeRouteResult> {
  const stations = route.stops.map(({ stationId }) => getTouristStation(stationId))
  const waypoints = stations.map(({ lng, lat }) => [lng, lat] as LonLat)
  return fetchBikePath(waypoints, signal, true)
}

export async function fetchBikePath(waypoints: LonLat[], signal: AbortSignal, cache = false): Promise<BikeRouteResult> {
  const cacheKey = `osm-bike-route-v2-${waypoints.map(([lng, lat]) => `${lng.toFixed(5)},${lat.toFixed(5)}`).join(';')}`
  if (cache) {
    try {
      const cached = localStorage.getItem(cacheKey)
      if (cached) return { ...(JSON.parse(cached) as BikeRouteResult), instructions: (JSON.parse(cached) as Partial<BikeRouteResult>).instructions ?? [] }
    } catch { /* cache is optional */ }
  }
  const path = waypoints.map(([lng, lat]) => `${lng},${lat}`).join(';')
  const url = `https://routing.openstreetmap.de/routed-bike/route/v1/driving/${path}?overview=full&geometries=geojson&steps=true`
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`bike route ${response.status}`)
  const data = await response.json() as { code: string; routes?: Array<{ geometry?: { coordinates?: LonLat[] }; distance?: number; legs?: Array<{ steps?: Array<{ distance?: number; name?: string; maneuver?: { type?: string; modifier?: string; location?: LonLat } }> }> }>; waypoints?: Array<{ location: LonLat }> }
  const geometry = data.routes?.[0]?.geometry?.coordinates
  if (data.code !== 'Ok' || !geometry || geometry.length < 2) throw new Error('bike route unavailable')
  const instructions = (data.routes?.[0]?.legs ?? []).flatMap(leg => leg.steps ?? []).flatMap(step => {
    const location = step.maneuver?.location
    if (!location || !step.maneuver?.type) return []
    return [{ point: location, maneuver: step.maneuver.type, modifier: step.maneuver.modifier, roadName: step.name?.trim() ?? '', distanceMeters: step.distance ?? 0 }]
  })
  const result = { geometry, waypoints: data.waypoints?.map(({ location }) => location) ?? waypoints, distanceMeters: data.routes?.[0]?.distance, instructions }
  if (cache) {
    try { localStorage.setItem(cacheKey, JSON.stringify(result)) } catch { /* cache is optional */ }
  }
  return result
}

export async function fetchWalkingPath(waypoints: LonLat[], signal: AbortSignal): Promise<BikeRouteResult> {
  const path = waypoints.map(([lng, lat]) => `${lng},${lat}`).join(';')
  const url = `https://routing.openstreetmap.de/routed-foot/route/v1/driving/${path}?overview=full&geometries=geojson&steps=false`
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`walking route ${response.status}`)
  const data = await response.json() as { code: string; routes?: Array<{ geometry?: { coordinates?: LonLat[] }; distance?: number }> }
  const geometry = data.routes?.[0]?.geometry?.coordinates
  if (data.code !== 'Ok' || !geometry || geometry.length < 2) throw new Error('walking route unavailable')
  return { geometry, waypoints, distanceMeters: data.routes?.[0]?.distance, instructions: [] }
}

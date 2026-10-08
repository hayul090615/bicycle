import { getTouristStation, type TouristRoute } from '../data/touristRoutes'

export type LonLat = [number, number]
export interface BikeRouteInstruction { point: LonLat; maneuver: string; modifier?: string; roadName: string; distanceMeters: number }
export interface BikeRouteResult { geometry: LonLat[]; waypoints: LonLat[]; distanceMeters?: number; instructions: BikeRouteInstruction[] }

// BRouter's safety profile assigns a high cost to roads with fast traffic and
// prefers cycleways and quiet streets. The public OSRM bicycle server remains
// a fallback when BRouter cannot calculate a route.
async function fetchSaferBikePath(waypoints: LonLat[], signal: AbortSignal): Promise<BikeRouteResult> {
  const params = new URLSearchParams({
    lonlats: waypoints.map(point => point.join(',')).join('|'),
    profile: 'safety',
    format: 'geojson',
    timode: '4',
  })
  const response = await fetch(`https://brouter.de/brouter?${params}`, { signal })
  if (!response.ok) throw new Error(`safe bicycle route ${response.status}`)
  const data = await response.json() as { features?: Array<{ geometry?: { coordinates?: number[][] }; properties?: { 'track-length'?: string; voicehints?: Array<[number, number, number, number, number]> } }> }
  const feature = data.features?.[0]
  const geometry = feature?.geometry?.coordinates?.map(point => [point[0], point[1]] as LonLat).filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat))
  if (!geometry || geometry.length < 2) throw new Error('safe bicycle route unavailable')
  const hints = (feature?.properties?.voicehints ?? []).filter(hint => Number.isInteger(hint[0]) && hint[0] > 0 && hint[0] < geometry.length - 1)
  const turnIndexes = [0, ...new Set(hints.map(hint => hint[0])), geometry.length - 1].sort((a, b) => a - b)
  const distanceBetween = (start: number, end: number) => {
    let meters = 0
    for (let index = start + 1; index <= end; index++) {
      const [firstLng, firstLat] = geometry[index - 1]
      const [secondLng, secondLat] = geometry[index]
      const latDelta = (secondLat - firstLat) * Math.PI / 180
      const lngDelta = (secondLng - firstLng) * Math.PI / 180
      const angle = Math.sin(latDelta / 2) ** 2 + Math.cos(firstLat * Math.PI / 180) * Math.cos(secondLat * Math.PI / 180) * Math.sin(lngDelta / 2) ** 2
      meters += 12742000 * Math.asin(Math.min(1, Math.sqrt(angle)))
    }
    return meters
  }
  const instructions: BikeRouteInstruction[] = turnIndexes.map((index, step) => {
    const angle = hints.find(hint => hint[0] === index)?.[4] ?? 0
    return {
      point: geometry[index],
      maneuver: step === 0 ? 'depart' : step === turnIndexes.length - 1 ? 'arrive' : 'turn',
      modifier: angle > 30 ? 'right' : angle < -30 ? 'left' : 'straight',
      roadName: '',
      distanceMeters: step < turnIndexes.length - 1 ? distanceBetween(index, turnIndexes[step + 1]) : 0,
    }
  })
  return { geometry, waypoints, distanceMeters: Number(feature?.properties?.['track-length']) || distanceBetween(0, geometry.length - 1), instructions }
}

export async function fetchBikePaths(waypoints: LonLat[], signal: AbortSignal): Promise<BikeRouteResult[]> {
  try { return [await fetchSaferBikePath(waypoints, signal)] } catch (error) { if (signal.aborted) throw error }
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
  const cacheKey = `safe-bike-route-v3-${waypoints.map(([lng, lat]) => `${lng.toFixed(5)},${lat.toFixed(5)}`).join(';')}`
  if (cache) {
    try {
      const cached = localStorage.getItem(cacheKey)
      if (cached) return { ...(JSON.parse(cached) as BikeRouteResult), instructions: (JSON.parse(cached) as Partial<BikeRouteResult>).instructions ?? [] }
    } catch { /* cache is optional */ }
  }
  try {
    const saferRoute = await fetchSaferBikePath(waypoints, signal)
    if (cache) { try { localStorage.setItem(cacheKey, JSON.stringify(saferRoute)) } catch { /* cache is optional */ } }
    return saferRoute
  } catch (error) { if (signal.aborted) throw error }
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

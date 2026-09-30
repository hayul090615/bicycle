import type { LonLat } from './bikeRoute'

export type RouteCondition =
  | { kind: 'signal'; id: string; lat: number; lng: number }
  | { kind: 'uphill' | 'downhill'; id: string; lat: number; lng: number; grade: number }

export type RouteRestaurant = {
  id: string
  name: string
  lat: number
  lng: number
  kind: 'restaurant' | 'cafe' | 'quick'
  cuisine?: string
}

export type RouteBikeLane = { id: string; points: LonLat[]; kind: 'cycleway' | 'lane' }
export type RouteAmenity = { id: string; name: string; lat: number; lng: number; kind: 'pump' | 'water' | 'toilet' | 'convenience'; distanceMeters: number }
export type RouteElevationPoint = { distanceMeters: number; elevationMeters: number }

type Sample = { point: LonLat; distance: number }
type OSMResponse = { elements?: Array<{ id: number; type?: string; lat?: number; lon?: number; center?: { lat: number; lon: number }; geometry?: Array<{ lat: number; lon: number }>; tags?: Record<string, string> }> }
const METERS_PER_DEGREE_LAT = 111_000
const signalCache = new Map<string, RouteCondition[]>()
const gradeCache = new Map<string, RouteCondition[]>()
const restaurantCache = new Map<string, RouteRestaurant[]>()
const bikeLaneCache = new Map<string, RouteBikeLane[]>()
const amenityCache = new Map<string, RouteAmenity[]>()
const elevationCache = new Map<string, RouteElevationPoint[]>()
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]

async function queryOverpass(query: string, signal: AbortSignal): Promise<OSMResponse> {
  let response: Response | undefined
  let requestError: unknown
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      response = await fetch(endpoint, {
        method: 'POST', signal,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', Accept: 'application/json' },
        body: `data=${encodeURIComponent(query)}`,
      })
      if (response.ok) break
      response = undefined
    } catch (error) {
      requestError = error
      if (signal.aborted) throw error
    }
  }
  if (!response?.ok) throw requestError ?? new Error('OpenStreetMap data unavailable')
  return response.json() as Promise<OSMResponse>
}

function segmentLength([lng1, lat1]: LonLat, [lng2, lat2]: LonLat) {
  const lat = (lat1 + lat2) * Math.PI / 360
  const dx = (lng2 - lng1) * METERS_PER_DEGREE_LAT * Math.cos(lat)
  const dy = (lat2 - lat1) * METERS_PER_DEGREE_LAT
  return Math.hypot(dx, dy)
}

function routeSamples(path: LonLat[], spacingMeters: number, maximum = 64): Sample[] {
  if (path.length < 2) return []
  const cumulative = [0]
  for (let index = 1; index < path.length; index++) cumulative.push(cumulative[index - 1] + segmentLength(path[index - 1], path[index]))
  const total = cumulative[cumulative.length - 1]
  if (total <= 0) return []
  const count = Math.max(2, Math.min(maximum, Math.ceil(total / spacingMeters) + 1))
  const result: Sample[] = []
  let index = 1
  for (let sample = 0; sample < count; sample++) {
    const distance = total * sample / (count - 1)
    while (index < cumulative.length - 1 && cumulative[index] < distance) index++
    const startDistance = cumulative[index - 1]
    const fraction = (distance - startDistance) / Math.max(1, cumulative[index] - startDistance)
    result.push({ point: [
      path[index - 1][0] + (path[index][0] - path[index - 1][0]) * fraction,
      path[index - 1][1] + (path[index][1] - path[index - 1][1]) * fraction,
    ], distance })
  }
  return result
}

function cacheKey(path: LonLat[]) {
  const samples = routeSamples(path, 500, 32)
  return samples.map(({ point }) => `${point[0].toFixed(4)},${point[1].toFixed(4)}`).join(';')
}

function metersToSegment(point: LonLat, start: LonLat, end: LonLat) {
  const referenceLat = (point[1] + start[1] + end[1]) / 3 * Math.PI / 180
  const xScale = METERS_PER_DEGREE_LAT * Math.cos(referenceLat)
  const px = point[0] * xScale, py = point[1] * METERS_PER_DEGREE_LAT
  const ax = start[0] * xScale, ay = start[1] * METERS_PER_DEGREE_LAT
  const bx = end[0] * xScale, by = end[1] * METERS_PER_DEGREE_LAT
  const dx = bx - ax, dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / Math.max(1, dx * dx + dy * dy)))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

function distanceAlongRoute(point: LonLat, path: LonLat[]) {
  let bestDistance = Infinity
  let cumulative = 0
  let bestAlong = 0
  for (let index = 1; index < path.length; index++) {
    const length = segmentLength(path[index - 1], path[index])
    const gap = metersToSegment(point, path[index - 1], path[index])
    if (gap < bestDistance) { bestDistance = gap; bestAlong = cumulative + length / 2 }
    cumulative += length
  }
  return { gap: bestDistance, along: bestAlong }
}

export async function fetchRouteSignals(path: LonLat[], signal: AbortSignal): Promise<RouteCondition[]> {
  const key = cacheKey(path)
  const cached = signalCache.get(key)
  if (cached) return cached
  const samples = routeSamples(path, 350, 46)
  if (samples.length < 2) return []
  const pairs = samples.map(({ point: [lng, lat] }) => `${lat.toFixed(5)},${lng.toFixed(5)}`).join(',')
  const query = `[out:json][timeout:7];(node["highway"="traffic_signals"](around:45,${pairs});node["crossing"="traffic_signals"](around:45,${pairs}););out body;`
  const data = await queryOverpass(query, signal)
  const elements = (data.elements ?? []).filter(item => Number.isFinite(item.lat) && Number.isFinite(item.lon))
  const found = elements.map(item => {
    const point: LonLat = [item.lon!, item.lat!]
    return { item, point, ...distanceAlongRoute(point, path) }
  }).filter(item => item.gap <= 55).sort((a, b) => a.along - b.along)
  const unique: RouteCondition[] = []
  let previous: LonLat | null = null
  for (const { item, point } of found) {
    if (previous && segmentLength(previous, point) < 70) continue
    unique.push({ kind: 'signal', id: `signal-${item.id}`, lng: point[0], lat: point[1] })
    previous = point
    if (unique.length >= 18) break
  }
  signalCache.set(key, unique)
  return unique
}

export async function fetchRouteBikeLanes(path: LonLat[], signal: AbortSignal): Promise<RouteBikeLane[]> {
  const key = cacheKey(path)
  const cached = bikeLaneCache.get(key)
  if (cached) return cached
  const samples = routeSamples(path, 380, 44)
  if (samples.length < 2) return []
  const pairs = samples.map(({ point: [lng, lat] }) => `${lat.toFixed(5)},${lng.toFixed(5)}`).join(',')
  const query = `[out:json][timeout:12];(way["highway"="cycleway"](around:240,${pairs});way["cycleway"~"^(lane|track|shared_lane)$"](around:240,${pairs});way["cycleway:left"~"^(lane|track)$"](around:240,${pairs});way["cycleway:right"~"^(lane|track)$"](around:240,${pairs}););out geom 300;`
  const data = await queryOverpass(query, signal)
  const lanes = (data.elements ?? []).flatMap(item => {
    const points = (item.geometry ?? []).map(point => [point.lon, point.lat] as LonLat)
    if (points.length < 2) return []
    const close = points.some((point, index) => index % 8 === 0 && distanceAlongRoute(point, path).gap <= 280)
    if (!close) return []
    return [{ id: `bike-lane-${item.id}`, points, kind: item.tags?.highway === 'cycleway' ? 'cycleway' as const : 'lane' as const }]
  }).slice(0, 220)
  bikeLaneCache.set(key, lanes)
  return lanes
}

export async function fetchRouteAmenities(path: LonLat[], signal: AbortSignal): Promise<RouteAmenity[]> {
  const key = cacheKey(path)
  const cached = amenityCache.get(key)
  if (cached) return cached
  const samples = routeSamples(path, 600, 28)
  if (samples.length < 2) return []
  const pairs = samples.map(({ point: [lng, lat] }) => `${lat.toFixed(5)},${lng.toFixed(5)}`).join(',')
  const query = `[out:json][timeout:12];(node["amenity"~"^(bicycle_repair_station|drinking_water|toilets)$"](around:140,${pairs});way["amenity"~"^(bicycle_repair_station|drinking_water|toilets)$"](around:140,${pairs});node["shop"="convenience"](around:140,${pairs});way["shop"="convenience"](around:140,${pairs});node["service:bicycle:pump"="yes"](around:140,${pairs});way["service:bicycle:pump"="yes"](around:140,${pairs});node["compressed_air"="yes"](around:140,${pairs}););out center 120;`
  const data = await queryOverpass(query, signal)
  const amenities: RouteAmenity[] = []
  for (const item of data.elements ?? []) {
    const lat = item.lat ?? item.center?.lat
    const lng = item.lon ?? item.center?.lon
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    const tags = item.tags ?? {}
    const kind: RouteAmenity['kind'] = tags.shop === 'convenience' ? 'convenience'
      : tags.amenity === 'toilets' ? 'toilet'
        : tags.amenity === 'drinking_water' ? 'water' : 'pump'
    const closest = distanceAlongRoute([lng!, lat!], path)
    if (closest.gap > 170) continue
    amenities.push({ id: `amenity-${item.type ?? 'node'}-${item.id}`, name: tags.name?.trim() || '', lat: lat!, lng: lng!, kind, distanceMeters: closest.along })
  }
  const result = amenities.sort((a, b) => a.distanceMeters - b.distanceMeters).filter((item, index, all) =>
    all.findIndex(other => other.kind === item.kind && segmentLength([other.lng, other.lat], [item.lng, item.lat]) < 30) === index).slice(0, 60)
  amenityCache.set(key, result)
  return result
}

export async function fetchRouteElevationProfile(path: LonLat[], signal: AbortSignal): Promise<RouteElevationPoint[]> {
  const key = cacheKey(path)
  const cached = elevationCache.get(key)
  if (cached) return cached
  const samples = routeSamples(path, 240, 50)
  if (samples.length < 2) return []
  const latitude = samples.map(({ point: [, lat] }) => lat.toFixed(5)).join(',')
  const longitude = samples.map(({ point: [lng] }) => lng.toFixed(5)).join(',')
  const response = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${latitude}&longitude=${longitude}`, { signal })
  if (!response.ok) throw new Error(`elevation request ${response.status}`)
  const data = await response.json() as { elevation?: number[] }
  if (!data.elevation || data.elevation.length !== samples.length) throw new Error('elevation data unavailable')
  const result = samples.map((sample, index) => ({ distanceMeters: sample.distance, elevationMeters: data.elevation![index] }))
  elevationCache.set(key, result)
  return result
}

export async function fetchRouteRestaurants(path: LonLat[], signal: AbortSignal): Promise<RouteRestaurant[]> {
  const key = cacheKey(path)
  const cached = restaurantCache.get(key)
  if (cached) return cached
  const samples = routeSamples(path, 700, 24)
  if (samples.length < 2) return []
  const pairs = samples.map(({ point: [lng, lat] }) => `${lat.toFixed(5)},${lng.toFixed(5)}`).join(',')
  const query = `[out:json][timeout:8];nwr(around:450,${pairs})["amenity"~"^(restaurant|cafe|fast_food|food_court)$"]["name"];out center tags 60;`
  const data = await queryOverpass(query, signal)
  const candidates = (data.elements ?? []).flatMap(item => {
    const tags = item.tags ?? {}
    const lat = item.lat ?? item.center?.lat
    const lng = item.lon ?? item.center?.lon
    const name = tags.name?.trim()
    const amenity = tags.amenity
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !name || !amenity) return []
    const point: LonLat = [lng!, lat!]
    const routePosition = distanceAlongRoute(point, path)
    if (routePosition.gap > 480) return []
    const kind: RouteRestaurant['kind'] = amenity === 'cafe' ? 'cafe' : amenity === 'fast_food' ? 'quick' : 'restaurant'
    return [{
      restaurant: { id: `${item.type ?? 'place'}-${item.id}`, name, lat: lat!, lng: lng!, kind, cuisine: tags.cuisine },
      point,
      along: routePosition.along,
    }]
  }).sort((a, b) => a.along - b.along)
  const results: RouteRestaurant[] = []
  for (const candidate of candidates) {
    if (results.some(item => segmentLength([item.lng, item.lat], candidate.point) < 35)) continue
    results.push(candidate.restaurant)
    if (results.length >= 40) break
  }
  restaurantCache.set(key, results)
  return results
}

export async function fetchRouteGrades(path: LonLat[], signal: AbortSignal): Promise<RouteCondition[]> {
  const key = cacheKey(path)
  const cached = gradeCache.get(key)
  if (cached) return cached
  const samples = routeSamples(path, 160, 90)
  if (samples.length < 5) return []
  const latitude = samples.map(({ point: [, lat] }) => lat.toFixed(5)).join(',')
  const longitude = samples.map(({ point: [lng] }) => lng.toFixed(5)).join(',')
  const url = `https://api.open-meteo.com/v1/elevation?latitude=${latitude}&longitude=${longitude}`
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`elevation request ${response.status}`)
  const data = await response.json() as { elevation?: number[] }
  const elevations = data.elevation
  if (!elevations || elevations.length !== samples.length) throw new Error('elevation data unavailable')
  const candidates: Array<Extract<RouteCondition, { kind: 'uphill' | 'downhill' }> & { along: number }> = []
  for (let index = 0; index + 4 < samples.length; index++) {
    const span = samples[index + 4].distance - samples[index].distance
    if (span < 350) continue
    const grade = (elevations[index + 4] - elevations[index]) / span * 100
    if (Math.abs(grade) < 2.8) continue
    const [lng, lat] = samples[index + 2].point
    candidates.push({ kind: grade > 0 ? 'uphill' : 'downhill', id: `grade-${index}`, lat, lng, grade: Math.round(Math.abs(grade) * 10) / 10, along: samples[index + 2].distance })
  }
  const selected: RouteCondition[] = []
  const selectedDistances: number[] = []
  for (const candidate of candidates.sort((a, b) => b.grade - a.grade)) {
    if (selectedDistances.some(distance => Math.abs(candidate.along - distance) < 700)) continue
    const { along: _along, ...condition } = candidate
    selected.push(condition)
    selectedDistances.push(candidate.along)
    if (selected.length >= 10) break
  }
  selected.sort((a, b) => distanceAlongRoute([a.lng, a.lat], path).along - distanceAlongRoute([b.lng, b.lat], path).along)
  gradeCache.set(key, selected)
  return selected
}

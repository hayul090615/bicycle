import type { LonLat } from './bikeRoute'
import type { RouteElevationPoint } from './routeConditions'

export type ColoredRouteSegment = { path: LonLat[]; color: string }

function lengthMeters(a: LonLat, b: LonLat): number {
  const latitude = (a[1] + b[1]) * Math.PI / 360
  return Math.hypot((a[0] - b[0]) * 111_000 * Math.cos(latitude), (a[1] - b[1]) * 111_000)
}

export function routeElevationColor(elevation: number, minimum: number, maximum: number): string {
  if (maximum - minimum < 5) return '#ffffff'
  const t = Math.max(0, Math.min(1, (elevation - minimum) / (maximum - minimum)))
  return `rgb(255,${Math.round(255 - 193 * t)},${Math.round(255 - 199 * t)})`
}

export function routeGradientStops(profile: RouteElevationPoint[]): Array<[number, string]> {
  if (profile.length < 2) return [[0, '#ffffff'], [1, '#ffffff']]
  const minimum = Math.min(...profile.map(point => point.elevationMeters))
  const maximum = Math.max(...profile.map(point => point.elevationMeters))
  const total = Math.max(1, profile.at(-1)!.distanceMeters)
  return profile.map(point => [Math.min(1, point.distanceMeters / total), routeElevationColor(point.elevationMeters, minimum, maximum)])
}

export function coloredRouteSegments(path: LonLat[], profile: RouteElevationPoint[]): ColoredRouteSegment[] {
  if (path.length < 2) return []
  if (profile.length < 2) return [{ path, color: '#ffffff' }]
  const minimum = Math.min(...profile.map(point => point.elevationMeters))
  const maximum = Math.max(...profile.map(point => point.elevationMeters))
  const cumulative = [0]
  for (let index = 1; index < path.length; index++) cumulative.push(cumulative[index - 1] + lengthMeters(path[index - 1], path[index]))
  const total = cumulative.at(-1) ?? 0
  if (total <= 0) return [{ path, color: '#ffffff' }]
  const sampleTotal = Math.max(1, profile.at(-1)!.distanceMeters)
  const pointAt = (target: number): LonLat => {
    let index = 1
    while (index < cumulative.length - 1 && cumulative[index] < target) index++
    const fraction = Math.max(0, Math.min(1, (target - cumulative[index - 1]) / Math.max(1, cumulative[index] - cumulative[index - 1])))
    return [path[index - 1][0] + (path[index][0] - path[index - 1][0]) * fraction, path[index - 1][1] + (path[index][1] - path[index - 1][1]) * fraction]
  }
  return profile.slice(1).map((point, index) => {
    const from = profile[index].distanceMeters / sampleTotal * total
    const to = point.distanceMeters / sampleTotal * total
    const vertices = path.slice(1, -1).filter((_, vertexIndex) => cumulative[vertexIndex + 1] > from && cumulative[vertexIndex + 1] < to)
    return { path: [pointAt(from), ...vertices, pointAt(to)], color: routeElevationColor((profile[index].elevationMeters + point.elevationMeters) / 2, minimum, maximum) }
  }).filter(segment => segment.path.length >= 2)
}

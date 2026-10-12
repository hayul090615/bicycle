/**
 * 경로의 고도 값에 따라 낮은 곳은 연한 빨강, 높은 곳은 진한 빨강으로 변환한다. 고도 샘플의 시작점부터 더한 거리에 맞춰 지도 선을 색상별 구간으로 나눈다.
 */
import type { LonLat } from './bikeRoute'
import type { RouteElevationPoint } from './routeConditions'

export type ColoredRouteSegment = { path: LonLat[]; color: string }

/** 경로 선분의 길이를 미터 단위로 구한다. */
function lengthMeters(a: LonLat, b: LonLat): number {
  const latitude = (a[1] + b[1]) * Math.PI / 360
  return Math.hypot((a[0] - b[0]) * 111_000 * Math.cos(latitude), (a[1] - b[1]) * 111_000)
}

/** 전체 고도 범위 안에서 해당 고도의 빨강 계열 색상을 고른다. */
export function routeElevationColor(elevation: number, minimum: number, maximum: number): string {
  if (maximum - minimum < 1.2) return '#f7b7b0'
  const t = Math.max(0, Math.min(1, (elevation - minimum) / (maximum - minimum)))
  return `rgb(${Math.round(247 - 7 * t)},${Math.round(183 - 131 * t)},${Math.round(176 - 127 * t)})`
}

/** 고도 프로필을 경로 진행 비율과 색상 정지점으로 변환한다. */
export function routeGradientStops(profile: RouteElevationPoint[]): Array<[number, string]> {
  if (profile.length < 2) return [[0, '#f7b7b0'], [1, '#f7b7b0']]
  const minimum = Math.min(...profile.map(point => point.elevationMeters))
  const maximum = Math.max(...profile.map(point => point.elevationMeters))
  const total = Math.max(1, profile.at(-1)!.distanceMeters)
  return profile.map(point => [Math.min(1, point.distanceMeters / total), routeElevationColor(point.elevationMeters, minimum, maximum)])
}

/** 고도 샘플 간 시작점부터 더한 거리에 맞춰 경로를 색상별 선분으로 나눈다. */
export function coloredRouteSegments(path: LonLat[], profile: RouteElevationPoint[]): ColoredRouteSegment[] {
  if (path.length < 2) return []
  if (profile.length < 2) return [{ path, color: '#f7b7b0' }]
  const minimum = Math.min(...profile.map(point => point.elevationMeters))
  const maximum = Math.max(...profile.map(point => point.elevationMeters))
  const cumulative = [0]
  for (let index = 1; index < path.length; index++) cumulative.push(cumulative[index - 1] + lengthMeters(path[index - 1], path[index]))
  const total = cumulative.at(-1) ?? 0
  if (total <= 0) return [{ path, color: '#f7b7b0' }]
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

import type { LonLat } from '../services/bikeRoute'

export type RouteMapSample = { point: LonLat; bearing: number; distance: number }

/** Samples a route at fixed meter intervals and always includes both endpoints. */
export function sampleRouteAtIntervals(path: LonLat[], intervalMeters: number): RouteMapSample[] {
  if (path.length < 2 || intervalMeters <= 0) return []
  const segmentLengths: number[] = []
  const cumulative = [0]
  for (let index = 1; index < path.length; index++) {
    const [startLng, startLat] = path[index - 1]
    const [endLng, endLat] = path[index]
    const meanLatitude = (startLat + endLat) * Math.PI / 360
    const length = Math.hypot((endLng - startLng) * 111_000 * Math.cos(meanLatitude), (endLat - startLat) * 111_000)
    segmentLengths.push(length)
    cumulative.push(cumulative[index - 1] + length)
  }
  const total = cumulative[cumulative.length - 1]
  if (total <= 0) return []
  const distances: number[] = []
  for (let distance = 0; distance < total; distance += intervalMeters) distances.push(distance)
  if (distances[distances.length - 1] !== total) distances.push(total)
  return distances.map(distance => {
    let segment = 0
    while (segment < segmentLengths.length - 1 && cumulative[segment + 1] < distance) segment++
    const length = Math.max(1, segmentLengths[segment])
    const ratio = Math.max(0, Math.min(1, (distance - cumulative[segment]) / length))
    const [startLng, startLat] = path[segment]
    const [endLng, endLat] = path[segment + 1]
    const point: LonLat = [startLng + (endLng - startLng) * ratio, startLat + (endLat - startLat) * ratio]
    const meanLatitude = (startLat + endLat) * Math.PI / 360
    const bearing = (Math.atan2((endLng - startLng) * Math.cos(meanLatitude), endLat - startLat) * 180 / Math.PI + 360) % 360
    return { point, bearing, distance }
  })
}

export function offsetRouteSample([lng, lat]: LonLat, bearing: number, meters: number, side: 1 | -1): LonLat {
  const angle = (bearing + 90 * side) * Math.PI / 180
  return [lng + Math.sin(angle) * meters / (111_000 * Math.max(.2, Math.cos(lat * Math.PI / 180))), lat + Math.cos(angle) * meters / 111_000]
}

import type { LonLat } from '../services/bikeRoute'

export type RouteArrivalMarker = { point: LonLat; bearing: number }

/** One direction marker placed just before the route endpoint. */
export function routeArrivalMarker(points: LonLat[] | null | undefined): RouteArrivalMarker | null {
  if (!points || points.length < 2) return null
  const [toLng, toLat] = points.at(-1)!
  const radians = Math.PI / 180
  for (let index = points.length - 2; index >= 0; index--) {
    const [fromLng, fromLat] = points[index]
    const latitudeDelta = toLat - fromLat
    const longitudeDelta = toLng - fromLng
    if (Math.abs(latitudeDelta) + Math.abs(longitudeDelta) < 1e-10) continue
    const latitude1 = fromLat * radians
    const latitude2 = toLat * radians
    const bearingY = Math.sin(longitudeDelta * radians) * Math.cos(latitude2)
    const bearingX = Math.cos(latitude1) * Math.sin(latitude2)
      - Math.sin(latitude1) * Math.cos(latitude2) * Math.cos(longitudeDelta * radians)
    const bearing = (Math.atan2(bearingY, bearingX) / radians + 360) % 360
    const segmentMeters = Math.hypot(
      longitudeDelta * 111_320 * Math.cos((latitude1 + latitude2) / 2),
      latitudeDelta * 110_540,
    )
    const fraction = segmentMeters > 30 ? 1 - 22 / segmentMeters : 0.65
    return {
      point: [fromLng + longitudeDelta * fraction, fromLat + latitudeDelta * fraction],
      bearing,
    }
  }
  return null
}

import type { LonLat } from '../services/bikeRoute'

/** Bearing of the final route segment, clockwise from north. */
export function routeArrivalBearing(points: LonLat[] | null | undefined) {
  if (!points || points.length < 2) return 0
  const [fromLng, fromLat] = points[points.length - 2]
  const [toLng, toLat] = points[points.length - 1]
  const radians = Math.PI / 180
  const latitude1 = fromLat * radians
  const latitude2 = toLat * radians
  const longitudeDelta = (toLng - fromLng) * radians
  const y = Math.sin(longitudeDelta) * Math.cos(latitude2)
  const x = Math.cos(latitude1) * Math.sin(latitude2) - Math.sin(latitude1) * Math.cos(latitude2) * Math.cos(longitudeDelta)
  return (Math.atan2(y, x) / radians + 360) % 360
}

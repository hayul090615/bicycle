import type { LonLat } from '../services/bikeRoute'

/** Bearing of the final non-zero route segment, clockwise from north. */
export function routeArrivalBearing(points: LonLat[] | null | undefined) {
  if (!points || points.length < 2) return 0
  const radians = Math.PI / 180
  const [toLng, toLat] = points.at(-1)!
  for (let index = points.length - 2; index >= 0; index--) {
    const [fromLng, fromLat] = points[index]
    if (Math.abs(toLng - fromLng) + Math.abs(toLat - fromLat) < 1e-10) continue
    const latitude1 = fromLat * radians
    const latitude2 = toLat * radians
    const longitudeDelta = (toLng - fromLng) * radians
    const y = Math.sin(longitudeDelta) * Math.cos(latitude2)
    const x = Math.cos(latitude1) * Math.sin(latitude2)
      - Math.sin(latitude1) * Math.cos(latitude2) * Math.cos(longitudeDelta)
    return (Math.atan2(y, x) / radians + 360) % 360
  }
  return 0
}

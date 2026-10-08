import type { LonLat } from '../services/bikeRoute'

export type RouteArrivalMarker = { point: LonLat; bearing: number }

/** Route endpoint and bearing of its final non-zero segment. */
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
    return { point: [toLng, toLat], bearing }
  }
  return null
}

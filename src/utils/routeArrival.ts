import type { LonLat } from '../services/bikeRoute'

export type RouteArrivalMarker = { point: LonLat; bearing: number }

function distanceMeters(first: LonLat, second: LonLat) {
  const radians = Math.PI / 180
  const latitudeDelta = (second[1] - first[1]) * radians
  const longitudeDelta = (second[0] - first[0]) * radians
  const latitude1 = first[1] * radians
  const latitude2 = second[1] * radians
  const angle = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDelta / 2) ** 2
  return 12_742_000 * Math.asin(Math.min(1, Math.sqrt(angle)))
}

export function isAtRoadviewDestination(position: { lat: number; lng: number }, destination: { lat: number; lng: number }) {
  return [position.lat, position.lng, destination.lat, destination.lng].every(Number.isFinite)
    && distanceMeters([position.lng, position.lat], [destination.lng, destination.lat]) <= 35
}

/** Connect a snapped bicycle-route endpoint to the exact selected destination. */
export function routeArrivalConnector(points: LonLat[] | null | undefined, destination: LonLat | null | undefined): [LonLat, LonLat] | null {
  const endpoint = points?.at(-1)
  if (!endpoint || !destination || distanceMeters(endpoint, destination) < 8) return null
  return [endpoint, destination]
}

/** Exact destination point and bearing of the final route segment or endpoint connector. */
export function routeArrivalMarker(points: LonLat[] | null | undefined, destination?: LonLat | null): RouteArrivalMarker | null {
  if (!points || points.length < 2) return null
  const endpoint = points.at(-1)!
  const [toLng, toLat] = destination ?? endpoint
  const hasEndpointConnector = distanceMeters(endpoint, [toLng, toLat]) >= 8
  const radians = Math.PI / 180
  const candidatePoints = hasEndpointConnector ? [endpoint] : points.slice(0, -1).reverse()
  for (const [fromLng, fromLat] of candidatePoints) {
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

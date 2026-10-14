/**
 * 선택 목적지까지의 마지막 연결선과 화살표 방향을 계산한다. 로드뷰 도착은 촬영 좌표 거리와 남은 경로 거리를 함께 확인한다.
 */
import type { LonLat } from '../services/bikeRoute'

export type RouteArrivalMarker = { point: LonLat; bearing: number }

/** 두 지리 좌표의 거리를 미터 단위로 구한다. */
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

/** 로드뷰의 실제 촬영 좌표가 목적지와 경로 끝에 함께 도달했는지 확인한다. */
export function isAtRoadviewDestination(position: { lat: number; lng: number }, destination: { lat: number; lng: number }, remainingMeters: number, routeGapMeters: number, destinationPhotoRadius?: number) {
  // 목적지와 촬영 위치가 일치하지 않을 때는 SDK가 확인한 목적지 사진의 범위만 허용한다.
  const confirmedPhoto = destinationPhotoRadius === 30 || destinationPhotoRadius === 80
  const proximity = confirmedPhoto ? destinationPhotoRadius + 10 : 10
  return [position.lat, position.lng, destination.lat, destination.lng, remainingMeters, routeGapMeters].every(Number.isFinite)
    && remainingMeters >= 0 && remainingMeters <= (confirmedPhoto ? proximity : 6)
    && routeGapMeters >= 0 && routeGapMeters <= proximity
    && distanceMeters([position.lng, position.lat], [destination.lng, destination.lat]) <= proximity
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

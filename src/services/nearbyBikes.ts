/**
 * 지도 중심 또는 GPS 주변의 대여소를 거리 순으로 고른다. 기본 스냅샷 조회와 서버 실시간 조회를 제공하며 반경·거리 단위는 미터다.
 */
import { bundledBikeStations } from './seoulBikeApi'

export type MapCoordinate = { lat: number; lng: number }

export type NearbyBikeStation = MapCoordinate & {
  id: string
  name: string
  distanceMeters: number
  available: number | null
}

export type NearbyBikeResult = {
  stations: NearbyBikeStation[]
  updatedAt: string | null
  live: boolean
}

const radians = Math.PI / 180

/** 반경 조회에 사용할 위도·경도가 유효한지 확인한다. */
function hasValidCoordinates(location: MapCoordinate) {
  return Number.isFinite(location.lat) && Number.isFinite(location.lng)
    && location.lat >= -90 && location.lat <= 90
    && location.lng >= -180 && location.lng <= 180
}

/** 두 위도·경도 위치 사이의 거리를 미터로 구한다. */
export function metersBetween(from: MapCoordinate, to: MapCoordinate) {
  const latitude = (to.lat - from.lat) * radians
  const longitude = (to.lng - from.lng) * radians
  const arc = Math.sin(latitude / 2) ** 2 + Math.cos(from.lat * radians) * Math.cos(to.lat * radians) * Math.sin(longitude / 2) ** 2
  return 6371000 * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc))
}

/** 기본 대여소 자료를 반경 안으로 제한하고 가까운 순서로 고른다. */
export function nearestSnapshotStations(location: MapCoordinate, count = 5, radiusMeters = 5_000): NearbyBikeStation[] {
  if (!hasValidCoordinates(location)) return []
  return bundledBikeStations.map(station => ({
    id: station.id,
    name: station.name,
    lat: station.lat,
    lng: station.lng,
    distanceMeters: metersBetween(location, station),
    available: null,
  })).filter(station => station.distanceMeters <= radiusMeters)
    .sort((first, second) => first.distanceMeters - second.distanceMeters)
    .slice(0, count)
}

/** 서버에 좌표와 반경을 보내 실시간 대여소 목록을 가져온다. */
export async function fetchNearbyBikeStations(location: MapCoordinate, signal: AbortSignal, radiusMeters = 5_000): Promise<NearbyBikeResult> {
  if (!hasValidCoordinates(location)) throw new Error('Invalid bike station search coordinates')
  const origin = window.location.hostname.endsWith('github.io') ? 'https://seoul-ttareungi-typing.vercel.app' : ''
  const url = `${origin}/api/nearby-bikes?lat=${location.lat.toFixed(6)}&lng=${location.lng.toFixed(6)}&radius=${radiusMeters}`
  const response = await fetch(url, { signal, cache: 'no-store' })
  if (!response.ok) throw new Error(`Live bike availability ${response.status}`)
  const result = await response.json() as NearbyBikeResult
  if (!Array.isArray(result.stations)) throw new Error('Invalid bike availability data')
  return result
}

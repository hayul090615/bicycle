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

export function metersBetween(from: MapCoordinate, to: MapCoordinate) {
  const latitude = (to.lat - from.lat) * radians
  const longitude = (to.lng - from.lng) * radians
  const arc = Math.sin(latitude / 2) ** 2 + Math.cos(from.lat * radians) * Math.cos(to.lat * radians) * Math.sin(longitude / 2) ** 2
  return 6371000 * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc))
}

export function nearestSnapshotStations(location: MapCoordinate, count = 5, radiusMeters = 5_000): NearbyBikeStation[] {
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

export async function fetchNearbyBikeStations(location: MapCoordinate, signal: AbortSignal, radiusMeters = 5_000): Promise<NearbyBikeResult> {
  const origin = window.location.hostname.endsWith('github.io') ? 'https://seoul-ttareungi-typing.vercel.app' : ''
  const url = `${origin}/api/nearby-bikes?lat=${location.lat.toFixed(6)}&lng=${location.lng.toFixed(6)}&radius=${radiusMeters}`
  const response = await fetch(url, { signal, cache: 'no-store' })
  if (!response.ok) throw new Error(`Live bike availability ${response.status}`)
  const result = await response.json() as NearbyBikeResult
  if (!Array.isArray(result.stations)) throw new Error('Invalid bike availability data')
  return result
}

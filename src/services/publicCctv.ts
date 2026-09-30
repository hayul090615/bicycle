import type { LonLat } from './bikeRoute'

export interface PublicCamera {
  id: string
  name: string
  address: string
  purpose: string
  cameras: string
  resolution: string
  direction: string
  lat: number
  lng: number
  updatedAt: string
}

export interface CameraBundle {
  count: number
  latestRecordDate: string
  cameras: PublicCamera[]
}

let bundleRequest: Promise<CameraBundle> | null = null

export function loadPublicCctvBundle() {
  if (!bundleRequest) {
    bundleRequest = fetch(`${import.meta.env.BASE_URL}datasets/seoul-cctv.json.gz`)
      .then(response => { if (!response.ok) throw new Error(String(response.status)); return response.arrayBuffer() })
      .then(async compressed => {
        const signature = new Uint8Array(compressed, 0, Math.min(2, compressed.byteLength))
        if (signature[0] !== 0x1f || signature[1] !== 0x8b) return JSON.parse(new TextDecoder().decode(compressed)) as CameraBundle
        if (!('DecompressionStream' in window)) throw new Error('GZIP_UNSUPPORTED')
        const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))
        return await new Response(stream).json() as CameraBundle
      })
      .catch(error => { bundleRequest = null; throw error })
  }
  return bundleRequest
}

export function clusterPublicCameras(cameras: PublicCamera[], center: { lat: number; lng: number }, radiusMeters: number, cellMeters: number) {
  const latitudeCell = Math.max(0.0002, cellMeters / 111_320)
  const longitudeCell = Math.max(0.0002, cellMeters / (111_320 * Math.cos(center.lat * Math.PI / 180)))
  const latitudeRadius = radiusMeters / 111_320
  const longitudeRadius = radiusMeters / (111_320 * Math.cos(center.lat * Math.PI / 180))
  const groups = new Map<string, PublicCamera[]>()
  for (const camera of cameras) {
    if (Math.abs(camera.lat - center.lat) > latitudeRadius || Math.abs(camera.lng - center.lng) > longitudeRadius) continue
    const key = `${Math.floor(camera.lat / latitudeCell)}:${Math.floor(camera.lng / longitudeCell)}`
    const group = groups.get(key)
    if (group) group.push(camera)
    else groups.set(key, [camera])
  }
  return [...groups.values()].map(group => ({
    lat: group.reduce((sum, camera) => sum + camera.lat, 0) / group.length,
    lng: group.reduce((sum, camera) => sum + camera.lng, 0) / group.length,
    cameras: group,
  }))
}

function distanceToRouteSegmentMeters(camera: PublicCamera, start: LonLat, end: LonLat) {
  const latitudeScale = 111_320
  const longitudeScale = latitudeScale * Math.cos(camera.lat * Math.PI / 180)
  const ax = (start[0] - camera.lng) * longitudeScale
  const ay = (start[1] - camera.lat) * latitudeScale
  const bx = (end[0] - camera.lng) * longitudeScale
  const by = (end[1] - camera.lat) * latitudeScale
  const dx = bx - ax
  const dy = by - ay
  const ratio = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / Math.max(1, dx * dx + dy * dy)))
  return Math.hypot(ax + ratio * dx, ay + ratio * dy)
}

export function publicCamerasAlongRoute(cameras: PublicCamera[], path: LonLat[], radiusMeters = 500) {
  if (path.length < 2) return []
  const paddingLat = radiusMeters / 111_320
  const minLat = Math.min(...path.map((point) => point[1])) - paddingLat
  const maxLat = Math.max(...path.map((point) => point[1])) + paddingLat
  const referenceLat = (minLat + maxLat) / 2
  const paddingLng = radiusMeters / Math.max(20_000, 111_320 * Math.cos(referenceLat * Math.PI / 180))
  const minLng = Math.min(...path.map((point) => point[0])) - paddingLng
  const maxLng = Math.max(...path.map((point) => point[0])) + paddingLng
  const segments = path.slice(1).map((point, index) => [path[index], point] as const)
  return cameras.filter((camera) => {
    if (camera.lat < minLat || camera.lat > maxLat || camera.lng < minLng || camera.lng > maxLng) return false
    return segments.some(([start, end]) => distanceToRouteSegmentMeters(camera, start, end) <= radiusMeters)
  })
}

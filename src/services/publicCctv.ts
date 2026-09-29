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

function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const radians = Math.PI / 180
  const latitude = (b.lat - a.lat) * radians
  const longitude = (b.lng - a.lng) * radians
  const arc = Math.sin(latitude / 2) ** 2 + Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin(longitude / 2) ** 2
  return 6371000 * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc))
}

export function getNearbyPublicCameras(cameras: PublicCamera[], center: { lat: number; lng: number }, radiusMeters = 5000, limit = 40) {
  return cameras
    .map(camera => ({ camera, distance: distanceMeters(center, camera) }))
    .filter(item => item.distance <= radiusMeters)
    .sort((first, second) => first.distance - second.distance)
    .slice(0, limit)
}

/** 같은 거리 사진 위치를 다시 누르면 앞서 찾은 사진 번호를 재사용해 기다리는 시간을 줄인다. */
import type { KakaoMapsApi, KakaoLatLng } from './kakaoMaps'

const cache = new Map<string, { id: number | null; expires: number }>()
const pending = new Map<string, Promise<number | null>>()

export function findRoadviewPanorama(api: KakaoMapsApi, position: KakaoLatLng, radius: number): Promise<number | null> {
  const key = `${position.getLat().toFixed(5)}:${position.getLng().toFixed(5)}:${radius}`
  const saved = cache.get(key)
  if (saved && saved.expires > Date.now()) return Promise.resolve(saved.id)
  const existing = pending.get(key)
  if (existing) return existing
  const request = new Promise<number | null>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('Panorama lookup timed out')), 6500)
    try {
      new api.RoadviewClient().getNearestPanoId(position, radius, id => {
        window.clearTimeout(timeout)
        cache.set(key, { id, expires: Date.now() + 120_000 })
        resolve(id)
      })
    } catch (error) { window.clearTimeout(timeout); reject(error) }
  }).finally(() => pending.delete(key))
  pending.set(key, request)
  return request
}

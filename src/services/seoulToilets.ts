/**
 * 경로 전체를 둘러싼 사각 범위에 여유 폭을 더해 서버의 화장실 목록을 조회한다. 응답을 지도에서 사용하는 편의시설 배열로 반환한다.
 */
import type { LonLat } from './bikeRoute'
import type { RouteAmenity } from './routeConditions'

type SeoulToilet = RouteAmenity & { address: string; hours: string }

/** 경로의 경계 사각형 안에 있는 화장실 목록을 서버에 요청한다. */
export async function fetchSeoulToiletsAlongRoute(path: LonLat[], signal: AbortSignal): Promise<SeoulToilet[]> {
  if (path.length < 2) return []
  const longitudes = path.map(point => point[0])
  const latitudes = path.map(point => point[1])
  const padding = 0.004
  const query = new URLSearchParams({
    west: String(Math.min(...longitudes) - padding),
    south: String(Math.min(...latitudes) - padding),
    east: String(Math.max(...longitudes) + padding),
    north: String(Math.max(...latitudes) + padding),
  })
  const response = await fetch(`/api/seoul-toilets?${query}`, { signal })
  if (!response.ok) throw new Error(`toilet lookup failed (${response.status})`)
  const payload = await response.json() as { places?: SeoulToilet[] }
  return Array.isArray(payload.places) ? payload.places : []
}

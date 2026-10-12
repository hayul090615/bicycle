/**
 * 전체 길 중 몇 퍼센트를 이동했는지 보고 그 위치를 계산한다. 지나온 길을 표시할 좌표도 돌려준다.
 */
import type { GeoPoint } from '../types/game'

const segmentLength = (start: GeoPoint, end: GeoPoint) =>
  Math.hypot(end.lat - start.lat, (end.lng - start.lng) * Math.cos((start.lat * Math.PI) / 180))

/** 실제 경로의 진행률에 해당하는 위도·경도를 구한다. */
export function getGeoPosition(points: GeoPoint[], progress: number): GeoPoint {
  if (points.length === 0) return { lat: 37.61, lng: 126.92 }
  if (points.length === 1) return points[0]
  const lengths = points.slice(1).map((point, index) => segmentLength(points[index], point))
  let remaining = lengths.reduce((sum, length) => sum + length, 0) * Math.max(0, Math.min(1, progress))
  for (let index = 0; index < lengths.length; index += 1) {
    if (remaining <= lengths[index] || index === lengths.length - 1) {
      const ratio = lengths[index] === 0 ? 0 : Math.min(1, remaining / lengths[index])
      return {
        lat: points[index].lat + (points[index + 1].lat - points[index].lat) * ratio,
        lng: points[index].lng + (points[index + 1].lng - points[index].lng) * ratio,
      }
    }
    remaining -= lengths[index]
  }
  return points.at(-1)!
}

/** 실제 경로의 시작부터 현재 진행 위치까지 지난 부분을 반환한다. */
export function getGeoRouteSlice(points: GeoPoint[], progress: number): GeoPoint[] {
  if (points.length < 2 || progress <= 0) return [points[0]]
  const position = getGeoPosition(points, progress)
  const lengths = points.slice(1).map((point, index) => segmentLength(points[index], point))
  const target = lengths.reduce((sum, length) => sum + length, 0) * Math.min(1, progress)
  let covered = 0
  const result = [points[0]]
  for (let index = 0; index < lengths.length; index += 1) {
    if (covered + lengths[index] >= target) break
    result.push(points[index + 1])
    covered += lengths[index]
  }
  result.push(position)
  return result
}

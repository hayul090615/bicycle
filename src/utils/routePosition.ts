/**
 * 게임용 화면 경로에서 자전거의 진행 좌표와 좌우 방향을 계산한다. 실제 GPS 경로가 아니라 RoutePoint의 화면 좌표를 사용한다.
 */
import type { RoutePoint, Station } from '../types/game'

/** 게임 정류 지점 사이의 화면 이동 경로를 반환한다. */
export function getSegmentPoints(start: Station, end: Station): RoutePoint[] {
  return [{ x: start.x, y: start.y }, ...(start.routeToNext ?? []), { x: end.x, y: end.y }]
}

/** 게임 화면 경로에서 진행률에 해당하는 자전거 좌표를 두 점 사이의 위치를 계산한다. */
export function getPositionOnRoute(points: RoutePoint[], progress: number): RoutePoint {
  if (points.length === 0) return { x: 0, y: 0 }
  if (points.length === 1) return points[0]
  const lengths = points.slice(1).map((point, index) => Math.hypot(point.x - points[index].x, point.y - points[index].y))
  const totalLength = lengths.reduce((sum, length) => sum + length, 0)
  let remaining = Math.max(0, Math.min(1, progress)) * totalLength
  for (let index = 0; index < lengths.length; index += 1) {
    if (remaining <= lengths[index] || index === lengths.length - 1) {
      const ratio = lengths[index] === 0 ? 0 : remaining / lengths[index]
      return {
        x: points[index].x + (points[index + 1].x - points[index].x) * ratio,
        y: points[index].y + (points[index + 1].y - points[index].y) * ratio,
      }
    }
    remaining -= lengths[index]
  }
  return points[points.length - 1]
}

/** 진행 구간의 화면 좌표를 비교해 자전거의 좌우 방향을 구한다. */
export function getDirectionAtProgress(points: RoutePoint[], progress: number): 1 | -1 {
  const before = getPositionOnRoute(points, Math.max(0, progress - 0.01))
  const after = getPositionOnRoute(points, Math.min(1, progress + 0.01))
  return after.x >= before.x ? 1 : -1
}

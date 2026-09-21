import type { RoutePoint, Station } from '../types/game'

export function getSegmentPoints(start: Station, end: Station): RoutePoint[] {
  return [{ x: start.x, y: start.y }, ...(start.routeToNext ?? []), { x: end.x, y: end.y }]
}

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

export function getDirectionAtProgress(points: RoutePoint[], progress: number): 1 | -1 {
  const before = getPositionOnRoute(points, Math.max(0, progress - 0.01))
  const after = getPositionOnRoute(points, Math.min(1, progress + 0.01))
  return after.x >= before.x ? 1 : -1
}

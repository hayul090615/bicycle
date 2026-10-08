import type { LonLat } from '../services/bikeRoute'

export type RouteDirectionPoint = { point: LonLat; bearing: number }

const radians = Math.PI / 180

function segmentDistanceMeters(from: LonLat, to: LonLat) {
  const latitude = (to[1] - from[1]) * radians
  const longitude = (to[0] - from[0]) * radians
  const arc = Math.sin(latitude / 2) ** 2 + Math.cos(from[1] * radians) * Math.cos(to[1] * radians) * Math.sin(longitude / 2) ** 2
  return 12742000 * Math.asin(Math.min(1, Math.sqrt(arc)))
}

function segmentBearing(from: LonLat, to: LonLat) {
  const latitude1 = from[1] * radians
  const latitude2 = to[1] * radians
  const longitudeDelta = (to[0] - from[0]) * radians
  const y = Math.sin(longitudeDelta) * Math.cos(latitude2)
  const x = Math.cos(latitude1) * Math.sin(latitude2) - Math.sin(latitude1) * Math.cos(latitude2) * Math.cos(longitudeDelta)
  return (Math.atan2(y, x) / radians + 360) % 360
}

export function routeDirectionPoints(points: LonLat[] | null | undefined, spacingMeters = 140): RouteDirectionPoint[] {
  if (!points || points.length < 2) return []
  const segments = points.slice(1).map((point, index) => ({
    from: points[index],
    to: point,
    length: segmentDistanceMeters(points[index], point),
    bearing: segmentBearing(points[index], point),
  })).filter(segment => segment.length > 0)
  const totalDistance = segments.reduce((total, segment) => total + segment.length, 0)
  if (totalDistance < 35) return []
  const spacing = Math.max(70, spacingMeters)
  const arrows: RouteDirectionPoint[] = []
  let segmentStart = 0
  let nextArrowAt = Math.min(spacing / 2, totalDistance / 2)
  for (const segment of segments) {
    const segmentEnd = segmentStart + segment.length
    while (nextArrowAt < segmentEnd - 18) {
      if (nextArrowAt >= segmentStart + 12) {
        const fraction = (nextArrowAt - segmentStart) / segment.length
        arrows.push({
          point: [segment.from[0] + (segment.to[0] - segment.from[0]) * fraction, segment.from[1] + (segment.to[1] - segment.from[1]) * fraction],
          bearing: segment.bearing,
        })
      }
      nextArrowAt += spacing
    }
    segmentStart = segmentEnd
  }
  return arrows
}

/**
 * 로드뷰 촬영 위치에서 가장 가까운 길을 찾는다. 앞으로 보일 파란 길의 양쪽 점과 도착지까지 남은 거리를 계산한다.
 */
import type { LonLat } from '../services/bikeRoute'

type Point = { lat: number; lng: number }
export type RibbonSection = { center: LonLat; left: LonLat; right: LonLat; progressMeters: number }

const LATITUDE_METERS = 111_320

/** 촬영 위치의 가장 가까운 경로 투영점부터 앞쪽 파란 선 앵커를 구성한다. */
export function roadviewRouteSections(path: LonLat[], camera: Point, minimumProgress = 0) {
  if (path.length < 2 || !Number.isFinite(camera.lat) || !Number.isFinite(camera.lng)
    || path.some(point => !Number.isFinite(point[0]) || !Number.isFinite(point[1]))) {
    return { sections: [] as RibbonSection[], closestDistance: Infinity, nearestPoint: null as LonLat | null, remainingMeters: Infinity }
  }
  const xScale = LATITUDE_METERS * Math.cos(camera.lat * Math.PI / 180)
  let closestDistance = Infinity
  let closestIndex = 0
  let fraction = 0
  let cumulative = 0
  let closestProgress = 0
  for (let index = 1; index < path.length; index++) {
    const start = path[index - 1], end = path[index]
    const ax = (start[0] - camera.lng) * xScale, ay = (start[1] - camera.lat) * LATITUDE_METERS
    const dx = (end[0] - start[0]) * xScale, dy = (end[1] - start[1]) * LATITUDE_METERS
    const length = Math.hypot(dx, dy)
    if (cumulative + length < minimumProgress) { cumulative += length; continue }
    const minimumFraction = Math.max(0, Math.min(1, (minimumProgress - cumulative) / Math.max(.001, length)))
    const projected = Math.max(minimumFraction, Math.min(1, -(ax * dx + ay * dy) / Math.max(.001, dx * dx + dy * dy)))
    const gap = Math.hypot(ax + dx * projected, ay + dy * projected)
    if (gap < closestDistance) { closestDistance = gap; closestIndex = index; fraction = projected; closestProgress = cumulative + length * projected }
    cumulative += length
  }
  if (closestIndex === 0) return { sections: [] as RibbonSection[], closestDistance, nearestPoint: null as LonLat | null, remainingMeters: Infinity }
  const start = path[closestIndex - 1], end = path[closestIndex]
  const nearestPoint: LonLat = [start[0] + (end[0] - start[0]) * fraction, start[1] + (end[1] - start[1]) * fraction]
  const centers: LonLat[] = [nearestPoint]
  const centerProgress = [closestProgress]
  let traversed = 0
  let previous = nearestPoint
  // Only the next street section is drawn; the complete route stays on the map.
  for (let index = closestIndex; index < path.length && traversed < 180; index++) {
    const next = path[index]
    const length = Math.hypot((next[0] - previous[0]) * xScale, (next[1] - previous[1]) * LATITUDE_METERS)
    const steps = Math.max(1, Math.ceil(Math.min(length, 180 - traversed) / 4))
    if (length > .01) {
      const portion = Math.min(1, (180 - traversed) / length)
      for (let step = 1; step <= steps; step++) {
        centers.push([
          previous[0] + (next[0] - previous[0]) * portion * step / steps,
          previous[1] + (next[1] - previous[1]) * portion * step / steps,
        ])
        centerProgress.push(closestProgress + traversed + length * portion * step / steps)
      }
    }
    traversed += length
    previous = next
  }
  const sampleIndexes = centers.length > 64
    ? Array.from({ length: 64 }, (_, index) => Math.round(index * (centers.length - 1) / 63))
    : centers.map((_, index) => index)
  const sections = sampleIndexes.map((centerIndex, index): RibbonSection => {
    const center = centers[centerIndex]
    const before = centers[sampleIndexes[Math.max(0, index - 1)]], after = centers[sampleIndexes[Math.min(sampleIndexes.length - 1, index + 1)]]
    const dx = (after[0] - before[0]) * xScale, dy = (after[1] - before[1]) * LATITUDE_METERS
    const length = Math.max(.01, Math.hypot(dx, dy))
    const perpendicularLng = -dy / length * .4 / xScale
    const perpendicularLat = dx / length * .4 / LATITUDE_METERS
    return { center, left: [center[0] + perpendicularLng, center[1] + perpendicularLat], right: [center[0] - perpendicularLng, center[1] - perpendicularLat], progressMeters: centerProgress[centerIndex] }
  })
  return { sections, closestDistance, nearestPoint, remainingMeters: Math.max(0, cumulative - closestProgress) }
}

/** 촬영 좌표에서 다음 경로 지점을 향하는 로드뷰 방위를 구한다. */
export function bearingToRoadviewPoint(camera: Point, target: LonLat) {
  const dx = (target[0] - camera.lng) * Math.cos(camera.lat * Math.PI / 180)
  const dy = target[1] - camera.lat
  return (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360
}

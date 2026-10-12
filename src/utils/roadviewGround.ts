import type { LonLat } from '../services/bikeRoute'
import type { RouteElevationPoint } from '../services/routeConditions'
import { bearingToRoadviewPoint, type RibbonSection } from './roadviewRoute'

const METERS_PER_LATITUDE = 111_320
// Kakao's overlay model assumes an eye height of 1.7 m. Vehicle panoramas
// need a lower surface; 3 m is a conservative camera-height approximation,
// not measured depth from the photograph.
// https://apis.map.kakao.com/web/documentation/#CustomOverlay_setAltitude
const SURFACE_ALTITUDE = 1.7 - 3

export function roadviewGroundAltitude(path: LonLat[] | null, profile: RouteElevationPoint[], camera: { lat: number; lng: number }) {
  const samples = profile.filter(point => Number.isFinite(point.distanceMeters) && Number.isFinite(point.elevationMeters))
    .sort((first, second) => first.distanceMeters - second.distanceMeters)
  const xScale = METERS_PER_LATITUDE * Math.cos(camera.lat * Math.PI / 180)
  const segments = (path ?? []).slice(1).map((end, index) => {
    const start = path![index]
    const dx = (end[0] - start[0]) * xScale, dy = (end[1] - start[1]) * METERS_PER_LATITUDE
    return { start, dx, dy, length: Math.hypot(dx, dy) }
  }).filter(segment => Number.isFinite(segment.length) && segment.length > .01)
  const routeLength = segments.reduce((total, segment) => total + segment.length, 0)
  const elevationAt = (point: LonLat): number | null => {
    if (!segments.length || samples.length < 2 || !routeLength) return null
    let cumulative = 0, closest = Infinity, progress = 0
    for (const segment of segments) {
      const ax = (segment.start[0] - point[0]) * xScale, ay = (segment.start[1] - point[1]) * METERS_PER_LATITUDE
      const fraction = Math.max(0, Math.min(1, -(ax * segment.dx + ay * segment.dy) / segment.length ** 2))
      const distance = Math.hypot(ax + segment.dx * fraction, ay + segment.dy * fraction)
      if (distance < closest) { closest = distance; progress = cumulative + segment.length * fraction }
      cumulative += segment.length
    }
    // The cycling elevation profile does not cover a separate walk to a bike.
    if (closest > 15) return null
    const distance = progress / routeLength * samples.at(-1)!.distanceMeters
    const nextIndex = samples.findIndex(sample => sample.distanceMeters >= distance)
    if (nextIndex <= 0) return samples[nextIndex < 0 ? samples.length - 1 : 0].elevationMeters
    const before = samples[nextIndex - 1], after = samples[nextIndex]
    const fraction = (distance - before.distanceMeters) / Math.max(.001, after.distanceMeters - before.distanceMeters)
    return before.elevationMeters + (after.elevationMeters - before.elevationMeters) * fraction
  }
  const cameraElevation = elevationAt([camera.lng, camera.lat])
  return (point: LonLat) => {
    const elevation = elevationAt(point)
    if (cameraElevation === null || elevation === null) return SURFACE_ALTITUDE
    const distance = Math.hypot((point[0] - camera.lng) * xScale, (point[1] - camera.lat) * METERS_PER_LATITUDE)
    // Coarse terrain samples are not photo depth. Bound local grade so a noisy
    // sample cannot project the guidance into the sky or below the street.
    const limit = distance * .1
    return SURFACE_ALTITUDE + Math.max(-limit, Math.min(limit, elevation - cameraElevation))
  }
}

export function visibleRoadviewGroundSections(sections: RibbonSection[]) {
  const initial = sections.find(section => section.progressMeters >= (sections[0]?.progressMeters ?? 0) + 6) ?? sections.at(-1)
  if (!initial || sections.length < 2) return []
  const start = sections[0].center
  const bearing = bearingToRoadviewPoint({ lat: start[1], lng: start[0] }, initial.center)
  const result: RibbonSection[] = []
  for (const section of sections) {
    if (section.progressMeters - sections[0].progressMeters > 40) break
    if (result.length > 2) {
      const previous = result.at(-1)!.center
      const nextBearing = bearingToRoadviewPoint({ lat: previous[1], lng: previous[0] }, section.center)
      const turn = Math.abs((nextBearing - bearing + 540) % 360 - 180)
      // Photo overlays have no occlusion depth: don't paint through a corner.
      if (turn > 40) break
    }
    result.push(section)
  }
  return result
}

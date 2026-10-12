/**
 * 자치구 경계에서 공유 변을 제거해 서울 외곽선을 구한다. 서울 밖 흐림 마스크, 도착지 범위 판정과 대여소를 포함한 지도 표시 한계를 제공한다.
 */
import districtData from './seoulDistricts.geojson?raw'
import { allBikeStations } from './districtCourses'

type Position = [number, number]
type DistrictFeature = {
  geometry: {
    type: 'Polygon' | 'MultiPolygon'
    coordinates: number[][][] | number[][][][]
  }
}

const districts = JSON.parse(districtData) as { features: DistrictFeature[] }

// The source contains one polygon per district. Cancel shared district edges to
// recover Seoul's exact outer boundary without duplicating a second data file.
const edgeCounts = new Map<string, { start: Position; end: Position; count: number }>()
for (const feature of districts.features) {
  const polygons = feature.geometry.type === 'Polygon'
    ? [feature.geometry.coordinates as number[][][]]
    : feature.geometry.coordinates as number[][][][]
  for (const polygon of polygons) {
    const ring = polygon[0]
    for (let index = 1; index < ring.length; index++) {
      const start = ring[index - 1] as Position
      const end = ring[index] as Position
      const startKey = `${start[0]},${start[1]}`
      const endKey = `${end[0]},${end[1]}`
      const key = startKey < endKey ? `${startKey}|${endKey}` : `${endKey}|${startKey}`
      const edge = edgeCounts.get(key)
      if (edge) edge.count++
      else edgeCounts.set(key, { start, end, count: 1 })
    }
  }
}

const boundaryEdges = [...edgeCounts.values()].filter(edge => edge.count === 1)
const outgoing = new Map<string, typeof boundaryEdges>()
for (const edge of boundaryEdges) {
  const key = `${edge.start[0]},${edge.start[1]}`
  const edges = outgoing.get(key) ?? []
  edges.push(edge)
  outgoing.set(key, edges)
}

const boundaryRings: Position[][] = []
const unusedEdges = new Set(boundaryEdges)
while (unusedEdges.size) {
  const first = unusedEdges.values().next().value as (typeof boundaryEdges)[number]
  const ring: Position[] = [first.start]
  let edge = first
  while (true) {
    unusedEdges.delete(edge)
    ring.push(edge.end)
    if (edge.end[0] === first.start[0] && edge.end[1] === first.start[1]) break
    const next = outgoing.get(`${edge.end[0]},${edge.end[1]}`)?.find(candidate => unusedEdges.has(candidate))
    if (!next) break
    edge = next
  }
  if (ring.length >= 4 && ring[0][0] === ring.at(-1)?.[0] && ring[0][1] === ring.at(-1)?.[1]) boundaryRings.push(ring)
}

/** 경계 링의 방향과 크기를 비교할 부호 있는 면적을 계산한다. */
function area(ring: Position[]) {
  return ring.slice(1).reduce((sum, point, index) => sum + ring[index][0] * point[1] - point[0] * ring[index][1], 0)
}

export const SEOUL_BOUNDARY: Position[] = boundaryRings.sort((first, second) => Math.abs(area(second)) - Math.abs(area(first)))[0] ?? []

const MAP_AREA_PADDING = 0.008
const bikeMapPositions = [
  ...SEOUL_BOUNDARY,
  ...allBikeStations
    .filter(station => Number.isFinite(station.lat) && Number.isFinite(station.lng))
    .map(station => [station.lng, station.lat] as Position),
]
const bikeMapLongitudes = bikeMapPositions.map(([lng]) => lng)
const bikeMapLatitudes = bikeMapPositions.map(([, lat]) => lat)
const mapWest = Math.min(...bikeMapLongitudes) - MAP_AREA_PADDING
const mapEast = Math.max(...bikeMapLongitudes) + MAP_AREA_PADDING
const mapSouth = Math.min(...bikeMapLatitudes) - MAP_AREA_PADDING
const mapNorth = Math.max(...bikeMapLatitudes) + MAP_AREA_PADDING

// Map bounds include every known Ttareungi station, including stations just
// outside Seoul's administrative boundary. The black boundary remains exact.
export const SEOUL_BIKE_MAP_BOUNDS_LATLNG: [[number, number], [number, number]] = [
  [mapSouth, mapWest],
  [mapNorth, mapEast],
]
export const SEOUL_BIKE_MAP_BOUNDS_LONLAT: [[number, number], [number, number]] = [
  [mapWest, mapSouth],
  [mapEast, mapNorth],
]

/** 좌표들을 둘러싸는 볼록 다각형 외곽을 구한다. */
function convexHull(points: Position[]): Position[] {
  const sorted = [...new Map(points.map(point => [`${point[0]},${point[1]}`, point])).values()]
    .sort(([firstLng, firstLat], [secondLng, secondLat]) => firstLng - secondLng || firstLat - secondLat)
  if (sorted.length <= 2) return sorted
  const cross = (origin: Position, first: Position, second: Position) =>
    (first[0] - origin[0]) * (second[1] - origin[1]) - (first[1] - origin[1]) * (second[0] - origin[0])
  const lower: Position[] = []
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop()
    lower.push(point)
  }
  const upper: Position[] = []
  for (const point of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop()
    upper.push(point)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

const serviceAreaHull = convexHull(bikeMapPositions)
const serviceAreaCenter: Position = [
  serviceAreaHull.reduce((sum, [lng]) => sum + lng, 0) / serviceAreaHull.length,
  serviceAreaHull.reduce((sum, [, lat]) => sum + lat, 0) / serviceAreaHull.length,
]
const serviceAreaRing = serviceAreaHull.map(([lng, lat]) => {
  const deltaLng = lng - serviceAreaCenter[0]
  const deltaLat = lat - serviceAreaCenter[1]
  const distance = Math.hypot(deltaLng, deltaLat) || 1
  return [lng + deltaLng / distance * MAP_AREA_PADDING, lat + deltaLat / distance * MAP_AREA_PADDING] as Position
})

const maskShell: Position[] = [
  [126, 37], [128, 37], [128, 38], [126, 38], [126, 37],
]

// Leave the map clear around the full bike station area while retaining the
// true administrative outline as a separate overlay.
const serviceAreaHole = [...serviceAreaRing].reverse()
serviceAreaHole.push(serviceAreaHole[0])

export const SEOUL_OUTSIDE_MASK: GeoJSON.Feature<GeoJSON.Polygon> = {
  type: 'Feature',
  properties: {},
  geometry: { type: 'Polygon', coordinates: [maskShell, serviceAreaHole] },
}

/** 좌표가 실제 서울 행정 경계 안이나 경계선 위에 있는지 판정한다. */
export function isInsideSeoul(lat: number, lng: number) {
  const x = lng
  const y = lat
  let inside = false
  for (let index = 0, previous = SEOUL_BOUNDARY.length - 1; index < SEOUL_BOUNDARY.length; previous = index++) {
    const [x1, y1] = SEOUL_BOUNDARY[index]
    const [x2, y2] = SEOUL_BOUNDARY[previous]
    const cross = (x - x1) * (y2 - y1) - (y - y1) * (x2 - x1)
    const onSegment = Math.abs(cross) < 1e-10
      && x >= Math.min(x1, x2) - 1e-10 && x <= Math.max(x1, x2) + 1e-10
      && y >= Math.min(y1, y2) - 1e-10 && y <= Math.max(y1, y2) + 1e-10
    if (onSegment) return true
    if ((y1 > y) !== (y2 > y) && x < (x2 - x1) * (y - y1) / (y2 - y1) + x1) inside = !inside
  }
  return inside
}

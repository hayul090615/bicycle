/**
 * 서울 외곽 대여소까지 포함하는 보라색 테두리와 지도를 움직일 수 있는 범위를 정한다.
 */
import { SEOUL_BIKE_SERVICE_BOUNDARY } from './seoulBikeServiceBoundary'
import { allBikeStations } from './districtCourses'

type Position = [number, number]
// 서울의 모양에서 경계 밖 대여소 주변만 확장한 테두리다. 행정 경계와는 다르다.
export const SEOUL_BOUNDARY: Position[] = SEOUL_BIKE_SERVICE_BOUNDARY
export const SEOUL_BOUNDARY_COLOR = '#9b5de5'
export const SEOUL_BOUNDARY_WIDTH = 4
export const SEOUL_AREA_COLOR = '#28ad7e'
export const SEOUL_AREA_OPACITY = 0
// 서울 안쪽은 투명하게 두어 지도 색과 지명을 그대로 보여 준다.
export const SEOUL_AREA: GeoJSON.Feature<GeoJSON.Polygon> = {
  type: 'Feature',
  properties: {},
  geometry: { type: 'Polygon', coordinates: [SEOUL_BOUNDARY] },
}
export const SEOUL_OUTSIDE_DIM_COLOR = '#f4f5f0'
export const SEOUL_OUTSIDE_DIM_OPACITY = 0.45
// 바깥 사각형에서 테두리 안을 구멍으로 뺀다. 서울 안에는 덮개를 그리지 않는다.
export const SEOUL_OUTSIDE_MASK: GeoJSON.Feature<GeoJSON.Polygon> = {
  type: 'Feature',
  properties: {},
  geometry: {
    type: 'Polygon',
    coordinates: [
      [[124, 35], [130, 35], [130, 40], [124, 40], [124, 35]],
      [...SEOUL_BOUNDARY].reverse(),
    ],
  },
}

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

// 지도 이동 범위에는 테두리와 모든 대여소를 포함한다.
export const SEOUL_BIKE_MAP_BOUNDS_LATLNG: [[number, number], [number, number]] = [
  [mapSouth, mapWest],
  [mapNorth, mapEast],
]
export const SEOUL_BIKE_MAP_BOUNDS_LONLAT: [[number, number], [number, number]] = [
  [mapWest, mapSouth],
  [mapEast, mapNorth],
]

/** 누른 위치가 대여소까지 확장한 테두리 안인지 확인한다. 선 위의 점도 선택할 수 있다. */
export function isInsideSeoul(lat: number, lng: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false
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
    // 점에서 오른쪽으로 그은 선이 테두리를 홀수 번 만나면 안쪽, 짝수 번 만나면 바깥이다.
    if ((y1 > y) !== (y2 > y) && x < (x2 - x1) * (y - y1) / (y2 - y1) + x1) inside = !inside
  }
  return inside
}

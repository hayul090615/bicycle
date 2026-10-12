/**
 * 서울 구 경계의 위도·경도를 SVG 화면 좌표로 투영한다. 전체 경계가 정해진 viewBox 안에 들어오도록 비율을 맞추고 경로 문자열과 구 이름 위치를 구한다.
 */
import { getFeatureCoordinates, getFeatureRings, seoulDistrictGeoData, type Coordinate, type DistrictGeoFeature } from '../data/districtGeoData'

const WIDTH = 620
const HEIGHT = 500
const PADDING = 18
const allCoordinates = seoulDistrictGeoData.features.flatMap(getFeatureCoordinates)
const longitudes = allCoordinates.map(([lng]) => lng)
const latitudes = allCoordinates.map(([, lat]) => lat)
const minLng = Math.min(...longitudes)
const maxLng = Math.max(...longitudes)
const minLat = Math.min(...latitudes)
const maxLat = Math.max(...latitudes)

export const SEOUL_MAP_VIEWBOX = `0 0 ${WIDTH} ${HEIGHT}`

/** 지리 좌표를 서울 SVG 지도의 픽셀 좌표로 바꾼다. */
export function projectCoordinate([lng, lat]: Coordinate): Coordinate {
  const x = PADDING + ((lng - minLng) / (maxLng - minLng)) * (WIDTH - PADDING * 2)
  const y = PADDING + ((maxLat - lat) / (maxLat - minLat)) * (HEIGHT - PADDING * 2)
  return [x, y]
}

/** 구 경계 링을 SVG path의 이동·선 그리기 명령으로 변환한다. */
export function featureToSvgPath(feature: DistrictGeoFeature) {
  return getFeatureRings(feature).map((ring) => ring.map((coordinate, index) => {
    const [x, y] = projectCoordinate(coordinate)
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ') + ' Z').join(' ')
}

/** 구 이름을 배치할 대표 지점을 SVG 좌표로 변환한다. */
export function getFeatureLabelPoint(feature: DistrictGeoFeature): Coordinate {
  const outerRing = getFeatureRings(feature).sort((a, b) => b.length - a.length)[0]
  const projected = outerRing.map(projectCoordinate)
  const sum = projected.reduce(([sumX, sumY], [x, y]) => [sumX + x, sumY + y], [0, 0])
  return [sum[0] / projected.length, sum[1] / projected.length]
}

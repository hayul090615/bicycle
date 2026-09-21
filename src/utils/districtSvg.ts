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

export function projectCoordinate([lng, lat]: Coordinate): Coordinate {
  const x = PADDING + ((lng - minLng) / (maxLng - minLng)) * (WIDTH - PADDING * 2)
  const y = PADDING + ((maxLat - lat) / (maxLat - minLat)) * (HEIGHT - PADDING * 2)
  return [x, y]
}

export function featureToSvgPath(feature: DistrictGeoFeature) {
  return getFeatureRings(feature).map((ring) => ring.map((coordinate, index) => {
    const [x, y] = projectCoordinate(coordinate)
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ') + ' Z').join(' ')
}

export function getFeatureLabelPoint(feature: DistrictGeoFeature): Coordinate {
  const outerRing = getFeatureRings(feature).sort((a, b) => b.length - a.length)[0]
  const projected = outerRing.map(projectCoordinate)
  const sum = projected.reduce(([sumX, sumY], [x, y]) => [sumX + x, sumY + y], [0, 0])
  return [sum[0] / projected.length, sum[1] / projected.length]
}

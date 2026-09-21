import geoJsonText from './seoulDistricts.geojson?raw'
import type { SeoulDistrict } from './districtCourses'

export type Coordinate = [number, number]

export interface DistrictGeoFeature {
  type: 'Feature'
  properties: {
    code: string
    name: SeoulDistrict
    name_eng: string
    base_year: string
  }
  geometry: {
    type: 'Polygon' | 'MultiPolygon'
    coordinates: Coordinate[][] | Coordinate[][][]
  }
}

interface DistrictFeatureCollection {
  type: 'FeatureCollection'
  features: DistrictGeoFeature[]
}

export const seoulDistrictGeoData = JSON.parse(geoJsonText) as DistrictFeatureCollection

export const districtFeatureMap = Object.fromEntries(
  seoulDistrictGeoData.features.map((feature) => [feature.properties.name, feature]),
) as Record<SeoulDistrict, DistrictGeoFeature>

export function getFeatureRings(feature: DistrictGeoFeature): Coordinate[][] {
  return feature.geometry.type === 'Polygon'
    ? feature.geometry.coordinates as Coordinate[][]
    : (feature.geometry.coordinates as Coordinate[][][]).flat()
}

export function getFeatureCoordinates(feature: DistrictGeoFeature): Coordinate[] {
  return getFeatureRings(feature).flat()
}

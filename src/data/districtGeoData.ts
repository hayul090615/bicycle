/**
 * 서울 25개 구의 경계 자료를 구 이름으로 찾기 쉽게 정리한다. 좌표는 [경도, 위도] 순서이며 여러 구역도 배열로 함께 저장한다.
 */
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

/** Polygon 또는 MultiPolygon의 링을 같은 배열 형태로 반환한다. */
export function getFeatureRings(feature: DistrictGeoFeature): Coordinate[][] {
  return feature.geometry.type === 'Polygon'
    ? feature.geometry.coordinates as Coordinate[][]
    : (feature.geometry.coordinates as Coordinate[][][]).flat()
}

/** 구 경계의 모든 링 좌표를 하나의 배열로 펼친다. */
export function getFeatureCoordinates(feature: DistrictGeoFeature): Coordinate[] {
  return getFeatureRings(feature).flat()
}

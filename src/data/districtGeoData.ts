/**
 * 서울 구 경계 GeoJSON을 읽고 이름별 경계 조회표를 만든다. 좌표 배열은 [경도, 위도] 순서이며 Polygon과 MultiPolygon의 링을 공통 형식으로 제공한다.
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

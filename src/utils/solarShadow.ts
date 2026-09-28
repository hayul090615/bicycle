export type ShadowCoordinate = [longitude: number, latitude: number]

/** A map-ground projection for an illustrative 12 m object at a route stop. */
export function getShadowPolygon(
  latitude: number,
  longitude: number,
  elevation: number,
  shadowAzimuth: number,
  objectHeight = 12,
): ShadowCoordinate[] | null {
  if (elevation <= 0 || elevation >= 90) return null

  const length = Math.min(180, objectHeight / Math.tan(elevation * Math.PI / 180))
  if (!Number.isFinite(length) || length <= 0) return null

  const angle = shadowAzimuth * Math.PI / 180
  const directionEast = Math.sin(angle)
  const directionNorth = Math.cos(angle)
  const sideEast = directionNorth
  const sideNorth = -directionEast
  const longitudeMeters = 111_320 * Math.cos(latitude * Math.PI / 180)
  const point = (east: number, north: number): ShadowCoordinate => [
    longitude + east / longitudeMeters,
    latitude + north / 111_320,
  ]
  const baseHalfWidth = 5
  const tipHalfWidth = 0.8

  return [
    point(-sideEast * baseHalfWidth, -sideNorth * baseHalfWidth),
    point(sideEast * baseHalfWidth, sideNorth * baseHalfWidth),
    point(directionEast * length + sideEast * tipHalfWidth, directionNorth * length + sideNorth * tipHalfWidth),
    point(directionEast * length - sideEast * tipHalfWidth, directionNorth * length - sideNorth * tipHalfWidth),
    point(-sideEast * baseHalfWidth, -sideNorth * baseHalfWidth),
  ]
}

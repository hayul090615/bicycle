export type ShadowCoordinate = [longitude: number, latitude: number]

/** Return a nearby map point in the direction the shadow falls. */
export function getShadowDirectionPoint(
  latitude: number,
  longitude: number,
  shadowAzimuth: number,
  distanceMeters = 1_000,
): ShadowCoordinate {
  const angle = shadowAzimuth * Math.PI / 180
  const longitudeMeters = 111_320 * Math.max(0.01, Math.cos(latitude * Math.PI / 180))
  return [
    longitude + Math.sin(angle) * distanceMeters / longitudeMeters,
    latitude + Math.cos(angle) * distanceMeters / 111_320,
  ]
}

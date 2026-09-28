export type ShadowPosition = [longitude: number, latitude: number]

const METERS_PER_DEGREE = 111_320

/** Builds the ground footprint swept from a building toward its solar shadow. */
export function castBuildingShadow(
  footprint: readonly ShadowPosition[],
  heightMeters: number,
  sunElevation: number,
  shadowAzimuth: number,
): ShadowPosition[] | null {
  const points = footprint.filter(([longitude, latitude]) => Number.isFinite(longitude) && Number.isFinite(latitude))
  if (points.length > 1 && points[0][0] === points[points.length - 1][0] && points[0][1] === points[points.length - 1][1]) points.pop()
  if (points.length < 3 || heightMeters <= 0 || sunElevation <= 0) return null

  const averageLatitude = points.reduce((total, point) => total + point[1], 0) / points.length
  const metersPerLongitude = METERS_PER_DEGREE * Math.max(0.01, Math.cos(averageLatitude * Math.PI / 180))
  const shadowLength = Math.min(120, Math.max(1, heightMeters / Math.tan(sunElevation * Math.PI / 180)))
  const direction = shadowAzimuth * Math.PI / 180
  const offsetX = Math.sin(direction) * shadowLength
  const offsetY = Math.cos(direction) * shadowLength
  const groundPoints = points.flatMap(([longitude, latitude]) => {
    const x = longitude * metersPerLongitude
    const y = latitude * METERS_PER_DEGREE
    return [[x, y], [x + offsetX, y + offsetY]] as [number, number][]
  })
  const hull = convexHull(groundPoints)
  if (hull.length < 3) return null

  const ring = hull.map(([x, y]) => [x / metersPerLongitude, y / METERS_PER_DEGREE] as ShadowPosition)
  ring.push(ring[0])
  return ring
}

function convexHull(points: [number, number][]): [number, number][] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cross = (origin: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - origin[0]) * (b[1] - origin[1]) - (a[1] - origin[1]) * (b[0] - origin[0])
  const lower: [number, number][] = []
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop()
    lower.push(point)
  }
  const upper: [number, number][] = []
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const point = sorted[index]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop()
    upper.push(point)
  }
  lower.pop()
  upper.pop()
  return lower.concat(upper)
}

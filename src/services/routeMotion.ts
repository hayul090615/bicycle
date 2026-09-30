import type { LonLat } from './bikeRoute'

export type RouteMotion = {
  lengthMeters: number
  pointAt: (progress: number) => { point: LonLat; bearing: number }
}

/** Build a distance-based path sampler so animated riders keep an even speed through turns. */
export function createRouteMotion(path: LonLat[]): RouteMotion | null {
  if (path.length < 2) return null
  const lengths: number[] = []
  const starts: number[] = []
  let lengthMeters = 0
  for (let index = 1; index < path.length; index++) {
    const [fromLng, fromLat] = path[index - 1]
    const [toLng, toLat] = path[index]
    const latitude = (fromLat + toLat) / 2 * Math.PI / 180
    const length = Math.hypot((toLng - fromLng) * 111_000 * Math.cos(latitude), (toLat - fromLat) * 111_000)
    starts.push(lengthMeters)
    lengths.push(length)
    lengthMeters += length
  }
  if (lengthMeters <= 0) return null

  return {
    lengthMeters,
    pointAt(progress) {
      const target = ((progress % 1) + 1) % 1 * lengthMeters
      let segment = lengths.length - 1
      for (let index = 0; index < lengths.length; index++) {
        if (target <= starts[index] + lengths[index]) { segment = index; break }
      }
      const [fromLng, fromLat] = path[segment]
      const [toLng, toLat] = path[segment + 1]
      const length = Math.max(.001, lengths[segment])
      const ratio = Math.max(0, Math.min(1, (target - starts[segment]) / length))
      const latitude = (fromLat + toLat) / 2 * Math.PI / 180
      const east = (toLng - fromLng) * Math.cos(latitude)
      const north = toLat - fromLat
      return {
        point: [fromLng + (toLng - fromLng) * ratio, fromLat + north * ratio],
        bearing: (Math.atan2(east, north) * 180 / Math.PI + 360) % 360,
      }
    },
  }
}

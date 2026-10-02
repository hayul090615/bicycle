import districtData from './seoulDistricts.geojson?raw'

type Position = [number, number]
type DistrictFeature = {
  geometry: {
    type: 'Polygon' | 'MultiPolygon'
    coordinates: number[][][] | number[][][][]
  }
}

const districts = JSON.parse(districtData) as { features: DistrictFeature[] }

// The source contains one polygon per district. Cancel shared district edges to
// recover Seoul's exact outer boundary without duplicating a second data file.
const edgeCounts = new Map<string, { start: Position; end: Position; count: number }>()
for (const feature of districts.features) {
  const polygons = feature.geometry.type === 'Polygon'
    ? [feature.geometry.coordinates as number[][][]]
    : feature.geometry.coordinates as number[][][][]
  for (const polygon of polygons) {
    const ring = polygon[0]
    for (let index = 1; index < ring.length; index++) {
      const start = ring[index - 1] as Position
      const end = ring[index] as Position
      const startKey = `${start[0]},${start[1]}`
      const endKey = `${end[0]},${end[1]}`
      const key = startKey < endKey ? `${startKey}|${endKey}` : `${endKey}|${startKey}`
      const edge = edgeCounts.get(key)
      if (edge) edge.count++
      else edgeCounts.set(key, { start, end, count: 1 })
    }
  }
}

const boundaryEdges = [...edgeCounts.values()].filter(edge => edge.count === 1)
const outgoing = new Map<string, typeof boundaryEdges>()
for (const edge of boundaryEdges) {
  const key = `${edge.start[0]},${edge.start[1]}`
  const edges = outgoing.get(key) ?? []
  edges.push(edge)
  outgoing.set(key, edges)
}

const boundaryRings: Position[][] = []
const unusedEdges = new Set(boundaryEdges)
while (unusedEdges.size) {
  const first = unusedEdges.values().next().value as (typeof boundaryEdges)[number]
  const ring: Position[] = [first.start]
  let edge = first
  while (true) {
    unusedEdges.delete(edge)
    ring.push(edge.end)
    if (edge.end[0] === first.start[0] && edge.end[1] === first.start[1]) break
    const next = outgoing.get(`${edge.end[0]},${edge.end[1]}`)?.find(candidate => unusedEdges.has(candidate))
    if (!next) break
    edge = next
  }
  if (ring.length >= 4 && ring[0][0] === ring.at(-1)?.[0] && ring[0][1] === ring.at(-1)?.[1]) boundaryRings.push(ring)
}

function area(ring: Position[]) {
  return ring.slice(1).reduce((sum, point, index) => sum + ring[index][0] * point[1] - point[0] * ring[index][1], 0)
}

export const SEOUL_BOUNDARY: Position[] = boundaryRings.sort((first, second) => Math.abs(area(second)) - Math.abs(area(first)))[0] ?? []

const maskShell: Position[] = [
  [126, 37], [128, 37], [128, 38], [126, 38], [126, 37],
]

export const SEOUL_OUTSIDE_MASK: GeoJSON.Feature<GeoJSON.Polygon> = {
  type: 'Feature',
  properties: {},
  geometry: { type: 'Polygon', coordinates: [maskShell, SEOUL_BOUNDARY] },
}

export function isInsideSeoul(lat: number, lng: number) {
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
    if ((y1 > y) !== (y2 > y) && x < (x2 - x1) * (y - y1) / (y2 - y1) + x1) inside = !inside
  }
  return inside
}

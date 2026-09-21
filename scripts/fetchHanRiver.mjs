import { mkdir, writeFile } from 'node:fs/promises'

const query = `[out:json][timeout:30];
relation["natural"="water"]["name"="한강"](37.40,126.70,37.72,127.25);
out geom;`

const samePoint = (a, b) => Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) < 1e-7
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])

function stitchRings(members) {
  const remaining = members
    .filter((member) => member.geometry?.length > 1)
    .map((member) => member.geometry.map(({ lon, lat }) => [lon, lat]))
  const rings = []
  while (remaining.length) {
    const ring = remaining.shift()
    while (!samePoint(ring[0], ring.at(-1))) {
      const end = ring.at(-1)
      const nextIndex = remaining.findIndex((segment) => samePoint(segment[0], end) || samePoint(segment.at(-1), end))
      if (nextIndex < 0) break
      const [next] = remaining.splice(nextIndex, 1)
      if (samePoint(next.at(-1), end)) next.reverse()
      ring.push(...next.slice(1))
    }
    if (ring.length > 3 && samePoint(ring[0], ring.at(-1))) rings.push(ring)
  }
  return rings
}

function simplifyRing(ring, tolerance = .000075) {
  const simplified = [ring[0]]
  for (const point of ring.slice(1, -1)) {
    if (distance(point, simplified.at(-1)) >= tolerance) simplified.push(point)
  }
  if (!samePoint(simplified[0], simplified.at(-1))) simplified.push(simplified[0])
  return simplified
}

const body = new URLSearchParams({ data: query })
const response = await fetch('https://overpass-api.de/api/interpreter', {
  method: 'POST',
  body,
  headers: { 'User-Agent': 'SeoulTtareungiTyping/0.1 local-development' },
})
if (!response.ok) throw new Error(`Overpass request failed: ${response.status}`)
const data = await response.json()

const polygons = data.elements.map((relation) => {
  const outer = stitchRings(relation.members.filter((member) => member.role === 'outer'))
  const inner = stitchRings(relation.members.filter((member) => member.role === 'inner'))
  return [...outer, ...inner].map((ring) => simplifyRing(ring))
}).filter((polygon) => polygon.length)

const source = `import type { Coordinate } from './districtGeoData'\n\n` +
`/** OpenStreetMap 한강 수면 폴리곤 스냅샷 (ODbL, 2026-09-21). */\n` +
`export const hanRiverPolygons: Coordinate[][][] = ${JSON.stringify(polygons)}\n`

await mkdir('src/data', { recursive: true })
await writeFile('src/data/hanRiverGeometry.ts', source, 'utf8')
console.log(`Saved ${polygons.length} polygons / ${polygons.flat().reduce((sum, ring) => sum + ring.length, 0)} points`)

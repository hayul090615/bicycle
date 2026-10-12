/** 서울의 모양은 유지하고, 경계 밖 대여소 주변만 검정 테두리 안에 넣는 자료를 만든다. */
import { readFile, writeFile } from 'node:fs/promises'
import polygonClipping from 'polygon-clipping'

const districts = JSON.parse(await readFile(new URL('../src/data/seoulDistricts.geojson', import.meta.url), 'utf8'))
const { stations } = JSON.parse(await readFile(new URL('../src/data/seoulBikeStations.json', import.meta.url), 'utf8'))
const city = polygonClipping.union(...districts.features.map(feature => feature.geometry.coordinates))
const outer = city.map(polygon => polygon[0])
// 서울에서는 경도 1도가 약 88km, 위도 1도가 약 111km이다. 계산할 때 미터로 바꾼다.
const toMeters = ([lng, lat]) => [lng * 88000, lat * 111000]
const toCoordinates = ([x, y]) => [x / 88000, y / 111000]
function inside(point, ring) {
  let result = false
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [x, y] = ring[index], [px, py] = ring[previous]
    if ((y > point[1]) !== (py > point[1]) && point[0] < (px - x) * (point[1] - y) / (py - y) + x) result = !result
  }
  return result
}
function circle(center, radius) {
  const ring = Array.from({ length: 24 }, (_, index) => {
    const angle = index * Math.PI * 2 / 24
    return toCoordinates([center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius])
  })
  return [[...ring, ring[0]]]
}
const additions = []
let expandedStations = 0
for (const station of stations) {
  const point = [station.lng, station.lat]
  if (!point.every(Number.isFinite) || outer.some(ring => inside(point, ring))) continue
  expandedStations++
  const target = toMeters(point)
  let nearest = null, nearestDistance = Infinity
  // 각 선분에서 대여소와 가장 가까운 점을 찾는다. 그 점까지만 작은 연결 구역을 만든다.
  for (const ring of outer) for (let index = 1; index < ring.length; index++) {
    const start = toMeters(ring[index - 1]), end = toMeters(ring[index])
    const dx = end[0] - start[0], dy = end[1] - start[1]
    const ratio = Math.max(0, Math.min(1, ((target[0] - start[0]) * dx + (target[1] - start[1]) * dy) / (dx * dx + dy * dy || 1)))
    const candidate = [start[0] + ratio * dx, start[1] + ratio * dy]
    const distance = Math.hypot(candidate[0] - target[0], candidate[1] - target[1])
    if (distance < nearestDistance) { nearest = candidate; nearestDistance = distance }
  }
  const radius = 220
  additions.push(circle(target, radius), circle(nearest, radius))
  if (nearestDistance > 0) {
    const ox = -(target[1] - nearest[1]) / nearestDistance * radius
    const oy = (target[0] - nearest[0]) / nearestDistance * radius
    const ring = [
      [nearest[0] + ox, nearest[1] + oy], [target[0] + ox, target[1] + oy],
      [target[0] - ox, target[1] - oy], [nearest[0] - ox, nearest[1] - oy],
    ].map(toCoordinates)
    additions.push([[...ring, ring[0]]])
  }
}
const service = additions.length ? polygonClipping.union(city, ...additions) : city
if (service.length !== 1) throw new Error('대여소 영역이 서울과 연결되지 않았습니다.')
const ring = service[0][0].map(point => point.map(value => Number(value.toFixed(9))))
if (stations.some(station => !inside([station.lng, station.lat], ring))) throw new Error('경계 밖에 남은 대여소가 있습니다.')
const output = `/** 서울 외곽에서 대여소 주변 220m까지 확장한 검정 테두리. 행정 경계 자료는 아니다.\n * 좌표는 [경도, 위도] 순서이며 build-bike-service-boundary.mjs로 다시 만든다.\n */\nexport const SEOUL_BIKE_SERVICE_BOUNDARY: [number, number][] = ${JSON.stringify(ring)}\n`
await writeFile(new URL('../src/data/seoulBikeServiceBoundary.ts', import.meta.url), output)
console.log(`서울 외곽 대여소 ${expandedStations}곳을 포함한 경계 ${ring.length}개 좌표를 저장했습니다.`)

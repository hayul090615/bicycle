import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { TouristRoute } from '../data/touristRoutes'
import { getTouristStation } from '../data/touristRoutes'
import { hanRiverPolygons } from '../data/hanRiverGeometry'

type LonLat = [number, number]
interface BikeRouteResult { geometry: LonLat[]; waypoints: LonLat[] }
interface OsmElement { type: string; id: number; tags?: Record<string, string>; geometry?: LonLat[] }
interface OsmResult { elements: OsmElement[] }

class PolylineCurve extends THREE.Curve<THREE.Vector3> {
  private readonly cumulative: number[] = [0]
  private readonly length: number
  constructor(private readonly points: THREE.Vector3[]) {
    super()
    for (let index = 1; index < points.length; index += 1) this.cumulative.push(this.cumulative[index - 1] + points[index].distanceTo(points[index - 1]))
    this.length = this.cumulative.at(-1) ?? 0
  }
  override getLength() { return this.length }
  override getPoint(t: number, target = new THREE.Vector3()) {
    if (this.points.length < 2 || this.length === 0) return target.copy(this.points[0] ?? new THREE.Vector3())
    const distance = THREE.MathUtils.clamp(t, 0, 1) * this.length
    let low = 0, high = this.cumulative.length - 1
    while (low < high) {
      const middle = (low + high) >>> 1
      if (this.cumulative[middle] < distance) low = middle + 1
      else high = middle
    }
    const end = Math.max(1, low), start = end - 1
    const span = this.cumulative[end] - this.cumulative[start]
    return target.copy(this.points[start]).lerp(this.points[end], span > 0 ? (distance - this.cumulative[start]) / span : 0)
  }
  override getPointAt(u: number, target = new THREE.Vector3()) { return this.getPoint(u, target) }
  override getTangentAt(u: number, target = new THREE.Vector3()) {
    const distance = THREE.MathUtils.clamp(u, 0, 1) * this.length
    let low = 0, high = this.cumulative.length - 1
    while (low < high) {
      const middle = (low + high) >>> 1
      if (this.cumulative[middle] < distance) low = middle + 1
      else high = middle
    }
    let end = Math.min(this.points.length - 1, Math.max(1, low))
    if (this.points[end].distanceToSquared(this.points[end - 1]) < 1e-10) {
      while (end < this.points.length - 1 && this.points[end].distanceToSquared(this.points[end - 1]) < 1e-10) end += 1
      while (end > 1 && this.points[end].distanceToSquared(this.points[end - 1]) < 1e-10) end -= 1
    }
    return target.subVectors(this.points[end], this.points[end - 1]).normalize()
  }
}

async function fetchBikeRoute(route: TouristRoute, signal: AbortSignal): Promise<BikeRouteResult> {
  const stations = route.stops.map(({ stationId }) => getTouristStation(stationId))
  const waypoints = stations.map(({ lng, lat }) => [lng, lat] as LonLat)
  const cacheKey = `osm-bike-route-v1-${waypoints.map(([lng, lat]) => `${lng.toFixed(5)},${lat.toFixed(5)}`).join(';')}`
  try {
    const cached = localStorage.getItem(cacheKey)
    if (cached) return JSON.parse(cached) as BikeRouteResult
  } catch { /* cache is optional */ }
  const path = waypoints.map(([lng, lat]) => `${lng},${lat}`).join(';')
  const url = `https://routing.openstreetmap.de/routed-bike/route/v1/driving/${path}?overview=full&geometries=geojson&steps=false`
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`bike route ${response.status}`)
  const data = await response.json() as { code: string; routes?: Array<{ geometry?: { coordinates?: LonLat[] } }>; waypoints?: Array<{ location: LonLat }> }
  const geometry = data.routes?.[0]?.geometry?.coordinates
  if (data.code !== 'Ok' || !geometry || geometry.length < 2) throw new Error('bike route unavailable')
  const result = { geometry, waypoints: data.waypoints?.map(({ location }) => location) ?? waypoints }
  try { localStorage.setItem(cacheKey, JSON.stringify(result)) } catch { /* cache is optional */ }
  return result
}

async function fetchOsmStreetContext(coords: LonLat[], signal: AbortSignal): Promise<OsmResult> {
  const sampleCount = Math.min(55, Math.max(12, Math.ceil(coords.length / 8)))
  const line = Array.from({ length: sampleCount }, (_, index) => coords[Math.round(index * (coords.length - 1) / (sampleCount - 1))])
  const key = `osm-street-context-v2-${line.map(([lng, lat]) => `${lng.toFixed(3)},${lat.toFixed(3)}`).join(';')}`
  try {
    const cached = localStorage.getItem(key)
    if (cached) return JSON.parse(cached) as OsmResult
  } catch { /* cache is optional */ }
  const around = `around:100,${line.map(([lng, lat]) => `${lat},${lng}`).join(',')}`
  const query = `[out:json][timeout:22];(way(${around})[building];way(${around})[highway~"cycleway|path|footway|pedestrian|residential|living_street|tertiary|service|unclassified"];way(${around})[leisure~"park|garden"];way(${around})[landuse~"grass|meadow|forest|recreation_ground"];way(${around})[natural=water];way(${around})[waterway~"river|canal|riverbank"];);out geom;`
  const body = new URLSearchParams({ data: query })
  const response = await fetch('https://overpass.kumi.systems/api/interpreter', { method: 'POST', body, signal })
  if (!response.ok) throw new Error(`OSM context ${response.status}`)
  const data = await response.json() as OsmResult
  try { localStorage.setItem(key, JSON.stringify(data)) } catch { /* cache is optional */ }
  return data
}

function makeBike() {
  const rider = new THREE.Group()
  const frame = new THREE.MeshStandardMaterial({ color: '#f6a934', roughness: .55 })
  const dark = new THREE.MeshStandardMaterial({ color: '#182c2a', roughness: .75 })
  const shirt = new THREE.MeshStandardMaterial({ color: '#18b77d', roughness: .65 })
  const skin = new THREE.MeshStandardMaterial({ color: '#f0bd91', roughness: .8 })
  const wheelGeometry = new THREE.TorusGeometry(.48, .055, 10, 28)
  for (const z of [-.56, .68]) {
    const wheel = new THREE.Mesh(wheelGeometry, dark)
    wheel.rotation.y = Math.PI / 2
    wheel.position.set(0, .53, z)
    rider.add(wheel)
  }
  const bar = (a: THREE.Vector3, b: THREE.Vector3, radius = .045, material = frame) => {
    const delta = new THREE.Vector3().subVectors(b, a)
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, delta.length(), 8), material)
    mesh.position.copy(a).add(b).multiplyScalar(.5)
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize())
    rider.add(mesh)
  }
  const rear = new THREE.Vector3(0, .53, -.56), front = new THREE.Vector3(0, .53, .68)
  const crank = new THREE.Vector3(0, .52, .05), seat = new THREE.Vector3(0, 1.12, -.22), handle = new THREE.Vector3(0, 1.2, .59)
  bar(rear, crank); bar(crank, seat); bar(seat, rear); bar(crank, front); bar(front, handle); bar(handle, seat)
  bar(new THREE.Vector3(-.14, .9, -.26), new THREE.Vector3(.14, .9, -.26), .06, dark)
  bar(new THREE.Vector3(-.18, 1.22, .6), new THREE.Vector3(.18, 1.22, .6), .04, dark)
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.24, .58, 5, 9), shirt)
  torso.position.set(0, 1.55, -.05); torso.rotation.x = -.48; rider.add(torso)
  const head = new THREE.Mesh(new THREE.SphereGeometry(.2, 14, 12), skin)
  head.position.set(0, 2.03, .16); rider.add(head)
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(.22, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), frame)
  helmet.position.set(0, 2.12, .16); rider.add(helmet)
  bar(new THREE.Vector3(0, 1.38, -.15), new THREE.Vector3(0, .65, -.52), .075, dark)
  bar(new THREE.Vector3(0, 1.38, -.15), new THREE.Vector3(0, .65, .42), .075, dark)
  bar(new THREE.Vector3(0, .65, -.52), new THREE.Vector3(0, .65, .42), .065, dark)
  bar(new THREE.Vector3(0, 1.74, -.07), new THREE.Vector3(-.24, 1.28, .51), .065, shirt)
  bar(new THREE.Vector3(0, 1.74, -.07), new THREE.Vector3(.24, 1.28, .51), .065, shirt)
  return rider
}

function localPoint([lng, lat]: LonLat, centerLng: number, centerLat: number, scale: number) {
  return new THREE.Vector3((lng - centerLng) * 88000 * Math.cos(centerLat * Math.PI / 180) * scale, 0, -(lat - centerLat) * 111000 * scale)
}

function polygonMesh(rings: LonLat[][], centerLng: number, centerLat: number, scale: number, material: THREE.Material, height = 0) {
  if (!rings[0] || rings[0].length < 4) return null
  const makePath = (ring: LonLat[]) => {
    const path = new THREE.Path()
    ring.forEach(([lng, lat], index) => {
      const x = (lng - centerLng) * 88000 * Math.cos(centerLat * Math.PI / 180) * scale
      const y = (lat - centerLat) * 111000 * scale
      if (index === 0) path.moveTo(x, y); else path.lineTo(x, y)
    })
    path.closePath()
    return path
  }
  const shape = new THREE.Shape()
  const outer = rings[0]
  outer.forEach(([lng, lat], index) => {
    const x = (lng - centerLng) * 88000 * Math.cos(centerLat * Math.PI / 180) * scale
    const y = (lat - centerLat) * 111000 * scale
    if (index === 0) shape.moveTo(x, y); else shape.lineTo(x, y)
  })
  shape.closePath()
  rings.slice(1).forEach((ring) => shape.holes.push(makePath(ring)))
  const geometry = height > 0 ? new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 1 }) : new THREE.ShapeGeometry(shape, 1)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = height > 0 ? 0 : -.045
  mesh.receiveShadow = true
  return mesh
}

function addRibbon(group: THREE.Group, coords: THREE.Vector3[], width: number, material: THREE.Material, y: number) {
  if (coords.length < 2) return
  const vertices: number[] = [], indices: number[] = []
  coords.forEach((point, index) => {
    const tangent = coords[Math.min(index + 1, coords.length - 1)].clone().sub(coords[Math.max(0, index - 1)]).normalize()
    const side = new THREE.Vector3(-tangent.z, 0, tangent.x).multiplyScalar(width / 2)
    vertices.push(point.x + side.x, y, point.z + side.z, point.x - side.x, y, point.z - side.z)
    if (index) { const a = (index - 1) * 2, b = index * 2; indices.push(a, a + 1, b, a + 1, b + 1, b) }
  })
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setIndex(indices); geometry.computeVertexNormals()
  const mesh = new THREE.Mesh(geometry, material); mesh.receiveShadow = true; group.add(mesh)
}

function pointInFootprint(point: THREE.Vector3, footprint: THREE.Vector3[]) {
  let inside = false
  for (let current = 0, previous = footprint.length - 1; current < footprint.length; previous = current, current += 1) {
    const a = footprint[current], b = footprint[previous]
    if ((a.z > point.z) !== (b.z > point.z) && point.x < (b.x - a.x) * (point.z - a.z) / (b.z - a.z || Number.EPSILON) + a.x) inside = !inside
  }
  return inside
}

function distanceToSegment(point: THREE.Vector3, start: THREE.Vector3, end: THREE.Vector3) {
  const dx = end.x - start.x, dz = end.z - start.z
  const length2 = dx * dx + dz * dz
  const ratio = length2 === 0 ? 0 : THREE.MathUtils.clamp(((point.x - start.x) * dx + (point.z - start.z) * dz) / length2, 0, 1)
  return Math.hypot(point.x - (start.x + ratio * dx), point.z - (start.z + ratio * dz))
}

function addOsmContext(group: THREE.Group, data: OsmResult, centerLng: number, centerLat: number, scale: number, ridePoints: THREE.Vector3[]) {
  const buildings = new THREE.Group(), green = new THREE.Group(), water = new THREE.Group(), roads = new THREE.Group()
  const buildingMats = ['#d5c6ad', '#b8c8c4', '#d9d0bf', '#abbeb8'].map((color) => new THREE.MeshStandardMaterial({ color, roughness: .92, side: THREE.DoubleSide }))
  const greenMat = new THREE.MeshStandardMaterial({ color: '#68a86d', roughness: 1, side: THREE.DoubleSide })
  const waterMat = new THREE.MeshStandardMaterial({ color: '#3499bb', roughness: .28, metalness: .04, side: THREE.DoubleSide })
  const roadMat = new THREE.MeshStandardMaterial({ color: '#84918e', roughness: 1, side: THREE.DoubleSide })
  for (const element of data.elements) {
    if (element.type !== 'way' || !element.geometry || element.geometry.length < 2) continue
    const tags = element.tags ?? {}
    const coords = element.geometry
    const closed = coords.length > 3 && coords[0][0] === coords.at(-1)![0] && coords[0][1] === coords.at(-1)![1]
    if (tags.building && closed) {
      const footprint = coords.slice(0, -1).map((coord) => localPoint(coord, centerLng, centerLat, scale))
      const containsRoute = ridePoints.some((point) => pointInFootprint(point, footprint))
      const tooCloseToRoute = containsRoute || footprint.some((point) => ridePoints.some((ridePoint, index) => index > 0 && distanceToSegment(point, ridePoints[index - 1], ridePoint) < 14))
      if (tooCloseToRoute) continue
      const levelHeight = Number.parseFloat(tags['building:levels'] ?? '') * 3.1
      const taggedHeight = Number.parseFloat(tags.height ?? '')
      const height = Math.max(1.5, Math.min(75, Number.isFinite(taggedHeight) && taggedHeight > 0 ? taggedHeight : (levelHeight || 8)))
      const mesh = polygonMesh([coords], centerLng, centerLat, scale, buildingMats[element.id % buildingMats.length], height * scale)
      if (mesh) { mesh.castShadow = true; buildings.add(mesh) }
      continue
    }
    if ((tags.landuse && /grass|meadow|forest|recreation_ground/.test(tags.landuse)) || (tags.leisure && /park|garden/.test(tags.leisure))) {
      if (closed) { const mesh = polygonMesh([coords], centerLng, centerLat, scale, greenMat); if (mesh) green.add(mesh) }
      continue
    }
    if (tags.natural === 'water' && closed) {
      const mesh = polygonMesh([coords], centerLng, centerLat, scale, waterMat); if (mesh) water.add(mesh)
      continue
    }
    if (tags.highway && !closed) {
      const width = tags.highway === 'cycleway' ? 1.5 : tags.highway === 'path' || tags.highway === 'footway' ? 1.05 : 2.4
      addRibbon(roads, coords.map((coord) => localPoint(coord, centerLng, centerLat, scale)), width * scale, roadMat, .012)
    }
    if (tags.waterway && !closed) {
      const width = /river|canal|riverbank/.test(tags.waterway) ? 8 : 2
      addRibbon(water, coords.map((coord) => localPoint(coord, centerLng, centerLat, scale)), width * scale, waterMat, -.035)
    }
  }
  group.add(green, roads, water, buildings)
  return buildings.children.length + roads.children.length + green.children.length + water.children.length
}

export function ThirdPersonRideScene({ route, progress, playing, onProgress, locale }: {
  route: TouristRoute; progress: number; playing: boolean; onProgress: (value: number) => void; locale: 'en' | 'ko'
}) {
  const stopCoordinates = useMemo(() => route.stops.map(({ stationId }) => {
    const { lat, lng } = getTouristStation(stationId)
    return [lng, lat] as LonLat
  }), [route])
  const [bikeRoute, setBikeRoute] = useState<BikeRouteResult | null>(null)
  const [mapStatus, setMapStatus] = useState<'routing' | 'loading' | 'osm' | 'river'>('routing')
  const host = useRef<HTMLDivElement>(null)
  const updateRef = useRef({ progress, playing, onProgress })
  useEffect(() => { updateRef.current = { progress, playing, onProgress } }, [progress, playing, onProgress])
  useEffect(() => {
    if (host.current) host.current.dataset.mapLabel = mapStatus === 'osm'
      ? (locale === 'en' ? 'OpenStreetMap · roads, buildings & river' : 'OpenStreetMap · 도로 · 건물 · 강')
      : mapStatus === 'river'
        ? (locale === 'en' ? 'Han River map · OSM route unavailable' : '한강 지도 · OSM 경로 연결 대기')
        : (locale === 'en' ? 'Loading real bike route & surroundings…' : '실제 자전거 경로와 주변 지형 불러오는 중…')
  }, [mapStatus, locale])

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    const timeout = window.setTimeout(() => controller.abort(), 16000)
    setBikeRoute(null)
    setMapStatus('routing')
    fetchBikeRoute(route, controller.signal)
      .then((data) => { if (active) { setBikeRoute(data); setMapStatus('loading') } })
      .catch(() => { if (active) setMapStatus('river') })
      .finally(() => window.clearTimeout(timeout))
    return () => { active = false; window.clearTimeout(timeout); controller.abort() }
  }, [route])

  useEffect(() => {
    const element = host.current
    if (!element) return
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
    renderer.setSize(element.clientWidth, element.clientHeight)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.25
    element.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#a9d8e4')
    scene.fog = new THREE.Fog('#cde7d5', 55, 150)
    const camera = new THREE.PerspectiveCamera(62, element.clientWidth / element.clientHeight, .1, 180)
    const ambient = new THREE.HemisphereLight('#e6fbff', '#517356', 2.1); scene.add(ambient)
    const sun = new THREE.DirectionalLight('#fff0d1', 3); sun.position.set(-16, 28, -10); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); scene.add(sun)

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(30000, 30000), new THREE.MeshStandardMaterial({ color: '#78ae78', roughness: 1 }))
    ground.rotation.x = -Math.PI / 2; ground.position.y = -.1; ground.receiveShadow = true; scene.add(ground)

    const rideCoords = bikeRoute?.geometry ?? stopCoordinates
    const minLng = Math.min(...rideCoords.map(([lng]) => lng)), maxLng = Math.max(...rideCoords.map(([lng]) => lng))
    const minLat = Math.min(...rideCoords.map(([, lat]) => lat)), maxLat = Math.max(...rideCoords.map(([, lat]) => lat))
    const centerX = (minLng + maxLng) / 2
    const centerY = (minLat + maxLat) / 2
    const scale = 1
    const sampledRoute = rideCoords.length > 700
      ? Array.from({ length: 700 }, (_, index) => rideCoords[Math.round(index * (rideCoords.length - 1) / 699)])
      : rideCoords
    const points = sampledRoute.map((point) => localPoint(point, centerX, centerY, scale))
    const stopPoints = (bikeRoute?.waypoints ?? stopCoordinates).map((point) => localPoint(point, centerX, centerY, scale))
    const curve = new PolylineCurve(points)
    const trackPoints = curve.getPoints(Math.max(350, Math.min(2600, Math.ceil(curve.getLength() / 2))))

    const environment = new THREE.Group(); scene.add(environment)
    const waterGroup = new THREE.Group(); environment.add(waterGroup)
    const hanMaterial = new THREE.MeshStandardMaterial({ color: '#278eb5', roughness: .25, metalness: .08, side: THREE.DoubleSide })
    for (const polygon of hanRiverPolygons) {
      const mesh = polygonMesh(polygon as LonLat[][], centerX, centerY, scale, hanMaterial)
      if (mesh) waterGroup.add(mesh)
    }
    addRibbon(environment, trackPoints, 5.2, new THREE.MeshStandardMaterial({ color: '#c7b995', roughness: 1, side: THREE.DoubleSide }), -.01)
    addRibbon(environment, trackPoints, 3.4, new THREE.MeshStandardMaterial({ color: '#46565a', roughness: .95, side: THREE.DoubleSide }), .03)
    const dashMaterial = new THREE.MeshStandardMaterial({ color: '#f2e8ae', emissive: '#544d31', emissiveIntensity: .25 })
    for (let i = 0; i < 70; i += 1) {
      const at = curve.getPointAt(i / 70)
      const next = curve.getPointAt(Math.min(1, i / 70 + .003))
      const dash = new THREE.Mesh(new THREE.BoxGeometry(.12, .025, .72), dashMaterial)
      dash.position.set(at.x, .055, at.z); dash.lookAt(next.x, .055, next.z); environment.add(dash)
    }

    const markerMaterial = new THREE.MeshStandardMaterial({ color: '#f5b13b', emissive: '#7a4d11', emissiveIntensity: .3 })
    stopPoints.forEach((point, index) => {
      const beacon = new THREE.Mesh(new THREE.CylinderGeometry(.08, .08, 2.1, 8), markerMaterial)
      beacon.position.set(point.x, 1.1, point.z); scene.add(beacon)
      const cap = new THREE.Mesh(new THREE.SphereGeometry(.35, 14, 12), markerMaterial)
      cap.position.set(point.x, 2.35, point.z); scene.add(cap)
      if (index === 0 || index === points.length - 1) {
        const halo = new THREE.Mesh(new THREE.TorusGeometry(.72, .06, 8, 28), markerMaterial)
        halo.position.set(point.x, .12, point.z); halo.rotation.x = -Math.PI / 2; scene.add(halo)
      }
    })

    const bicycle = makeBike(); bicycle.traverse((object) => { if (object instanceof THREE.Mesh) { object.castShadow = true; object.receiveShadow = true } }); scene.add(bicycle)
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(.82, 20), new THREE.MeshBasicMaterial({ color: '#203c37', transparent: true, opacity: .25 }))
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = .025; scene.add(shadow)
    let last = performance.now()
    let raf = 0
    let lastReportedProgress = -1
    const animate = (now: number) => {
      const dt = Math.min(.05, (now - last) / 1000); last = now
      let value = updateRef.current.progress
      if (updateRef.current.playing) {
        value = (value + dt / 45) % 1
        if (Math.abs(value - lastReportedProgress) >= .01) {
          lastReportedProgress = value
          updateRef.current.onProgress(value)
        }
      }
      const at = curve.getPointAt(value)
      const tangent = curve.getTangentAt(value).normalize()
      bicycle.position.set(at.x, .02, at.z)
      bicycle.rotation.y = Math.atan2(tangent.x, tangent.z)
      shadow.position.set(at.x, .025, at.z)
      const cameraPosition = at.clone().addScaledVector(tangent, -8.5).add(new THREE.Vector3(0, 3.5, 0))
      camera.position.lerp(cameraPosition, .12)
      const look = at.clone().addScaledVector(tangent, 8).add(new THREE.Vector3(0, 1.35, 0))
      camera.lookAt(look)
      renderer.render(scene, camera)
      raf = requestAnimationFrame(animate)
    }
    raf = requestAnimationFrame(animate)

    const osmController = new AbortController()
    const osmTimeout = window.setTimeout(() => osmController.abort(), 18000)
    setMapStatus(bikeRoute ? 'loading' : 'river')
    if (bikeRoute) {
      fetchOsmStreetContext(bikeRoute.geometry, osmController.signal)
        .then((data) => {
          if (osmController.signal.aborted) return
          const count = addOsmContext(environment, data, centerX, centerY, scale, trackPoints)
          if (count > 0) { setMapStatus('osm') }
          else setMapStatus('river')
        })
        .catch(() => setMapStatus('river'))
        .finally(() => window.clearTimeout(osmTimeout))
    }

    const resize = () => {
      if (!element.clientWidth || !element.clientHeight) return
      camera.aspect = element.clientWidth / element.clientHeight
      camera.updateProjectionMatrix(); renderer.setSize(element.clientWidth, element.clientHeight)
    }
    const observer = new ResizeObserver(resize); observer.observe(element)
    return () => { window.clearTimeout(osmTimeout); osmController.abort(); cancelAnimationFrame(raf); observer.disconnect(); scene.traverse((object) => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); const materials = Array.isArray(object.material) ? object.material : [object.material]; materials.forEach((material) => material.dispose()) } }); renderer.dispose(); renderer.domElement.remove() }
  }, [route, bikeRoute, stopCoordinates])

  return <div className="third-person-scene" ref={host} data-map-label="" role="img" aria-label={locale === 'en' ? `Third-person 3D bicycle ride around ${route.title}` : `${route.titleKo} 3인칭 3D 자전거 주행 장면`} />
}

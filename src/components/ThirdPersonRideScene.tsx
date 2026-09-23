import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { TouristRoute } from '../data/touristRoutes'
import { getTouristStation } from '../data/touristRoutes'

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

function makeTree(scene: THREE.Scene, x: number, z: number, scale: number) {
  const tree = new THREE.Group()
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.12, .19, 1.4, 6), new THREE.MeshStandardMaterial({ color: '#70543c' }))
  trunk.position.y = .7; tree.add(trunk)
  for (let i = 0; i < 3; i += 1) {
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(.68 - i * .1, 1), new THREE.MeshStandardMaterial({ color: i === 1 ? '#309d69' : '#3db978', roughness: 1 }))
    crown.position.set(0, 1.5 + i * .38, 0); tree.add(crown)
  }
  tree.position.set(x, 0, z); tree.scale.setScalar(scale); scene.add(tree)
}

export function ThirdPersonRideScene({ route, progress, playing, onProgress, locale }: {
  route: TouristRoute; progress: number; playing: boolean; onProgress: (value: number) => void; locale: 'en' | 'ko'
}) {
  const host = useRef<HTMLDivElement>(null)
  const updateRef = useRef({ progress, playing, onProgress })
  useEffect(() => { updateRef.current = { progress, playing, onProgress } }, [progress, playing, onProgress])

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
    scene.fog = new THREE.Fog('#cde7d5', 35, 105)
    const camera = new THREE.PerspectiveCamera(62, element.clientWidth / element.clientHeight, .1, 180)
    const ambient = new THREE.HemisphereLight('#e6fbff', '#517356', 2.1); scene.add(ambient)
    const sun = new THREE.DirectionalLight('#fff0d1', 3); sun.position.set(-16, 28, -10); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); scene.add(sun)

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(250, 250), new THREE.MeshStandardMaterial({ color: '#78ae78', roughness: 1 }))
    ground.rotation.x = -Math.PI / 2; ground.position.y = -.1; ground.receiveShadow = true; scene.add(ground)

    const stations = route.stops.map((stop) => getTouristStation(stop.stationId))
    const raw = stations.map(({ lat, lng }) => new THREE.Vector2(lng, lat))
    const centerX = (Math.max(...raw.map((p) => p.x)) + Math.min(...raw.map((p) => p.x))) / 2
    const centerY = (Math.max(...raw.map((p) => p.y)) + Math.min(...raw.map((p) => p.y))) / 2
    const meters = raw.map((p) => new THREE.Vector2((p.x - centerX) * 88000 * Math.cos(centerY * Math.PI / 180), (p.y - centerY) * 111000))
    const span = Math.max(...meters.map((p) => p.length()), 1)
    const scale = 54 / span
    const points = meters.map((p) => new THREE.Vector3(p.x * scale, 0, -p.y * scale))
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal')
    const trackPoints = curve.getPoints(Math.max(150, points.length * 70))

    const roadRibbon = (width: number, y: number, material: THREE.Material) => {
      const vertices: number[] = [], indices: number[] = []
      trackPoints.forEach((point, index) => {
        const tangent = curve.getTangentAt(index / (trackPoints.length - 1)).normalize()
        const side = new THREE.Vector3(-tangent.z, 0, tangent.x).multiplyScalar(width / 2)
        vertices.push(point.x + side.x, y, point.z + side.z, point.x - side.x, y, point.z - side.z)
        if (index > 0) {
          const a = (index - 1) * 2, b = index * 2
          indices.push(a, a + 1, b, a + 1, b + 1, b)
        }
      })
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
      geometry.setIndex(indices); geometry.computeVertexNormals()
      const mesh = new THREE.Mesh(geometry, material); mesh.receiveShadow = true; scene.add(mesh)
    }
    roadRibbon(7.4, -.01, new THREE.MeshStandardMaterial({ color: '#c7b995', roughness: 1, side: THREE.DoubleSide }))
    roadRibbon(6.3, .03, new THREE.MeshStandardMaterial({ color: '#46565a', roughness: .95, side: THREE.DoubleSide }))
    const dashMaterial = new THREE.MeshStandardMaterial({ color: '#f2e8ae', emissive: '#544d31', emissiveIntensity: .25 })
    for (let i = 0; i < 70; i += 1) {
      const at = curve.getPointAt(i / 70)
      const next = curve.getPointAt(Math.min(1, i / 70 + .003))
      const dash = new THREE.Mesh(new THREE.BoxGeometry(.12, .025, .72), dashMaterial)
      dash.position.set(at.x, .055, at.z); dash.lookAt(next.x, .055, next.z); scene.add(dash)
    }

    const buildingMaterials = ['#d7c9b6', '#a8c4c8', '#ddc7a1', '#b2c9af'].map((color) => new THREE.MeshStandardMaterial({ color, roughness: .85 }))
    for (let i = 0; i < 34; i += 1) {
      const t = .04 + (i / 34) * .92
      const point = curve.getPointAt(t)
      const tangent = curve.getTangentAt(t)
      const side = i % 2 ? -1 : 1
      const x = point.x + tangent.z * side * (5.5 + (i % 4))
      const z = point.z - tangent.x * side * (5.5 + (i % 4))
      if (i % 3 === 0) { makeTree(scene, x, z, .8 + (i % 4) * .12); continue }
      const width = 2 + (i % 3) * .65, height = 4 + ((i * 7) % 11)
      const building = new THREE.Mesh(new THREE.BoxGeometry(width, height, width * .75), buildingMaterials[i % buildingMaterials.length])
      building.position.set(x, height / 2, z); building.castShadow = true; building.receiveShadow = true; scene.add(building)
      const roof = new THREE.Mesh(new THREE.BoxGeometry(width * 1.08, .2, width * .84), new THREE.MeshStandardMaterial({ color: '#748c82' }))
      roof.position.set(x, height + .08, z); scene.add(roof)
      for (let floor = 1; floor < Math.floor(height / 1.7); floor += 1) for (const face of [-1, 1]) {
        const windowPane = new THREE.Mesh(new THREE.BoxGeometry(.32, .36, .035), new THREE.MeshStandardMaterial({ color: '#d8eff0', emissive: '#abd8d2', emissiveIntensity: .2 }))
        windowPane.position.set(x + face * width * .24, floor * 1.7, z + width * .39); scene.add(windowPane)
      }
    }
    const markerMaterial = new THREE.MeshStandardMaterial({ color: '#f5b13b', emissive: '#7a4d11', emissiveIntensity: .3 })
    points.forEach((point, index) => {
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
      const cameraPosition = at.clone().addScaledVector(tangent, -7.5).add(new THREE.Vector3(0, 3.2, 0))
      camera.position.lerp(cameraPosition, .12)
      const look = at.clone().addScaledVector(tangent, 8).add(new THREE.Vector3(0, 1.35, 0))
      camera.lookAt(look)
      renderer.render(scene, camera)
      raf = requestAnimationFrame(animate)
    }
    raf = requestAnimationFrame(animate)

    const resize = () => {
      if (!element.clientWidth || !element.clientHeight) return
      camera.aspect = element.clientWidth / element.clientHeight
      camera.updateProjectionMatrix(); renderer.setSize(element.clientWidth, element.clientHeight)
    }
    const observer = new ResizeObserver(resize); observer.observe(element)
    return () => { cancelAnimationFrame(raf); observer.disconnect(); scene.traverse((object) => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); const materials = Array.isArray(object.material) ? object.material : [object.material]; materials.forEach((material) => material.dispose()) } }); renderer.dispose(); renderer.domElement.remove() }
  }, [route])

  return <div className="third-person-scene" ref={host} role="img" aria-label={locale === 'en' ? `Third-person 3D bicycle ride around ${route.title}` : `${route.titleKo} 3인칭 3D 자전거 주행 장면`} />
}

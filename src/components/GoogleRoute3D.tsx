import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { getTouristStation, type TouristRoute } from '../data/touristRoutes'
import { loadGoogleMaps3D, type Camera3D, type GoogleMap3D, type Maps3DLibrary } from '../services/googleMaps3d'
import type { LonLat } from '../services/bikeRoute'
import type { PublicCamera } from '../services/publicCctv'
import type { RouteCondition } from '../services/routeConditions'
import riderSpriteUrl from '../assets/map-riders.png'

function sampleRiderPositions(path: LonLat[], count: number): LonLat[] {
  if (path.length < 2) return []
  const distances = [0]
  for (let index = 1; index < path.length; index++) {
    const [startLng, startLat] = path[index - 1]
    const [endLng, endLat] = path[index]
    distances.push(distances[index - 1] + Math.hypot((endLng - startLng) * 88_000, (endLat - startLat) * 111_000))
  }
  const total = distances[distances.length - 1]
  if (!total) return []
  return Array.from({ length: count }, (_, step) => {
    const target = total * (step + 1) / (count + 1)
    let index = 1
    while (index < distances.length - 1 && distances[index] < target) index++
    const ratio = (target - distances[index - 1]) / Math.max(1, distances[index] - distances[index - 1])
    return [path[index - 1][0] + (path[index][0] - path[index - 1][0]) * ratio,
      path[index - 1][1] + (path[index][1] - path[index - 1][1]) * ratio] as LonLat
  })
}

let riderImageSourcesPromise: Promise<string[]> | undefined
function loadRiderImageSources(): Promise<string[]> {
  if (riderImageSourcesPromise) return riderImageSourcesPromise
  riderImageSourcesPromise = new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const panelWidth = image.naturalWidth / 3
      const panelHeight = image.naturalHeight
      const width = 128
      const height = Math.round(width * panelHeight / panelWidth)
      const sources = Array.from({ length: 3 }, (_, index) => {
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Could not prepare the rider image')
        context.drawImage(image, panelWidth * index, 0, panelWidth, panelHeight, 0, 0, width, height)
        return canvas.toDataURL('image/png')
      })
      resolve(sources)
    }
    image.onerror = () => reject(new Error('Could not load the rider image'))
    image.src = riderSpriteUrl
  })
  return riderImageSourcesPromise
}

export function GoogleRoute3D({ route, routePath, accessPath, routeConditions, cctvCameras, rotationRequest, locale, userLocation, selectedStop, onSelectStop, onHoverStop, fallback }: {
  route: TouristRoute; locale: 'en' | 'ko'; selectedStop: number | null
  routePath: LonLat[] | null
  accessPath: LonLat[] | null
  routeConditions: RouteCondition[]
  cctvCameras: PublicCamera[]
  rotationRequest: { direction: 'left' | 'right'; serial: number } | null
  userLocation: { lat: number; lng: number } | null
  onSelectStop: (index: number) => void; onHoverStop: (index: number | null) => void
  fallback: ReactNode
}) {
  const host = useRef<HTMLDivElement>(null)
  const mapRef = useRef<GoogleMap3D | null>(null)
  const libraryRef = useRef<Maps3DLibrary | null>(null)
  const routeLineRef = useRef<HTMLElement | null>(null)
  const accessLineRef = useRef<HTMLElement | null>(null)
  const markersRef = useRef<HTMLElement[]>([])
  const peopleMarkersRef = useRef<HTMLElement[]>([])
  const conditionMarkersRef = useRef<HTMLElement[]>([])
  const cctvMarkersRef = useRef<HTMLElement[]>([])
  const userMarkerRef = useRef<HTMLElement | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [selectedCamera, setSelectedCamera] = useState<PublicCamera | null>(null)
  const points = useMemo(() => route.stops.map(stop => {
    const { lat, lng } = getTouristStation(stop.stationId)
    return { lat, lng }
  }), [route])
  const linePoints = useMemo(() => routePath?.map(([lng, lat]) => ({ lat, lng })) ?? points, [routePath, points])
  const camera = useMemo<Camera3D>(() => {
    if (selectedStop !== null) return { center: { ...points[selectedStop], altitude: 40 }, range: 1600, tilt: 60, heading: 0 }
    const frame = accessPath && accessPath.length >= 2 ? [...points, ...accessPath.map(([lng, lat]) => ({ lat, lng }))] : points
    const lats = frame.map(point => point.lat), lngs = frame.map(point => point.lng)
    const south = Math.min(...lats), north = Math.max(...lats), west = Math.min(...lngs), east = Math.max(...lngs)
    const span = Math.max((north - south) * 111000, (east - west) * 88000)
    return { center: { lat: (south + north) / 2, lng: (west + east) / 2, altitude: 40 }, range: Math.max(2500, span * 3), tilt: 50, heading: 0 }
  }, [accessPath, points, selectedStop])
  const cameraRef = useRef(camera)
  cameraRef.current = camera
  const rotatedCameraRef = useRef(camera)

  useEffect(() => {
    let disposed = false
    let failed = false
    let map: GoogleMap3D | undefined
    let timeout = 0
    setStatus('loading')
    const fail = () => {
      if (disposed) return
      failed = true
      window.clearTimeout(timeout)
      map?.remove()
      mapRef.current = null
      libraryRef.current = null
      setStatus('error')
    }
    timeout = window.setTimeout(fail, 30000)
    window.addEventListener('seoul-google-maps-error', fail)
    void loadGoogleMaps3D().then(library => {
      if (disposed || failed || !host.current) return
      map = new library.Map3DElement({ ...cameraRef.current, mode: library.MapMode.HYBRID, gestureHandling: 'COOPERATIVE', description: locale === 'ko' ? route.titleKo : route.title })
      map.style.width = '100%'
      map.style.height = '100%'
      map.style.display = 'block'
      map.addEventListener('gmp-error', fail)
      map.addEventListener('gmp-steadychange', event => {
        if (!disposed && !failed && (event as Event & { isSteady: boolean }).isSteady) {
          window.clearTimeout(timeout)
          setStatus('ready')
        }
      })
      libraryRef.current = library
      mapRef.current = map
      host.current.replaceChildren(map)
    }).catch(fail)
    return () => {
      disposed = true
      window.clearTimeout(timeout)
      window.removeEventListener('seoul-google-maps-error', fail)
      markersRef.current.forEach(marker => marker.remove())
      markersRef.current = []
      peopleMarkersRef.current.forEach(marker => marker.remove())
      peopleMarkersRef.current = []
      conditionMarkersRef.current.forEach(marker => marker.remove())
      conditionMarkersRef.current = []
      cctvMarkersRef.current.forEach(marker => marker.remove())
      cctvMarkersRef.current = []
      userMarkerRef.current?.remove()
      userMarkerRef.current = null
      routeLineRef.current?.remove()
      accessLineRef.current?.remove()
      routeLineRef.current = null
      map?.remove()
      mapRef.current = null
      libraryRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const library = libraryRef.current
    if (!map || !library || status !== 'ready') return
    map.description = locale === 'ko' ? route.titleKo : route.title
    routeLineRef.current?.remove()
    markersRef.current.forEach(marker => marker.remove())
    routeLineRef.current = new library.Polyline3DElement({ path: linePoints, altitudeMode: library.AltitudeMode.CLAMP_TO_GROUND, strokeColor: '#08765b', strokeWidth: 5, drawsOccludedSegments: false })
    map.append(routeLineRef.current)
    markersRef.current = points.map((position, index) => {
      const stop = route.stops[index]
      const label = `${index + 1}. ${locale === 'ko' ? stop.placeKo : stop.place}`
      const marker = new library.Marker3DInteractiveElement({ position, label, title: label, altitudeMode: library.AltitudeMode.CLAMP_TO_GROUND })
      marker.addEventListener('gmp-click', () => onSelectStop(index))
      marker.addEventListener('pointerenter', () => onHoverStop(index))
      marker.addEventListener('focus', () => onHoverStop(index))
      map.append(marker)
      return marker
    })
    peopleMarkersRef.current.forEach(marker => marker.remove())
    peopleMarkersRef.current = []
    let cancelled = false
    if (routePath && routePath.length >= 2) {
      const distance = routePath.reduce((sum, point, index) => index === 0 ? 0 : sum + Math.hypot(
        (point[0] - routePath[index - 1][0]) * 88_000, (point[1] - routePath[index - 1][1]) * 111_000), 0)
      const count = Math.max(2, Math.min(7, Math.floor(distance / 1800)))
      const riderPositions = sampleRiderPositions(routePath, count)
      void loadRiderImageSources().then(sources => {
        if (cancelled || mapRef.current !== map) return
        peopleMarkersRef.current = riderPositions.map(([lng, lat], index) => {
          const marker = new library.Marker3DElement({
            position: { lat, lng }, altitudeMode: library.AltitudeMode.CLAMP_TO_GROUND,
            drawsWhenOccluded: false, sizePreserved: false,
          })
          const accessibilityLabel = locale === 'ko' ? 'AI 생성 라이딩 장면 · 실제 이용자 아님' : 'AI-generated rider illustration · not a live person'
          marker.setAttribute('aria-label', accessibilityLabel)
          marker.setAttribute('title', accessibilityLabel)
          const image = document.createElement('img')
          image.src = sources[index % sources.length]
          image.width = 64
          image.height = 128
          image.alt = ''
          const template = document.createElement('template')
          template.content.append(image)
          marker.append(template)
          marker.style.display = map.range <= 4500 ? '' : 'none'
          map.append(marker)
          return marker
        })
      }).catch(() => { /* Keep the route usable if the illustrative image cannot load. */ })
    }
    return () => { cancelled = true }
  }, [linePoints, locale, onHoverStop, onSelectStop, points, route, routePath, status])

  useEffect(() => {
    const map = mapRef.current
    if (!map || status !== 'ready') return
    const updatePeopleVisibility = () => peopleMarkersRef.current.forEach(marker => {
      marker.style.display = map.range <= 4500 ? '' : 'none'
    })
    map.addEventListener('gmp-rangechange', updatePeopleVisibility)
    updatePeopleVisibility()
    return () => map.removeEventListener('gmp-rangechange', updatePeopleVisibility)
  }, [status])

  useEffect(() => {
    const map = mapRef.current
    const library = libraryRef.current
    if (!map || !library || status !== 'ready') return
    conditionMarkersRef.current.forEach(marker => marker.remove())
    conditionMarkersRef.current = routeConditions.map(condition => {
      const signal = condition.kind === 'signal'
      const label = signal ? '🚦' : `${condition.kind === 'uphill' ? '↗' : '↘'} ${condition.grade}%`
      const title = signal
        ? locale === 'ko' ? 'OpenStreetMap에 기록된 신호등 · 실시간 상태 아님' : 'OpenStreetMap signal record · not live state'
        : `${condition.kind === 'uphill' ? (locale === 'ko' ? '오르막 경사 추정' : 'Estimated uphill') : (locale === 'ko' ? '내리막 경사 추정' : 'Estimated downhill')} ${condition.grade}%`
      const marker = new library.Marker3DElement({
        position: { lat: condition.lat, lng: condition.lng }, label, title,
        altitudeMode: library.AltitudeMode.CLAMP_TO_GROUND, drawsWhenOccluded: false,
      })
      map.append(marker)
      return marker
    })
    return () => {
      conditionMarkersRef.current.forEach(marker => marker.remove())
      conditionMarkersRef.current = []
    }
  }, [locale, routeConditions, status])

  useEffect(() => {
    const map = mapRef.current, library = libraryRef.current
    if (!map || !library || status !== 'ready') return
    accessLineRef.current?.remove()
    accessLineRef.current = null
    if (!accessPath || accessPath.length < 2) return
    accessLineRef.current = new library.Polyline3DElement({ path: accessPath.map(([lng, lat]) => ({ lat, lng })),
      altitudeMode: library.AltitudeMode.CLAMP_TO_GROUND, strokeColor: '#2479db', strokeWidth: 7, drawsOccludedSegments: false })
    map.append(accessLineRef.current)
  }, [accessPath, status])

  useEffect(() => {
    const map = mapRef.current
    const library = libraryRef.current
    if (!map || !library || status !== 'ready') return
    userMarkerRef.current?.remove()
    userMarkerRef.current = null
    if (!userLocation) return
    const label = locale === 'ko' ? '내 위치' : 'You are here'
    const marker = new library.Marker3DInteractiveElement({ position: userLocation, label, title: label, altitudeMode: library.AltitudeMode.CLAMP_TO_GROUND })
    map.append(marker)
    userMarkerRef.current = marker
  }, [locale, status, userLocation])

  useEffect(() => {
    const map = mapRef.current
    const library = libraryRef.current
    if (!map || !library || status !== 'ready') return
    cctvMarkersRef.current.forEach(marker => marker.remove())
    cctvMarkersRef.current = []
    setSelectedCamera(null)
    cctvCameras.forEach(camera => {
      const title = `${camera.purpose || (locale === 'ko' ? '공공 CCTV' : 'Public CCTV')} · ${camera.name}`
      const marker = new library.Marker3DInteractiveElement({
        position: { lat: camera.lat, lng: camera.lng },
        label: 'CCTV',
        title,
        altitudeMode: library.AltitudeMode.CLAMP_TO_GROUND,
      })
      marker.addEventListener('gmp-click', () => setSelectedCamera(camera))
      map.append(marker)
      cctvMarkersRef.current.push(marker)
    })
  }, [cctvCameras, locale, status])

  useEffect(() => {
    const map = mapRef.current
    if (!map || status !== 'ready') return
    map.stopCameraAnimation()
    rotatedCameraRef.current = camera
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) Object.assign(map, camera)
    else map.flyCameraTo({ endCamera: camera, durationMillis: 650 })
  }, [camera, status])

  useEffect(() => {
    const map = mapRef.current
    if (!map || status !== 'ready' || !rotationRequest) return
    const current = rotatedCameraRef.current
    const turn = rotationRequest.direction === 'left' ? -32 : 32
    const endCamera: Camera3D = {
      ...current,
      heading: ((current.heading + turn) % 360 + 360) % 360,
    }
    rotatedCameraRef.current = endCamera
    map.stopCameraAnimation()
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) Object.assign(map, endCamera)
    else map.flyCameraTo({ endCamera, durationMillis: 420 })
  }, [rotationRequest, status])

  if (status === 'error') return <>
    <p className="tour-earth-notice" role="status">{locale === 'ko' ? 'Google 3D 화면을 불러오지 못해 코스 지도를 표시합니다. 아래 버튼으로 Google Earth에서 볼 수 있습니다.' : 'Google 3D could not load. Showing the route map; you can still open this location in Google Earth below.'}</p>
    {fallback}
  </>
  return <div className="google-route-3d">
    {status === 'loading' && <div className="google-route-underlay">{fallback}</div>}
    <div ref={host} className="google-route-host" style={{ visibility: status === 'loading' ? 'hidden' : 'visible' }} />
    {selectedCamera && <aside className="tour-google-cctv-card" aria-live="polite">
      <button type="button" aria-label={locale === 'ko' ? 'CCTV 정보 닫기' : 'Close CCTV details'} onClick={() => setSelectedCamera(null)}>×</button>
      <strong>{selectedCamera.purpose || (locale === 'ko' ? '공공 CCTV' : 'Public CCTV')}</strong>
      <span>{selectedCamera.name}</span>
      <small>{selectedCamera.address}</small>
      <small>{locale === 'ko' ? '카메라' : 'Cameras'} {selectedCamera.cameras || '—'} · {selectedCamera.resolution || '—'} · {selectedCamera.direction || '—'}</small>
      <small>{locale === 'ko' ? '공개 설치 위치이며 실시간 영상은 제공되지 않습니다.' : 'Public installation record; live video is not provided.'}</small>
    </aside>}
    {status === 'loading' && <p className="google-route-loading" role="status">{locale === 'ko' ? 'Google 3D 지도를 불러오는 중…' : 'Loading Google 3D imagery…'}</p>}
  </div>
}

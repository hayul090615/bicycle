import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { getTouristStation, type TouristRoute } from '../data/touristRoutes'
import { loadGoogleMaps3D, type Camera3D, type GoogleMap3D, type Maps3DLibrary } from '../services/googleMaps3d'
import type { LonLat } from '../services/bikeRoute'
import type { PublicCamera } from '../services/publicCctv'

export function GoogleRoute3D({ route, routePath, cctvCameras, panRequest, locale, userLocation, selectedStop, onSelectStop, onHoverStop, fallback }: {
  route: TouristRoute; locale: 'en' | 'ko'; selectedStop: number | null
  routePath: LonLat[] | null
  cctvCameras: PublicCamera[]
  panRequest: { direction: 'left' | 'right'; serial: number } | null
  userLocation: { lat: number; lng: number } | null
  onSelectStop: (index: number) => void; onHoverStop: (index: number | null) => void
  fallback: ReactNode
}) {
  const host = useRef<HTMLDivElement>(null)
  const mapRef = useRef<GoogleMap3D | null>(null)
  const libraryRef = useRef<Maps3DLibrary | null>(null)
  const routeLineRef = useRef<HTMLElement | null>(null)
  const markersRef = useRef<HTMLElement[]>([])
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
    const lats = points.map(point => point.lat), lngs = points.map(point => point.lng)
    const south = Math.min(...lats), north = Math.max(...lats), west = Math.min(...lngs), east = Math.max(...lngs)
    const span = Math.max((north - south) * 111000, (east - west) * 88000)
    return { center: { lat: (south + north) / 2, lng: (west + east) / 2, altitude: 40 }, range: Math.max(2500, span * 3), tilt: 50, heading: 0 }
  }, [points, selectedStop])
  const cameraRef = useRef(camera)
  cameraRef.current = camera
  const pannedCameraRef = useRef(camera)

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
      cctvMarkersRef.current.forEach(marker => marker.remove())
      cctvMarkersRef.current = []
      userMarkerRef.current?.remove()
      userMarkerRef.current = null
      routeLineRef.current?.remove()
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
    routeLineRef.current = new library.Polyline3DElement({ path: linePoints, altitudeMode: library.AltitudeMode.CLAMP_TO_GROUND, strokeColor: '#08765b', strokeWidth: 5 })
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
  }, [linePoints, locale, onHoverStop, onSelectStop, points, route, status])

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
    pannedCameraRef.current = camera
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) Object.assign(map, camera)
    else map.flyCameraTo({ endCamera: camera, durationMillis: 650 })
  }, [camera, status])

  useEffect(() => {
    const map = mapRef.current
    if (!map || status !== 'ready' || !panRequest) return
    const current = pannedCameraRef.current
    const width = host.current?.clientWidth || 900
    const metersPerLongitude = 111320 * Math.max(.2, Math.cos(current.center.lat * Math.PI / 180))
    const shiftMeters = current.range * Math.min(.32, Math.max(.18, 260 / width))
    const direction = panRequest.direction === 'left' ? -1 : 1
    const endCamera: Camera3D = {
      ...current,
      center: { ...current.center, lng: current.center.lng + direction * shiftMeters / metersPerLongitude },
    }
    pannedCameraRef.current = endCamera
    map.stopCameraAnimation()
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) Object.assign(map, endCamera)
    else map.flyCameraTo({ endCamera, durationMillis: 420 })
  }, [panRequest, status])

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

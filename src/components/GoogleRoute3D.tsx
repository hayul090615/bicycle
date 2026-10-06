import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { getTouristStation, type TouristRoute } from '../data/touristRoutes'
import { loadGoogleMaps3D, type Camera3D, type GoogleMap3D, type GooglePolygon3D, type GooglePosition3D, type Maps3DLibrary } from '../services/googleMaps3d'
import type { LonLat } from '../services/bikeRoute'
import { clusterPublicCameras, type PublicCamera } from '../services/publicCctv'
import type { RouteCondition, RouteElevationPoint, RouteRestaurant } from '../services/routeConditions'
import { coloredRouteSegments } from '../services/routeGradient'
import { createRouteMotion } from '../services/routeMotion'
import { createCyclistMarker } from './cyclistMarker'
import { SEOUL_BOUNDARY, SEOUL_OUTSIDE_MASK } from '../data/seoulBoundary'

function bearingBetween(start: { lat: number; lng: number }, end: { lat: number; lng: number }): number {
  const latitude1 = start.lat * Math.PI / 180
  const latitude2 = end.lat * Math.PI / 180
  const longitudeDelta = (end.lng - start.lng) * Math.PI / 180
  const y = Math.sin(longitudeDelta) * Math.cos(latitude2)
  const x = Math.cos(latitude1) * Math.sin(latitude2) - Math.sin(latitude1) * Math.cos(latitude2) * Math.cos(longitudeDelta)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

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

function accuracyRing({ lat, lng, accuracy }: { lat: number; lng: number; accuracy: number }): GooglePosition3D[] {
  const angularDistance = accuracy / 6_371_000
  const latitude = lat * Math.PI / 180
  const longitude = lng * Math.PI / 180
  return Array.from({ length: 49 }, (_, index) => {
    const bearing = index / 48 * Math.PI * 2
    const destinationLatitude = Math.asin(Math.sin(latitude) * Math.cos(angularDistance)
      + Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(bearing))
    const destinationLongitude = longitude + Math.atan2(Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitude),
      Math.cos(angularDistance) - Math.sin(latitude) * Math.sin(destinationLatitude))
    return { lat: destinationLatitude * 180 / Math.PI, lng: destinationLongitude * 180 / Math.PI, altitude: 0 }
  })
}

export function GoogleRoute3D({ route, routePath, elevationProfile, activeStopIndexes, originStopIndex, viaStopIndex, accessPath, routeConditions, restaurants, showCourse, showRestaurants, showRoadInfo, showRiders, showCctv, cctvCameras, locationFocusRequest, rotationRequest, locale, userLocation, selectedStop, onSelectStop, onHoverStop, onFoodGuideOpen, fallback }: {
  route: TouristRoute; locale: 'en' | 'ko'; selectedStop: number | null
  routePath: LonLat[] | null
  elevationProfile: RouteElevationPoint[]
  activeStopIndexes: number[]
  originStopIndex: number | null
  viaStopIndex: number | null
  accessPath: LonLat[] | null
  routeConditions: RouteCondition[]
  restaurants: RouteRestaurant[]
  showCourse: boolean
  showRestaurants: boolean
  showRoadInfo: boolean
  showRiders: boolean
  showCctv: boolean
  cctvCameras: PublicCamera[]
  locationFocusRequest: number
  rotationRequest: { direction: 'left' | 'right' | 'up' | 'down'; serial: number } | null
  userLocation: { lat: number; lng: number; accuracy?: number } | null
  onSelectStop: (index: number) => void; onHoverStop: (index: number | null) => void
  onFoodGuideOpen: (point: LonLat) => void
  fallback: ReactNode
}) {
  const host = useRef<HTMLDivElement>(null)
  const mapRef = useRef<GoogleMap3D | null>(null)
  const libraryRef = useRef<Maps3DLibrary | null>(null)
  const routeLineRef = useRef<HTMLElement[]>([])
  const accessLineRef = useRef<HTMLElement | null>(null)
  const markersRef = useRef<HTMLElement[]>([])
  const peopleMarkersRef = useRef<HTMLElement[]>([])
  const treeMarkersRef = useRef<HTMLElement[]>([])
  const conditionMarkersRef = useRef<HTMLElement[]>([])
  const restaurantMarkersRef = useRef<HTMLElement[]>([])
  const cctvMarkersRef = useRef<HTMLElement[]>([])
  const userMarkerRef = useRef<HTMLElement | null>(null)
  const userAccuracyRef = useRef<GooglePolygon3D | null>(null)
  const cityMaskRef = useRef<GooglePolygon3D | null>(null)
  const lastLocationFocusRequestRef = useRef(0)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [selectedCamera, setSelectedCamera] = useState<PublicCamera | null>(null)
  const points = useMemo(() => route.stops.map(stop => {
    const { lat, lng } = getTouristStation(stop.stationId)
    return { lat, lng }
  }), [route])
  const linePoints = useMemo(() => routePath?.map(([lng, lat]) => ({ lat, lng })) ?? points, [routePath, points])
  const camera = useMemo<Camera3D>(() => {
    if (selectedStop !== null) return { center: { ...points[selectedStop], altitude: 40 }, range: 1600, tilt: 46, heading: 0 }
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
      const mapOptions = { ...cameraRef.current, mode: library.MapMode.HYBRID, gestureHandling: 'COOPERATIVE', bounds: { south: 37.40, west: 126.75, north: 37.72, east: 127.19 }, description: locale === 'ko' ? route.titleKo : route.title }
      map = new library.Map3DElement(mapOptions)
      map.style.width = '100%'
      map.style.height = '100%'
      map.style.display = 'block'
      map.addEventListener('gmp-error', fail)
      const cityMask = new library.Polygon3DElement({
        fillColor: '#F1F2ECBF',
        strokeColor: '#00000000',
        strokeWidth: 0,
        altitudeMode: library.AltitudeMode.CLAMP_TO_GROUND,
        drawsOccludedSegments: true,
      })
      cityMask.path = SEOUL_OUTSIDE_MASK.geometry.coordinates.map(ring => ring.map(([lng, lat]) => ({ lat, lng, altitude: 0 })))
      map.append(cityMask)
      cityMaskRef.current = cityMask
      const cityBoundary = new library.Polygon3DElement({
        fillColor: '#00000000',
        strokeColor: '#111511FF',
        strokeWidth: 2.5,
        altitudeMode: library.AltitudeMode.CLAMP_TO_GROUND,
        drawsOccludedSegments: true,
      })
      cityBoundary.path = SEOUL_BOUNDARY.map(([lng, lat]) => ({ lat, lng, altitude: 0 }))
      map.append(cityBoundary)
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
      treeMarkersRef.current.forEach(marker => marker.remove())
      treeMarkersRef.current = []
      conditionMarkersRef.current.forEach(marker => marker.remove())
      conditionMarkersRef.current = []
      restaurantMarkersRef.current.forEach(marker => marker.remove())
      restaurantMarkersRef.current = []
      cctvMarkersRef.current.forEach(marker => marker.remove())
      cctvMarkersRef.current = []
      userMarkerRef.current?.remove()
      userMarkerRef.current = null
      userAccuracyRef.current?.remove()
      userAccuracyRef.current = null
      cityMaskRef.current?.remove()
      cityMaskRef.current = null
      routeLineRef.current.forEach(line => line.remove())
      accessLineRef.current?.remove()
      routeLineRef.current = []
      map?.remove()
      mapRef.current = null
      libraryRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const library = libraryRef.current
    if (!map || !library || status !== 'ready') return
    let riderFrame = 0
    map.description = locale === 'ko' ? route.titleKo : route.title
    routeLineRef.current.forEach(line => line.remove())
    routeLineRef.current = []
    markersRef.current.forEach(marker => marker.remove())
    if (showCourse) {
      routeLineRef.current = coloredRouteSegments(routePath ?? [], elevationProfile).map(segment => {
        const line = new library.Polyline3DElement({ path: segment.path.map(([lng, lat]) => ({ lat, lng })), altitudeMode: library.AltitudeMode.CLAMP_TO_GROUND, strokeColor: segment.color, strokeWidth: 5, drawsOccludedSegments: false })
        map.append(line)
        return line
      })
    }
    markersRef.current = showCourse ? activeStopIndexes.map(index => {
      const position = points[index]
      const stop = route.stops[index]
      const prefix = viaStopIndex === index ? (locale === 'ko' ? '경유' : 'Via') : originStopIndex === index ? (locale === 'ko' ? '출발' : 'Start') : selectedStop === index ? (locale === 'ko' ? '도착' : 'End') : `${index + 1}.`
      const label = `${prefix} ${locale === 'ko' ? stop.placeKo : stop.place}`
      const marker = new library.Marker3DInteractiveElement({ position, label, title: label, altitudeMode: library.AltitudeMode.CLAMP_TO_GROUND })
      marker.addEventListener('gmp-click', () => onSelectStop(index))
      marker.addEventListener('pointerenter', () => onHoverStop(index))
      marker.addEventListener('focus', () => onHoverStop(index))
      map.append(marker)
      return marker
    }) : []
    treeMarkersRef.current.forEach(marker => marker.remove())
    treeMarkersRef.current = []
    const sceneryPath = routePath && routePath.length >= 2
      ? routePath
      : linePoints.map(point => [point.lng, point.lat] as LonLat)
    peopleMarkersRef.current.forEach(marker => marker.remove())
    peopleMarkersRef.current = []
    const motion = createRouteMotion(sceneryPath)
    const riderIcons: HTMLElement[] = []
    if (showRiders && motion) {
      const distance = motion.lengthMeters
      const count = Math.max(8, Math.min(14, Math.round(distance / 1400)))
      const riderPositions = sampleRiderPositions(sceneryPath, count)
      peopleMarkersRef.current = riderPositions.map(([lng, lat], index) => {
        const marker = new library.Marker3DElement({
          position: { lat, lng }, altitudeMode: library.AltitudeMode.CLAMP_TO_GROUND,
          drawsWhenOccluded: false, sizePreserved: false,
        })
        const icon = createCyclistMarker(index, locale)
        icon.style.width = '54px'
        icon.style.height = '78px'
        icon.style.setProperty('--rider-heading', '90deg')
        riderIcons.push(icon)
        const template = document.createElement('template')
        template.content.append(icon)
        marker.append(template)
        marker.style.display = map.range <= 25000 ? '' : 'none'
        map.append(marker)
        return marker
      })
      const startedAt = performance.now()
      let lastUpdate = 0
      const moveRiders = (now: number) => {
        if (now - lastUpdate < 45) { riderFrame = window.requestAnimationFrame(moveRiders); return }
        lastUpdate = now
        const traveled = (now - startedAt) / 1000 * 3.2 / motion.lengthMeters
        peopleMarkersRef.current.forEach((marker, index) => {
          const position = motion.pointAt(traveled + index / count)
          ;(marker as HTMLElement & { position: { lat: number; lng: number; altitude: number } }).position = {
            lat: position.point[1], lng: position.point[0], altitude: 0,
          }
          riderIcons[index]?.style.setProperty('--rider-heading', `${position.bearing}deg`)
        })
        riderFrame = window.requestAnimationFrame(moveRiders)
      }
      riderFrame = window.requestAnimationFrame(moveRiders)
    }
    const updateTreeVisibility = () => treeMarkersRef.current.forEach(marker => {
      marker.style.display = map.range <= 65000 ? '' : 'none'
      marker.classList.toggle('is-close-view', map.range <= 4000)
    })
    map.addEventListener('gmp-rangechange', updateTreeVisibility)
    updateTreeVisibility()
    return () => {
      window.cancelAnimationFrame(riderFrame)
      map.removeEventListener('gmp-rangechange', updateTreeVisibility)
      peopleMarkersRef.current.forEach(marker => marker.remove())
      peopleMarkersRef.current = []
      treeMarkersRef.current.forEach(marker => marker.remove())
      treeMarkersRef.current = []
    }
  }, [activeStopIndexes, elevationProfile, linePoints, locale, onHoverStop, onSelectStop, originStopIndex, points, route, routePath, selectedStop, showCourse, showRiders, status, viaStopIndex])

  useEffect(() => {
    const map = mapRef.current
    if (!map || status !== 'ready') return
    const updatePeopleVisibility = () => peopleMarkersRef.current.forEach(marker => {
      marker.style.display = map.range <= 25000 ? '' : 'none'
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
    conditionMarkersRef.current = showRoadInfo ? routeConditions.map(condition => {
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
    }) : []
    return () => {
      conditionMarkersRef.current.forEach(marker => marker.remove())
      conditionMarkersRef.current = []
    }
  }, [locale, routeConditions, showRoadInfo, status])

  useEffect(() => {
    const map = mapRef.current
    const library = libraryRef.current
    if (!map || !library || status !== 'ready') return
    restaurantMarkersRef.current.forEach(marker => marker.remove())
    restaurantMarkersRef.current = []
    if (!showRestaurants) return
    restaurantMarkersRef.current = restaurants.map(place => {
      const kindLabel = place.kind === 'cafe' ? (locale === 'ko' ? '카페' : 'Cafe') : (locale === 'ko' ? '음식점' : 'Restaurant')
      const marker = new library.Marker3DInteractiveElement({
        position: { lat: place.lat, lng: place.lng },
        label: place.kind === 'cafe' ? '☕' : '식', title: `${place.name} · ${kindLabel}`,
        altitudeMode: library.AltitudeMode.CLAMP_TO_GROUND, drawsWhenOccluded: false,
      })
      map.append(marker)
      return marker
    })
    return () => { restaurantMarkersRef.current.forEach(marker => marker.remove()); restaurantMarkersRef.current = [] }
  }, [locale, restaurants, showRestaurants, status])

  useEffect(() => {
    const map = mapRef.current, library = libraryRef.current
    if (!map || !library || status !== 'ready') return
    accessLineRef.current?.remove()
    accessLineRef.current = null
    if (!showCourse || !accessPath || accessPath.length < 2) return
    accessLineRef.current = new library.Polyline3DElement({ path: accessPath.map(([lng, lat]) => ({ lat, lng })),
      altitudeMode: library.AltitudeMode.CLAMP_TO_GROUND, strokeColor: '#ffffff', strokeWidth: 5, drawsOccludedSegments: false })
    map.append(accessLineRef.current)
  }, [accessPath, showCourse, status])

  useEffect(() => {
    const map = mapRef.current
    const library = libraryRef.current
    if (!map || !library || status !== 'ready') return
    userMarkerRef.current?.remove()
    userMarkerRef.current = null
    userAccuracyRef.current?.remove()
    userAccuracyRef.current = null
    if (!userLocation) return
    const label = locale === 'ko' ? '내 위치' : 'You are here'
    if (userLocation.accuracy !== undefined) {
      const accuracy = new library.Polygon3DElement({
        fillColor: '#1677E833', strokeColor: '#1677E8AA', strokeWidth: 1,
        altitudeMode: library.AltitudeMode.CLAMP_TO_GROUND, drawsOccludedSegments: false,
      })
      accuracy.path = accuracyRing({ lat: userLocation.lat, lng: userLocation.lng, accuracy: userLocation.accuracy })
      map.append(accuracy)
      userAccuracyRef.current = accuracy
    }
    const title = userLocation.accuracy === undefined ? label : `${label} · ±${Math.round(userLocation.accuracy)} m`
    const marker = new library.Marker3DInteractiveElement({ position: { lat: userLocation.lat, lng: userLocation.lng, altitude: 0 }, label, title, altitudeMode: library.AltitudeMode.CLAMP_TO_GROUND })
    map.append(marker)
    userMarkerRef.current = marker
  }, [locale, status, userLocation])

  useEffect(() => {
    const map = mapRef.current
    const library = libraryRef.current
    if (!map || !library || status !== 'ready') return
    setSelectedCamera(null)
    const renderCameras = () => {
      cctvMarkersRef.current.forEach(marker => marker.remove())
      cctvMarkersRef.current = []
      if (!showCctv) return
      const center = { lat: map.center.lat, lng: map.center.lng }
      const clusters = clusterPublicCameras(cctvCameras, center, Math.min(70_000, map.range * .68), Math.max(120, map.range / 34))
      clusters.forEach(cluster => {
        if (cluster.cameras.length > 1) {
          const marker = new library.Marker3DInteractiveElement({
            position: { lat: cluster.lat, lng: cluster.lng },
            label: `${cluster.cameras.length} CCTV`,
            title: locale === 'ko' ? `${cluster.cameras.length}개 CCTV · 확대해서 보기` : `${cluster.cameras.length} public cameras · zoom in`,
            altitudeMode: library.AltitudeMode.CLAMP_TO_GROUND, drawsWhenOccluded: false,
          })
          marker.addEventListener('gmp-click', () => {
            map.stopCameraAnimation()
            const nextCamera: Camera3D = { center: { lat: cluster.lat, lng: cluster.lng, altitude: 40 }, range: Math.max(900, map.range * .38), tilt: 48, heading: map.heading }
            map.flyCameraTo({ endCamera: nextCamera, durationMillis: 500 })
          })
          map.append(marker)
          cctvMarkersRef.current.push(marker)
          return
        }
        const camera = cluster.cameras[0]
        const marker = new library.Marker3DInteractiveElement({
          position: { lat: camera.lat, lng: camera.lng },
          label: 'CCTV', title: `${camera.purpose || (locale === 'ko' ? '공공 CCTV' : 'Public CCTV')} · ${camera.name}`,
          altitudeMode: library.AltitudeMode.CLAMP_TO_GROUND,
        })
        marker.addEventListener('gmp-click', () => setSelectedCamera(camera))
        map.append(marker)
        cctvMarkersRef.current.push(marker)
      })
    }
    renderCameras()
    map.addEventListener('gmp-rangechange', renderCameras)
    map.addEventListener('gmp-centerchange', renderCameras)
    return () => {
      map.removeEventListener('gmp-rangechange', renderCameras)
      map.removeEventListener('gmp-centerchange', renderCameras)
      cctvMarkersRef.current.forEach(marker => marker.remove())
      cctvMarkersRef.current = []
    }
  }, [cctvCameras, locale, showCctv, status])

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
    if (!map || status !== 'ready' || !locationFocusRequest || locationFocusRequest === lastLocationFocusRequestRef.current || !userLocation) return
    lastLocationFocusRequestRef.current = locationFocusRequest
    const destination = getTouristStation(route.stops[selectedStop ?? route.stops.length - 1].stationId)
    const focusCamera: Camera3D = {
      center: { ...userLocation, altitude: 40 },
      range: Math.max(1_400, Math.min(12_000, Math.hypot((destination.lng - userLocation.lng) * 88_000, (destination.lat - userLocation.lat) * 111_000) * .82)),
      tilt: 48,
      heading: bearingBetween(userLocation, destination),
    }
    map.stopCameraAnimation()
    map.flyCameraTo({ endCamera: focusCamera, durationMillis: 600 })
  }, [locationFocusRequest, route, selectedStop, status, userLocation])

  useEffect(() => {
    const map = mapRef.current
    if (!map || status !== 'ready' || !rotationRequest) return
    const current = rotatedCameraRef.current
    const endCamera: Camera3D = rotationRequest.direction === 'up' || rotationRequest.direction === 'down'
      ? { ...current, tilt: Math.max(0, Math.min(85, current.tilt + (rotationRequest.direction === 'up' ? 15 : -15))) }
      : { ...current, heading: ((current.heading + (rotationRequest.direction === 'left' ? -32 : 32)) % 360 + 360) % 360 }
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

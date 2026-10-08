import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { getTouristStation, type TouristRoute } from '../data/touristRoutes'
import { hasKakaoMapsKey, loadKakaoMaps, type KakaoMap, type KakaoMapsApi, type KakaoOverlay } from '../services/kakaoMaps'
import type { LonLat } from '../services/bikeRoute'
import type { PublicCamera } from '../services/publicCctv'
import type { NearbyBikeStation } from '../services/nearbyBikes'
import type { RouteAmenity, RouteCondition, RouteElevationPoint, RouteRestaurant } from '../services/routeConditions'
import { routeArrivalBearing } from '../utils/routeArrival'
import { coloredRouteSegments } from '../services/routeGradient'
import { createRouteMotion } from '../services/routeMotion'
import { createCyclistMarker } from './cyclistMarker'
import { SEOUL_BOUNDARY, SEOUL_OUTSIDE_MASK } from '../data/seoulBoundary'

type MapPoint = { lat: number; lng: number }

function isValidLonLat(point: LonLat): boolean {
  const [lng, lat] = point
  return Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
}

function isValidPath(path: LonLat[] | null): path is LonLat[] {
  return Boolean(path && path.length >= 2 && path.every(isValidLonLat))
}

function readMapCenter(map: KakaoMap): MapPoint | null {
  try {
    const bounds = map.getBounds()
    const southwest = bounds.getSouthWest()
    const northeast = bounds.getNorthEast()
    const lat = (southwest.getLat() + northeast.getLat()) / 2
    const lng = (southwest.getLng() + northeast.getLng()) / 2
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
  } catch {
    return null
  }
}

function makeCctvPopup(camera: PublicCamera, locale: 'en' | 'ko', close: () => void) {
  const popup = document.createElement('div')
  popup.className = 'tour-cctv-popup tour-cctv-popup--kakao'
  const heading = document.createElement('strong')
  heading.textContent = camera.purpose || (locale === 'ko' ? '공공 CCTV' : 'Public CCTV')
  const closeButton = document.createElement('button')
  closeButton.type = 'button'
  closeButton.className = 'tour-cctv-popup-close'
  closeButton.setAttribute('aria-label', locale === 'ko' ? '닫기' : 'Close')
  closeButton.textContent = '×'
  closeButton.addEventListener('click', event => {
    event.stopPropagation()
    close()
  })
  const name = document.createElement('div')
  name.textContent = camera.name
  const address = document.createElement('div')
  address.textContent = camera.address || (locale === 'ko' ? '주소 정보 없음' : 'Address not listed')
  const metadata = document.createElement('small')
  metadata.textContent = `${locale === 'ko' ? '카메라' : 'Cameras'} ${camera.cameras || '—'} · ${camera.resolution || '—'} · ${camera.direction || '—'}`
  const date = document.createElement('small')
  date.textContent = `${locale === 'ko' ? '자료 기준일' : 'Data date'} ${camera.updatedAt || '—'}`
  const notice = document.createElement('small')
  notice.textContent = locale === 'ko'
    ? '공개된 설치 위치 정보입니다. 실시간 영상 주소는 제공되지 않습니다.'
    : 'Public installation record; live video is not provided.'
  popup.append(closeButton, heading, name, address, metadata, date, notice)
  return popup
}

export function KakaoRouteMap({ route, routePath, elevationProfile, activeStopIndexes, originStopIndex, viaStopIndex, accessPath, accessEstimated, walkPath, amenities, showAmenities, bikeStations, showBikeStations, onMapCenterChange, showRiders, routeConditions, restaurants, showCourse, hasDestination, showRestaurants, showRoadInfo, showCctv, cctvCameras, locationFocusRequest, locale, userLocation, selectedStop, kakaoMapType, onSelectStop, destinationPicking, customDestination, onPickDestination, onHoverStop, onFoodGuideOpen, fallback }: {
  route: TouristRoute
  routePath: LonLat[] | null
  elevationProfile: RouteElevationPoint[]
  activeStopIndexes: number[]
  originStopIndex: number | null
  viaStopIndex: number | null
  accessPath: LonLat[] | null
  accessEstimated: boolean
  walkPath: LonLat[] | null
  amenities: RouteAmenity[]
  showAmenities: boolean
  bikeStations: NearbyBikeStation[]
  showBikeStations: boolean
  onMapCenterChange: (center: MapPoint) => void
  showRiders: boolean
  routeConditions: RouteCondition[]
  restaurants: RouteRestaurant[]
  showCourse: boolean
  hasDestination: boolean
  showRestaurants: boolean
  showRoadInfo: boolean
  showCctv: boolean
  cctvCameras: PublicCamera[]
  locationFocusRequest: number
  locale: 'en' | 'ko'
  userLocation: { lat: number; lng: number; heading?: number; accuracy?: number } | null
  selectedStop: number | null
  kakaoMapType: 'roadmap' | 'skyview'
  onSelectStop: (index: number) => void
  destinationPicking: boolean
  customDestination: { lat: number; lng: number } | null
  onPickDestination: (point: { lat: number; lng: number }) => void
  onHoverStop: (index: number | null) => void
  onFoodGuideOpen: (point: LonLat) => void
  fallback: ReactNode
}) {
  const host = useRef<HTMLDivElement>(null)
  const mapRef = useRef<KakaoMap | null>(null)
  const apiRef = useRef<KakaoMapsApi | null>(null)
  const routeOverlaysRef = useRef<KakaoOverlay[]>([])
  const accessOverlaysRef = useRef<KakaoOverlay[]>([])
  const walkOverlaysRef = useRef<KakaoOverlay[]>([])
  const conditionOverlaysRef = useRef<KakaoOverlay[]>([])
  const restaurantOverlaysRef = useRef<KakaoOverlay[]>([])
  const cctvOverlaysRef = useRef<KakaoOverlay[]>([])
  const sceneryOverlaysRef = useRef<KakaoOverlay[]>([])
  const userOverlayRef = useRef<KakaoOverlay | null>(null)
  const cityMaskOverlayRef = useRef<KakaoOverlay | null>(null)
  const cityBoundaryOverlayRef = useRef<KakaoOverlay | null>(null)
  const destinationOverlayRef = useRef<KakaoOverlay | null>(null)
  const activePopupRef = useRef<KakaoOverlay | null>(null)
  const activePopupIdRef = useRef<string | null>(null)
  const lastLocationFocusRequestRef = useRef(0)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const points = useMemo(() => route.stops.map(stop => {
    const station = getTouristStation(stop.stationId)
    return { lat: station.lat, lng: station.lng }
  }), [route])
  const safeRoutePath = useMemo(() => isValidPath(routePath) ? routePath : null, [routePath])
  const safeAccessPath = useMemo(() => isValidPath(accessPath) ? accessPath : null, [accessPath])
  const safeWalkPath = useMemo(() => isValidPath(walkPath) ? walkPath : null, [walkPath])
  const linePoints = useMemo(() => safeRoutePath?.map(([lng, lat]) => ({ lat, lng })) ?? points, [safeRoutePath, points])

  useEffect(() => {
    let disposed = false
    let timeout = 0
    let mapCreated = false
    setStatus('loading')
    void loadKakaoMaps().then(api => {
      if (disposed || !host.current) return
      window.clearTimeout(timeout)
      const map = new api.Map(host.current, {
        center: new api.LatLng(points[0].lat, points[0].lng),
        level: 7,
        mapTypeId: api.MapTypeId.ROADMAP,
        draggable: true,
        scrollwheel: true,
      })
      apiRef.current = api
      mapRef.current = map
      mapCreated = true
      const maskPaths = SEOUL_OUTSIDE_MASK.geometry.coordinates.map(ring => ring.map(([lng, lat]) => new api.LatLng(lat, lng)))
      cityMaskOverlayRef.current = new api.Polygon({
        map,
        path: maskPaths,
        strokeWeight: 0,
        strokeColor: '#000000',
        strokeOpacity: 0,
        fillColor: '#f1f2ec',
        fillOpacity: .76,
      })
      cityBoundaryOverlayRef.current = new api.Polyline({
        map,
        path: SEOUL_BOUNDARY.map(([lng, lat]) => new api.LatLng(lat, lng)),
        strokeWeight: 3,
        strokeColor: '#111511',
        strokeOpacity: .96,
        strokeStyle: 'solid',
      })
      let correctingCenter = false
      api.event.addListener(map, 'center_changed', () => {
        if (correctingCenter) return
        const center = readMapCenter(map)
        if (!center) return
        const { lat: centerLat, lng: centerLng } = center
        const lat = Math.max(37.28, Math.min(37.84, centerLat))
        const lng = Math.max(126.62, Math.min(127.34, centerLng))
        if (lat !== centerLat || lng !== centerLng) {
          correctingCenter = true
          map.setCenter(new api.LatLng(lat, lng))
          window.setTimeout(() => { correctingCenter = false }, 0)
        }
      })
      window.requestAnimationFrame(() => map.relayout())
      setStatus('ready')
    }).catch(error => {
      window.clearTimeout(timeout)
      if (!disposed) {
        console.error('[KakaoRouteMap] Map initialization failed', error)
        setStatus(mapCreated ? 'ready' : 'error')
      }
    })
    timeout = window.setTimeout(() => {
      if (!mapRef.current && !disposed) setStatus('error')
    }, 22000)
    const resizeObserver = host.current ? new ResizeObserver(() => mapRef.current?.relayout()) : null
    if (host.current && resizeObserver) resizeObserver.observe(host.current)
    return () => {
      disposed = true
      window.clearTimeout(timeout)
      resizeObserver?.disconnect()
      routeOverlaysRef.current.forEach(overlay => overlay.setMap(null))
      accessOverlaysRef.current.forEach(overlay => overlay.setMap(null))
      conditionOverlaysRef.current.forEach(overlay => overlay.setMap(null))
      restaurantOverlaysRef.current.forEach(overlay => overlay.setMap(null))
      cctvOverlaysRef.current.forEach(overlay => overlay.setMap(null))
      sceneryOverlaysRef.current.forEach(overlay => overlay.setMap(null))
      userOverlayRef.current?.setMap(null)
      cityMaskOverlayRef.current?.setMap(null)
      cityBoundaryOverlayRef.current?.setMap(null)
      activePopupRef.current?.setMap(null)
      mapRef.current = null
      apiRef.current = null
      routeOverlaysRef.current = []
      accessOverlaysRef.current = []
      conditionOverlaysRef.current = []
      restaurantOverlaysRef.current = []
      cctvOverlaysRef.current = []
      sceneryOverlaysRef.current = []
      userOverlayRef.current = null
      cityMaskOverlayRef.current = null
      cityBoundaryOverlayRef.current = null
      activePopupRef.current = null
      activePopupIdRef.current = null
      mapRef.current = null
      apiRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const api = apiRef.current
    if (!map || !api || status !== 'ready') return
    const reportCenter = () => {
      const center = readMapCenter(map)
      if (center) onMapCenterChange(center)
    }
    reportCenter()
    api.event.addListener(map, 'idle', reportCenter)
    return () => api.event.removeListener(map, 'idle', reportCenter)
  }, [onMapCenterChange, status])

  useEffect(() => {
    const map = mapRef.current
    const api = apiRef.current
    if (!map || !api || status !== 'ready') return
    routeOverlaysRef.current.forEach(overlay => overlay.setMap(null))
    routeOverlaysRef.current = []
    activePopupRef.current?.setMap(null)
    activePopupRef.current = null
    activePopupIdRef.current = null

    const path = linePoints.map(point => new api.LatLng(point.lat, point.lng))
    const casing = new api.Polyline({ map: showCourse ? map : null, path, strokeWeight: 9, strokeColor: '#294c3a', strokeOpacity: .98, strokeStyle: 'solid' })
    routeOverlaysRef.current.push(casing)
    for (const segment of coloredRouteSegments(safeRoutePath ?? [], elevationProfile)) {
      routeOverlaysRef.current.push(new api.Polyline({ map: showCourse ? map : null, path: segment.path.map(([lng, lat]) => new api.LatLng(lat, lng)), strokeWeight: 5, strokeColor: segment.color, strokeOpacity: 1, strokeStyle: 'solid' }))
    }
    activeStopIndexes.forEach(index => {
      const stop = route.stops[index]
      const label = locale === 'ko' ? stop.placeKo : stop.place
      const button = document.createElement('button')
      button.type = 'button'
      button.className = `tour-3d-stop-marker kakao-stop-marker${selectedStop === index ? ' is-selected' : ''}${viaStopIndex === index ? ' is-via' : ''}${originStopIndex === index ? ' is-origin' : ''}`
      button.setAttribute('aria-label', `${index + 1}. ${label}`)
      button.title = label
      const number = document.createElement('b')
      number.textContent = String(index + 1)
      const name = document.createElement('span')
      name.textContent = label
      button.append(number, name)
      button.addEventListener('click', () => onSelectStop(index))
      button.addEventListener('mouseenter', () => onHoverStop(index))
      button.addEventListener('mouseleave', () => onHoverStop(null))
      button.addEventListener('focus', () => onHoverStop(index))
      button.addEventListener('blur', () => onHoverStop(null))
      routeOverlaysRef.current.push(new api.CustomOverlay({
        map,
        position: new api.LatLng(points[index].lat, points[index].lng),
        content: button,
        xAnchor: .5,
        yAnchor: 1,
        zIndex: selectedStop === index ? 10 : 5,
      }))
    })

    if (!hasDestination && selectedStop === null) {
      if (locationFocusRequest === 0) {
        map.setLevel(8, { animate: false })
        map.setCenter(new api.LatLng(37.5665, 126.978))
      }
      return
    }
    if (hasDestination && safeRoutePath && safeRoutePath.length > 1) {
      const framed = [
        ...linePoints,
        ...(safeAccessPath ?? []).map(([lng, lat]) => ({ lat, lng })),
        ...(safeWalkPath ?? []).map(([lng, lat]) => ({ lat, lng })),
      ]
      const bounds = new api.LatLngBounds()
      framed.forEach(point => bounds.extend(new api.LatLng(point.lat, point.lng)))
      const bottomPadding = window.matchMedia('(max-width: 700px)').matches ? 280 : 72
      map.setBounds(bounds, 76, 56, bottomPadding, 56)
      window.requestAnimationFrame(() => map.relayout())
      return
    }
    if (customDestination) {
      map.setLevel(3, { animate: false })
      map.setCenter(new api.LatLng(customDestination.lat, customDestination.lng))
      window.requestAnimationFrame(() => map.relayout())
    } else if (selectedStop !== null && points[selectedStop]) {
      map.setLevel(3, { animate: false })
      map.setCenter(new api.LatLng(points[selectedStop].lat, points[selectedStop].lng))
      window.requestAnimationFrame(() => map.relayout())
    } else if (safeAccessPath) {
      const framed = selectedStop === null ? [...linePoints, ...safeAccessPath.map(([lng, lat]) => ({ lng, lat })), ...(safeWalkPath ?? []).map(([lng, lat]) => ({ lng, lat }))] : safeAccessPath.map(([lng, lat]) => ({ lng, lat }))
      const south = Math.min(...framed.map(point => point.lat)), north = Math.max(...framed.map(point => point.lat))
      const west = Math.min(...framed.map(point => point.lng)), east = Math.max(...framed.map(point => point.lng))
      const spanKm = Math.max((north - south) * 111, (east - west) * 88)
      map.setLevel(spanKm > 25 ? 9 : spanKm > 16 ? 8 : spanKm > 10 ? 7 : spanKm > 5 ? 6 : 5, { animate: false })
      map.setCenter(new api.LatLng((south + north) / 2, (west + east) / 2))
    } else {
      const south = Math.min(...linePoints.map(point => point.lat))
      const north = Math.max(...linePoints.map(point => point.lat))
      const west = Math.min(...linePoints.map(point => point.lng))
      const east = Math.max(...linePoints.map(point => point.lng))
      const spanKm = Math.max((north - south) * 111, (east - west) * 88)
      const level = spanKm > 25 ? 9 : spanKm > 16 ? 8 : spanKm > 10 ? 7 : spanKm > 5 ? 6 : 5
      map.setLevel(level, { animate: false })
      map.setCenter(new api.LatLng((south + north) / 2, (west + east) / 2))
    }
  }, [activeStopIndexes, customDestination, elevationProfile, hasDestination, linePoints, locale, locationFocusRequest, onHoverStop, onSelectStop, originStopIndex, points, route, safeAccessPath, safeRoutePath, safeWalkPath, selectedStop, showCourse, status, viaStopIndex])

  useEffect(() => {
    const map = mapRef.current
    const api = apiRef.current
    if (!map || !api || status !== 'ready' || !destinationPicking) return
    const onMapClick = (event?: { latLng?: { getLat(): number; getLng(): number } }) => {
      const position = event?.latLng
      if (position) onPickDestination({ lat: position.getLat(), lng: position.getLng() })
    }
    api.event.addListener(map, 'click', onMapClick)
    host.current?.classList.add('is-picking-destination')
    return () => {
      api.event.removeListener(map, 'click', onMapClick)
      host.current?.classList.remove('is-picking-destination')
    }
  }, [destinationPicking, onPickDestination, status])

  useEffect(() => {
    const map = mapRef.current
    const api = apiRef.current
    if (!map || !api || status !== 'ready') return
    destinationOverlayRef.current?.setMap(null)
    destinationOverlayRef.current = null
    const destinationPoint = customDestination ?? (selectedStop !== null ? points[selectedStop] : null)
    if (destinationPoint) {
      const marker = document.createElement('div')
      marker.className = 'tour-journey-pin tour-journey-pin--destination'
      marker.style.setProperty('--arrival-bearing', `${routeArrivalBearing(safeRoutePath)}deg`)
      const arrow = document.createElement('i')
      arrow.className = 'tour-arrival-direction-arrow'
      arrow.setAttribute('aria-hidden', 'true')
      arrow.textContent = '↑'
      const pinLabel = document.createElement('span')
      pinLabel.textContent = locale === 'ko' ? '도착' : 'End'
      marker.append(arrow, pinLabel)
      destinationOverlayRef.current = new api.CustomOverlay({
        map,
        position: new api.LatLng(destinationPoint.lat, destinationPoint.lng),
        content: marker,
        xAnchor: .5,
        yAnchor: 1,
        zIndex: 20,
      })
    }
    return () => { destinationOverlayRef.current?.setMap(null); destinationOverlayRef.current = null }
  }, [customDestination, locale, points, safeRoutePath, selectedStop, status])

  useEffect(() => {
    const map = mapRef.current
    if (!map || status !== 'ready') return
    routeOverlaysRef.current.forEach(overlay => overlay.setMap(showCourse ? map : null))
  }, [showCourse, status])

  useEffect(() => {
    const map = mapRef.current
    const api = apiRef.current
    if (!map || !api || status !== 'ready' || hasDestination || !locationFocusRequest || locationFocusRequest === lastLocationFocusRequestRef.current || !userLocation) return
    lastLocationFocusRequestRef.current = locationFocusRequest
    map.setLevel(4, { animate: false })
    map.setCenter(new api.LatLng(userLocation.lat, userLocation.lng))
    window.requestAnimationFrame(() => map.relayout())
  }, [hasDestination, locationFocusRequest, status, userLocation])

  useEffect(() => {
    const map = mapRef.current, api = apiRef.current
    if (!map || !api || status !== 'ready') return
    accessOverlaysRef.current.forEach(overlay => overlay.setMap(null))
    accessOverlaysRef.current = []
    if (!showCourse || safeRoutePath || !safeAccessPath) return
    const path = safeAccessPath.map(([lng, lat]) => new api.LatLng(lat, lng))
    accessOverlaysRef.current.push(new api.Polyline({ map, path, strokeWeight: 9, strokeColor: '#ffffff', strokeOpacity: .98, strokeStyle: 'solid' }))
    accessOverlaysRef.current.push(new api.Polyline({ map, path, strokeWeight: 5, strokeColor: '#ffffff', strokeOpacity: 1, strokeStyle: accessEstimated ? 'shortdash' : 'solid' }))
  }, [accessEstimated, safeAccessPath, safeRoutePath, showCourse, status])

  useEffect(() => {
    const map = mapRef.current
    const api = apiRef.current
    walkOverlaysRef.current.forEach(overlay => overlay.setMap(null))
    walkOverlaysRef.current = []
    if (!map || !api || status !== 'ready' || !showCourse || !safeWalkPath) return
    const path = safeWalkPath.map(([lng, lat]) => new api.LatLng(lat, lng))
    walkOverlaysRef.current.push(new api.Polyline({ map, path, strokeWeight: 8, strokeColor: '#ffffff', strokeOpacity: 1, strokeStyle: 'solid' }))
    walkOverlaysRef.current.push(new api.Polyline({ map, path, strokeWeight: 4, strokeColor: '#e33d3d', strokeOpacity: 1, strokeStyle: 'shortdash' }))
    return () => { walkOverlaysRef.current.forEach(overlay => overlay.setMap(null)); walkOverlaysRef.current = [] }
  }, [safeWalkPath, showCourse, status])

  useEffect(() => {
    const map = mapRef.current
    const api = apiRef.current
    if (!map || !api || status !== 'ready') return
    sceneryOverlaysRef.current.forEach(overlay => overlay.setMap(null))
    sceneryOverlaysRef.current = []
    if (!showCourse) return
    const path = safeRoutePath?.map(([lng, lat]) => ({ lat, lng })) ?? points
    const riderOverlays: Array<{ overlay: KakaoOverlay; phase: number; person: HTMLElement }> = []
    let riderFrame = 0
    if (showRiders) {
      const lonLatPath = path.map(point => [point.lng, point.lat] as LonLat)
      const motion = createRouteMotion(lonLatPath)
      const routeLength = motion?.lengthMeters ?? 0
      const riderCount = Math.max(8, Math.min(14, Math.round(routeLength / 1400)))
      Array.from({ length: riderCount }, (_, index) => {
        const position = motion?.pointAt(index / riderCount).point
        return position ? { lat: position[1], lng: position[0] } : null
      }).filter((point): point is MapPoint => point !== null).forEach((point, index) => {
        const person = createCyclistMarker(index, locale)
        person.style.width = '38px'
        person.style.height = '60px'
        const overlay = new api.CustomOverlay({ map, position: new api.LatLng(point.lat, point.lng), content: person, xAnchor: .5, yAnchor: 1, zIndex: 4 })
        sceneryOverlaysRef.current.push(overlay)
        riderOverlays.push({ overlay, phase: index / riderCount, person })
      })
      if (motion && riderOverlays.length) {
        const startedAt = performance.now()
        let lastUpdate = 0
        const moveRiders = (now: number) => {
          if (now - lastUpdate < 45) { riderFrame = window.requestAnimationFrame(moveRiders); return }
          lastUpdate = now
          const traveled = (now - startedAt) / 1000 * 3.2 / motion.lengthMeters
          riderOverlays.forEach(({ overlay, phase, person }) => {
            const position = motion.pointAt(traveled + phase)
            overlay.setPosition?.(new api.LatLng(position.point[1], position.point[0]))
            person.style.setProperty('--rider-heading', `${position.bearing}deg`)
          })
          riderFrame = window.requestAnimationFrame(moveRiders)
        }
        riderFrame = window.requestAnimationFrame(moveRiders)
      }
    }
    return () => {
      window.cancelAnimationFrame(riderFrame)
      sceneryOverlaysRef.current.forEach(overlay => overlay.setMap(null))
      sceneryOverlaysRef.current = []
    }
  }, [locale, points, safeRoutePath, showCourse, showRiders, status])

  useEffect(() => {
    const map = mapRef.current
    const api = apiRef.current
    if (!map || !api || status !== 'ready') return
    conditionOverlaysRef.current.forEach(overlay => overlay.setMap(null))
    conditionOverlaysRef.current = showRoadInfo ? routeConditions.map(condition => {
      const signal = condition.kind === 'signal'
      const label = signal
        ? locale === 'ko' ? '지도에 기록된 신호등 · 실시간 아님' : 'Mapped signal · not live'
        : `${condition.kind === 'uphill' ? (locale === 'ko' ? '오르막' : 'Uphill') : (locale === 'ko' ? '내리막' : 'Downhill')} ${condition.grade}%`
      const marker = document.createElement('div')
      marker.className = `tour-road-event tour-road-event--${condition.kind} kakao-road-event`
      marker.setAttribute('role', 'img')
      marker.setAttribute('aria-label', label)
      marker.title = label
      if (condition.kind !== 'signal') marker.textContent = `${condition.kind === 'uphill' ? '↗' : '↘'} ${condition.grade}%`
      return new api.CustomOverlay({
        map,
        position: new api.LatLng(condition.lat, condition.lng),
        content: marker,
        xAnchor: .5,
        yAnchor: .5,
        zIndex: 6,
      })
    }) : []
    return () => {
      conditionOverlaysRef.current.forEach(overlay => overlay.setMap(null))
      conditionOverlaysRef.current = []
    }
  }, [locale, routeConditions, showRoadInfo, status])

  useEffect(() => {
    const map = mapRef.current
    const api = apiRef.current
    if (!map || !api || status !== 'ready') return
    if (!showBikeStations) return
    const overlays = bikeStations.map(station => {
      const marker = document.createElement('span')
      marker.className = 'tour-live-bike-marker'
      const count = document.createElement('span')
      count.textContent = station.available === null ? '–' : String(station.available)
      const popup = document.createElement('span')
      popup.className = 'tour-live-bike-popup'
      const name = document.createElement('strong')
      name.textContent = station.name
      const separator = document.createElement('i')
      separator.textContent = '—'
      const available = document.createElement('small')
      available.className = 'tour-live-bike-count'
      available.textContent = station.available === null
        ? (locale === 'ko' ? '실시간 잔여 대수 확인 불가' : 'Live count unavailable')
        : locale === 'ko' ? `${station.available}대 대여 가능` : `${station.available} bikes available`
      popup.append(name, separator, available)
      marker.append(count, popup)
      marker.title = `${station.name} · ${available.textContent}`
      marker.setAttribute('role', 'button')
      marker.tabIndex = 0
      marker.setAttribute('aria-expanded', 'false')
      marker.setAttribute('aria-label', marker.title)
      const togglePopup = () => {
        const isOpen = marker.classList.toggle('is-open')
        marker.setAttribute('aria-expanded', String(isOpen))
      }
      marker.addEventListener('click', togglePopup)
      marker.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          togglePopup()
        }
      })
      return new api.CustomOverlay({ map, position: new api.LatLng(station.lat, station.lng), content: marker, xAnchor: .5, yAnchor: 1, zIndex: 9 })
    })
    return () => overlays.forEach(overlay => overlay.setMap(null))
  }, [bikeStations, locale, showBikeStations, status])

  useEffect(() => {
    const map = mapRef.current
    const api = apiRef.current
    if (!map || !api || status !== 'ready') return
    if (!showAmenities) return
    const glyphs: Record<RouteAmenity['kind'], string> = { pump: '🔧', water: '💧', toilet: '🚻', convenience: '🏪' , parking: '🚲', repair: '🛠️', visit: '📍'}
    const labels: Record<RouteAmenity['kind'], string> = locale === 'ko'
      ? { pump: '공기주입기', water: '음수대', toilet: '공중화장실', convenience: '편의점' , parking: '자전거 주차', repair: '자전거 수리', visit: '관광 명소'}
      : { pump: 'Bike pump', water: 'Drinking water', toilet: 'Public toilet', convenience: 'Convenience store' , parking: 'Bicycle parking', repair: 'Bicycle repair', visit: 'Attraction'}
    const shortLabels: Record<RouteAmenity['kind'], string> = locale === 'ko'
      ? { pump: '공기', water: '물', toilet: '화장실', convenience: '편의점' , parking: '주차', repair: '수리', visit: '명소'}
      : { pump: 'Air', water: 'Water', toilet: 'WC', convenience: 'Shop' , parking: 'Park', repair: 'Repair', visit: 'Visit'}
    const overlays = amenities.map(amenity => {
      const marker = document.createElement('span')
      marker.className = `tour-amenity-icon tour-amenity-icon--${amenity.kind}`
      marker.innerHTML = `<span>${glyphs[amenity.kind]}</span><b>${shortLabels[amenity.kind]}</b>`
      marker.title = `${labels[amenity.kind]}${amenity.name ? ` · ${amenity.name}` : ''}`
      marker.setAttribute('role', 'img')
      marker.setAttribute('aria-label', marker.title)
      return new api.CustomOverlay({ map, position: new api.LatLng(amenity.lat, amenity.lng), content: marker, xAnchor: .5, yAnchor: .5, zIndex: 8 })
    })
    return () => overlays.forEach(overlay => overlay.setMap(null))
  }, [amenities, locale, showAmenities, status])

  useEffect(() => {
    const map = mapRef.current
    const api = apiRef.current
    if (!map || !api || status !== 'ready') return
    restaurantOverlaysRef.current.forEach(overlay => overlay.setMap(null))
    restaurantOverlaysRef.current = []
    if (!showRestaurants) return
    restaurantOverlaysRef.current = restaurants.map(place => {
      const marker = document.createElement('button')
      marker.type = 'button'
      marker.className = `tour-restaurant-map-marker tour-restaurant-map-marker--${place.kind}`
      marker.textContent = place.kind === 'cafe' ? '☕' : '식'
      const kind = place.kind === 'cafe' ? (locale === 'ko' ? '카페' : 'Cafe') : (locale === 'ko' ? '음식점' : 'Restaurant')
      marker.setAttribute('aria-label', `${place.name} · ${kind}`)
      marker.title = `${place.name} · ${kind}${place.cuisine ? ` · ${place.cuisine}` : ''}`
      return new api.CustomOverlay({ map, position: new api.LatLng(place.lat, place.lng), content: marker, xAnchor: .5, yAnchor: 1, zIndex: 7 })
    })
  }, [locale, restaurants, showRestaurants, status])

  useEffect(() => {
    const map = mapRef.current
    const api = apiRef.current
    if (!map || !api || status !== 'ready') return
    const clearOverlays = () => {
      cctvOverlaysRef.current.forEach(overlay => overlay.setMap(null))
      cctvOverlaysRef.current = []
    }
    const renderCameras = () => {
      clearOverlays()
      if (!showCctv) return
      const bounds = map.getBounds()
      const southWest = bounds.getSouthWest(), northEast = bounds.getNorthEast()
      const south = Math.min(southWest.getLat(), northEast.getLat()), north = Math.max(southWest.getLat(), northEast.getLat())
      const west = Math.min(southWest.getLng(), northEast.getLng()), east = Math.max(southWest.getLng(), northEast.getLng())
      const visible = cctvCameras.filter(camera => camera.lat >= south && camera.lat <= north && camera.lng >= west && camera.lng <= east)
      const level = map.getLevel()
      const latCell = Math.max(.00045, Math.sqrt(Math.max(.000001, (north - south) * (east - west) / 420)))
      const lngCell = latCell / Math.max(.45, Math.cos(((south + north) / 2) * Math.PI / 180))
      const groups = new Map<string, PublicCamera[]>()
      visible.forEach(camera => {
        const key = `${Math.floor(camera.lat / latCell)}:${Math.floor(camera.lng / lngCell)}`
        const group = groups.get(key)
        if (group) group.push(camera)
        else groups.set(key, [camera])
      })
      groups.forEach(group => {
        const lat = group.reduce((sum, camera) => sum + camera.lat, 0) / group.length
        const lng = group.reduce((sum, camera) => sum + camera.lng, 0) / group.length
        if (group.length > 1) {
          const button = document.createElement('button')
          button.type = 'button'
          button.className = 'tour-cctv-cluster-marker kakao-cctv-marker'
          button.textContent = group.length.toLocaleString()
          button.setAttribute('aria-label', `${group.length} public CCTV locations`)
          button.title = locale === 'ko' ? `CCTV ${group.length}곳 · 눌러서 확대` : `${group.length} CCTV locations · click to zoom`
          button.addEventListener('click', () => {
            map.setLevel(Math.max(1, level - 2), { animate: false })
            map.setCenter(new api.LatLng(lat, lng))
          })
          cctvOverlaysRef.current.push(new api.CustomOverlay({ map, position: new api.LatLng(lat, lng), content: button, xAnchor: .5, yAnchor: .5, zIndex: 4 }))
          return
        }
        const camera = group[0]
      const marker = document.createElement('button')
      marker.type = 'button'
      marker.className = 'tour-cctv-map-marker kakao-cctv-marker'
      marker.setAttribute('aria-label', `${camera.purpose || (locale === 'ko' ? '공공 CCTV' : 'Public CCTV')}: ${camera.name}`)
      marker.title = `${camera.purpose || (locale === 'ko' ? '공공 CCTV' : 'Public CCTV')} · ${camera.name}`
      marker.textContent = 'C'
      const position = new api.LatLng(camera.lat, camera.lng)
      marker.addEventListener('click', () => {
        if (activePopupIdRef.current === camera.id) {
          activePopupRef.current?.setMap(null)
          activePopupRef.current = null
          activePopupIdRef.current = null
          return
        }
        activePopupRef.current?.setMap(null)
        activePopupRef.current = null
        activePopupIdRef.current = null
        const overlay = new api.CustomOverlay({
          map,
          position,
          content: makeCctvPopup(camera, locale, () => {
            overlay.setMap(null)
            if (activePopupRef.current === overlay) activePopupRef.current = null
            if (activePopupIdRef.current === camera.id) activePopupIdRef.current = null
          }),
          xAnchor: .5,
          yAnchor: 1.12,
          zIndex: 20,
        })
        activePopupRef.current = overlay
        activePopupIdRef.current = camera.id
      })
      cctvOverlaysRef.current.push(new api.CustomOverlay({ map, position, content: marker, xAnchor: .5, yAnchor: 1, zIndex: 4 }))
      })
    }
    activePopupRef.current?.setMap(null)
    activePopupRef.current = null
    activePopupIdRef.current = null
    renderCameras()
    api.event.addListener(map, 'idle', renderCameras)
    return () => {
      api.event.removeListener(map, 'idle', renderCameras)
      clearOverlays()
    }
  }, [cctvCameras, locale, showCctv, status])

  useEffect(() => {
    const map = mapRef.current
    const api = apiRef.current
    if (!map || !api || status !== 'ready') return
    map.setMapTypeId(kakaoMapType === 'skyview' ? api.MapTypeId.SKYVIEW : api.MapTypeId.ROADMAP)
  }, [kakaoMapType, status])

  useEffect(() => {
    const map = mapRef.current
    const api = apiRef.current
    if (!map || !api || status !== 'ready') return
    userOverlayRef.current?.setMap(null)
    userOverlayRef.current = null
    if (!userLocation) return
    const marker = document.createElement('div')
    marker.className = 'tour-journey-pin tour-journey-pin--start'
    const pinLabel = document.createElement('span')
    pinLabel.textContent = locale === 'ko' ? '출발' : 'Start'
    marker.append(pinLabel)
    marker.setAttribute('role', 'img')
    const locationLabel = locale === 'ko' ? '내 위치' : 'You are here'
    marker.setAttribute('aria-label', userLocation.accuracy === undefined ? locationLabel : `${locationLabel} · ±${Math.round(userLocation.accuracy)} m`)
    marker.title = userLocation.accuracy === undefined ? locationLabel : `${locationLabel} · ±${Math.round(userLocation.accuracy)} m`
    userOverlayRef.current = new api.CustomOverlay({
      map,
      position: new api.LatLng(userLocation.lat, userLocation.lng),
      content: marker,
      xAnchor: .5,
      yAnchor: .5,
      zIndex: 12,
    })
  }, [locale, status, userLocation])

  if (status === 'error') return <div className="kakao-route-map kakao-route-map--error">
    <div className="kakao-route-fallback">{fallback}</div>
  </div>

  return <div className="kakao-route-map">
    {status === 'loading' && <div className="kakao-route-underlay">{fallback}</div>}
    <div ref={host} className="kakao-route-host" role="region" aria-label={locale === 'ko' ? `${route.titleKo} 카카오 지도` : `${route.title} Kakao map`}
      style={{ visibility: status === 'loading' ? 'hidden' : 'visible' }} />
    {status === 'loading' && <p className="google-route-loading" role="status">{locale === 'ko' ? '카카오 지도를 불러오는 중…' : 'Loading Kakao map…'}</p>}
  </div>
}

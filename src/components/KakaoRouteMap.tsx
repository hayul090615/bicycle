import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { getTouristStation, type TourSeason, type TouristRoute } from '../data/touristRoutes'
import { hasKakaoMapsKey, loadKakaoMaps, type KakaoMap, type KakaoMapsApi, type KakaoOverlay } from '../services/kakaoMaps'
import type { LonLat } from '../services/bikeRoute'
import type { PublicCamera } from '../services/publicCctv'
import type { RouteBikeLane, RouteCondition, RouteRestaurant } from '../services/routeConditions'
import riderSpriteUrl from '../assets/map-riders.png'
import { createRouteTreeMarker } from './routeTreeMarker'

type MapPoint = { lat: number; lng: number }

function routeSamples(path: MapPoint[], spacing: number, offsetMeters: number) {
  if (path.length < 2) return []
  const segmentLengths = path.slice(1).map((point, index) => {
    const previous = path[index]
    const meanLatitude = (point.lat + previous.lat) / 2 * Math.PI / 180
    return Math.hypot((point.lng - previous.lng) * 111_000 * Math.cos(meanLatitude), (point.lat - previous.lat) * 111_000)
  })
  const total = segmentLengths.reduce((sum, value) => sum + value, 0)
  const samples: MapPoint[] = []
  let segmentIndex = 0
  let segmentStart = 0
  for (let distance = spacing * .55; distance < total; distance += spacing) {
    while (segmentIndex < segmentLengths.length - 1 && segmentStart + segmentLengths[segmentIndex] < distance) {
      segmentStart += segmentLengths[segmentIndex]
      segmentIndex += 1
    }
    const segmentLength = segmentLengths[segmentIndex]
    if (!segmentLength) continue
    const from = path[segmentIndex]
    const to = path[segmentIndex + 1]
    const ratio = Math.max(0, Math.min(1, (distance - segmentStart) / segmentLength))
    const meanLatitude = (from.lat + to.lat) / 2 * Math.PI / 180
    const east = (to.lng - from.lng) * 111_000 * Math.cos(meanLatitude)
    const north = (to.lat - from.lat) * 111_000
    const bearing = (Math.atan2(east, north) * 180 / Math.PI + 360) % 360
    const side = samples.length % 2 === 0 ? 1 : -1
    const sideRadians = (bearing + 90 * side) * Math.PI / 180
    const lat = from.lat + (north * ratio + Math.cos(sideRadians) * offsetMeters) / 111_000
    const lng = from.lng + (east * ratio + Math.sin(sideRadians) * offsetMeters) / (111_000 * Math.max(.2, Math.cos(meanLatitude)))
    samples.push({ lat, lng })
  }
  return samples
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

export function KakaoRouteMap({ route, routePath, accessPath, accessEstimated, bikeLanes, showBikeLanes, season, showRiders, routeConditions, restaurants, showCourse, showRestaurants, showRoadInfo, showCctv, cctvCameras, locationFocusRequest, locale, userLocation, selectedStop, onSelectStop, onHoverStop, onFocusTree, fallback }: {
  route: TouristRoute
  routePath: LonLat[] | null
  accessPath: LonLat[] | null
  accessEstimated: boolean
  bikeLanes: RouteBikeLane[]
  showBikeLanes: boolean
  season: TourSeason
  showRiders: boolean
  routeConditions: RouteCondition[]
  restaurants: RouteRestaurant[]
  showCourse: boolean
  showRestaurants: boolean
  showRoadInfo: boolean
  showCctv: boolean
  cctvCameras: PublicCamera[]
  locationFocusRequest: number
  locale: 'en' | 'ko'
  userLocation: { lat: number; lng: number; heading?: number } | null
  selectedStop: number | null
  onSelectStop: (index: number) => void
  onHoverStop: (index: number | null) => void
  onFocusTree: (point: LonLat) => void
  fallback: ReactNode
}) {
  const host = useRef<HTMLDivElement>(null)
  const mapRef = useRef<KakaoMap | null>(null)
  const apiRef = useRef<KakaoMapsApi | null>(null)
  const routeOverlaysRef = useRef<KakaoOverlay[]>([])
  const accessOverlaysRef = useRef<KakaoOverlay[]>([])
  const conditionOverlaysRef = useRef<KakaoOverlay[]>([])
  const restaurantOverlaysRef = useRef<KakaoOverlay[]>([])
  const cctvOverlaysRef = useRef<KakaoOverlay[]>([])
  const bikeLaneOverlaysRef = useRef<KakaoOverlay[]>([])
  const sceneryOverlaysRef = useRef<KakaoOverlay[]>([])
  const userOverlayRef = useRef<KakaoOverlay | null>(null)
  const activePopupRef = useRef<KakaoOverlay | null>(null)
  const activePopupIdRef = useRef<string | null>(null)
  const lastLocationFocusRequestRef = useRef(0)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const points = useMemo(() => route.stops.map(stop => {
    const station = getTouristStation(stop.stationId)
    return { lat: station.lat, lng: station.lng }
  }), [route])
  const linePoints = useMemo(() => routePath?.map(([lng, lat]) => ({ lat, lng })) ?? points, [routePath, points])

  useEffect(() => {
    let disposed = false
    let timeout = 0
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
      map.addControl(new api.MapTypeControl(), api.ControlPosition.TOPRIGHT)
      map.addControl(new api.ZoomControl(), api.ControlPosition.RIGHT)
      apiRef.current = api
      mapRef.current = map
      window.requestAnimationFrame(() => map.relayout())
      setStatus('ready')
    }).catch(() => {
      window.clearTimeout(timeout)
      if (!disposed) setStatus('error')
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
      bikeLaneOverlaysRef.current.forEach(overlay => overlay.setMap(null))
      sceneryOverlaysRef.current.forEach(overlay => overlay.setMap(null))
      userOverlayRef.current?.setMap(null)
      activePopupRef.current?.setMap(null)
      routeOverlaysRef.current = []
      accessOverlaysRef.current = []
      conditionOverlaysRef.current = []
      restaurantOverlaysRef.current = []
      cctvOverlaysRef.current = []
      bikeLaneOverlaysRef.current = []
      sceneryOverlaysRef.current = []
      userOverlayRef.current = null
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
    routeOverlaysRef.current.forEach(overlay => overlay.setMap(null))
    routeOverlaysRef.current = []
    activePopupRef.current?.setMap(null)
    activePopupRef.current = null
    activePopupIdRef.current = null

    const path = linePoints.map(point => new api.LatLng(point.lat, point.lng))
    const casing = new api.Polyline({ map, path, strokeWeight: 15, strokeColor: '#ffffff', strokeOpacity: .98, strokeStyle: 'solid' })
    const line = new api.Polyline({ map, path, strokeWeight: 8, strokeColor: '#ff3b30', strokeOpacity: 1, strokeStyle: 'solid' })
    routeOverlaysRef.current.push(casing, line)
    route.stops.forEach((stop, index) => {
      const label = locale === 'ko' ? stop.placeKo : stop.place
      const button = document.createElement('button')
      button.type = 'button'
      button.className = `tour-3d-stop-marker kakao-stop-marker${selectedStop === index ? ' is-selected' : ''}`
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

    if (accessPath && accessPath.length >= 2) {
      const framed = selectedStop === null ? [...linePoints, ...accessPath.map(([lng, lat]) => ({ lng, lat }))] : accessPath.map(([lng, lat]) => ({ lng, lat }))
      const south = Math.min(...framed.map(point => point.lat)), north = Math.max(...framed.map(point => point.lat))
      const west = Math.min(...framed.map(point => point.lng)), east = Math.max(...framed.map(point => point.lng))
      const spanKm = Math.max((north - south) * 111, (east - west) * 88)
      map.setLevel(spanKm > 25 ? 9 : spanKm > 16 ? 8 : spanKm > 10 ? 7 : spanKm > 5 ? 6 : 5, { animate: false })
      map.setCenter(new api.LatLng((south + north) / 2, (west + east) / 2))
    } else if (selectedStop !== null && points[selectedStop]) {
      map.setLevel(4, { animate: true })
      map.setCenter(new api.LatLng(points[selectedStop].lat, points[selectedStop].lng))
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
  }, [accessPath, linePoints, locale, onHoverStop, onSelectStop, points, route, selectedStop, status])

  useEffect(() => {
    const map = mapRef.current
    if (!map || status !== 'ready') return
    routeOverlaysRef.current.forEach(overlay => overlay.setMap(showCourse ? map : null))
  }, [showCourse, status])

  useEffect(() => {
    const map = mapRef.current
    const api = apiRef.current
    if (!map || !api || status !== 'ready' || !locationFocusRequest || locationFocusRequest === lastLocationFocusRequestRef.current || !userLocation) return
    lastLocationFocusRequestRef.current = locationFocusRequest
    map.setLevel(4, { animate: true })
    map.setCenter(new api.LatLng(userLocation.lat, userLocation.lng))
  }, [locationFocusRequest, status, userLocation])

  useEffect(() => {
    const map = mapRef.current, api = apiRef.current
    if (!map || !api || status !== 'ready') return
    accessOverlaysRef.current.forEach(overlay => overlay.setMap(null))
    accessOverlaysRef.current = []
    if (!showCourse || !accessPath || accessPath.length < 2) return
    const path = accessPath.map(([lng, lat]) => new api.LatLng(lat, lng))
    accessOverlaysRef.current.push(new api.Polyline({ map, path, strokeWeight: 15, strokeColor: '#ffffff', strokeOpacity: .98, strokeStyle: 'solid' }))
    accessOverlaysRef.current.push(new api.Polyline({ map, path, strokeWeight: 8, strokeColor: '#ff3b30', strokeOpacity: 1, strokeStyle: accessEstimated ? 'shortdash' : 'solid' }))
  }, [accessEstimated, accessPath, showCourse, status])

  useEffect(() => {
    const map = mapRef.current
    const api = apiRef.current
    if (!map || !api || status !== 'ready') return
    bikeLaneOverlaysRef.current.forEach(overlay => overlay.setMap(null))
    bikeLaneOverlaysRef.current = []
    if (!showBikeLanes) return
    bikeLanes.forEach(lane => {
      if (lane.points.length < 2) return
      const path = lane.points.map(([lng, lat]) => new api.LatLng(lat, lng))
      bikeLaneOverlaysRef.current.push(new api.Polyline({ map, path, strokeWeight: 8, strokeColor: '#ffffff', strokeOpacity: .95, strokeStyle: 'solid' }))
      bikeLaneOverlaysRef.current.push(new api.Polyline({ map, path, strokeWeight: 4, strokeColor: '#2585a6', strokeOpacity: .98, strokeStyle: 'solid' }))
    })
    return () => {
      bikeLaneOverlaysRef.current.forEach(overlay => overlay.setMap(null))
      bikeLaneOverlaysRef.current = []
    }
  }, [bikeLanes, showBikeLanes, status])

  useEffect(() => {
    const map = mapRef.current
    const api = apiRef.current
    if (!map || !api || status !== 'ready') return
    sceneryOverlaysRef.current.forEach(overlay => overlay.setMap(null))
    sceneryOverlaysRef.current = []
    if (!showCourse) return
    const path = routePath?.map(([lng, lat]) => ({ lat, lng })) ?? points
    const treeSamples = routeSamples(path, 240, 10)
    treeSamples.forEach((point, index) => {
      const tree = createRouteTreeMarker(season, locale, index, () => onFocusTree([point.lng, point.lat]))
      sceneryOverlaysRef.current.push(new api.CustomOverlay({ map, position: new api.LatLng(point.lat, point.lng), content: tree, xAnchor: .5, yAnchor: 1, zIndex: 3 }))
    })
    if (showRiders) {
      routeSamples(path, 760, 9).forEach((point, index) => {
        const person = document.createElement('span')
        person.className = `tour-map-person tour-map-person--${index % 3}`
        person.style.backgroundImage = `url("${riderSpriteUrl}")`
        person.setAttribute('role', 'img')
        person.setAttribute('aria-label', locale === 'ko' ? '자전거 도로의 라이더' : 'Cyclist on the route')
        sceneryOverlaysRef.current.push(new api.CustomOverlay({ map, position: new api.LatLng(point.lat, point.lng), content: person, xAnchor: .5, yAnchor: 1, zIndex: 4 }))
      })
    }
    return () => {
      sceneryOverlaysRef.current.forEach(overlay => overlay.setMap(null))
      sceneryOverlaysRef.current = []
    }
  }, [locale, onFocusTree, points, routePath, season, showCourse, showRiders, status])

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
            map.setLevel(Math.max(1, level - 2), { animate: true })
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
    api.addListener(map, 'idle', renderCameras)
    return () => {
      api.removeListener(map, 'idle', renderCameras)
      clearOverlays()
    }
  }, [cctvCameras, locale, showCctv, status])

  useEffect(() => {
    const map = mapRef.current
    const api = apiRef.current
    if (!map || !api || status !== 'ready') return
    userOverlayRef.current?.setMap(null)
    userOverlayRef.current = null
    if (!userLocation) return
    const marker = document.createElement('div')
    marker.className = 'tour-user-location-marker kakao-user-marker'
    marker.style.setProperty('--tour-user-heading', `${userLocation.heading ?? 0}deg`)
    marker.setAttribute('role', 'img')
    marker.setAttribute('aria-label', locale === 'ko' ? '내 위치' : 'You are here')
    marker.title = locale === 'ko' ? '내 위치' : 'You are here'
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
    <p className="tour-earth-notice" role="status">{locale === 'ko'
      ? <>카카오 지도 인증에 실패해 기본 지도를 표시합니다. 카카오디벨로퍼스의 <strong>앱 → 플랫폼 키 → JavaScript 키 → JavaScript SDK 도메인</strong>에 <code>https://hayul090615.github.io/</code>를 등록하고, <strong>카카오맵 사용 설정을 ON</strong>으로 켜 주세요. GitHub의 <code>VITE_KAKAO_MAP_KEY</code>에는 같은 앱의 JavaScript 키가 들어가야 합니다.</>
      : <>Kakao Maps authentication failed, so the fallback map is shown. Register <code>https://hayul090615.github.io/</code> under App → Platform keys → JavaScript key → JavaScript SDK domains, turn Kakao Map on, and set the matching app's JavaScript key as GitHub's <code>VITE_KAKAO_MAP_KEY</code>.</>}</p>
    <div className="kakao-route-fallback">{fallback}</div>
  </div>

  return <div className="kakao-route-map">
    {status === 'loading' && <div className="kakao-route-underlay">{fallback}</div>}
    <div ref={host} className="kakao-route-host" role="region" aria-label={locale === 'ko' ? `${route.titleKo} 카카오 지도` : `${route.title} Kakao map`}
      style={{ visibility: status === 'loading' ? 'hidden' : 'visible' }} />
    {status === 'loading' && <p className="google-route-loading" role="status">{locale === 'ko' ? '카카오 지도를 불러오는 중…' : 'Loading Kakao map…'}</p>}
  </div>
}

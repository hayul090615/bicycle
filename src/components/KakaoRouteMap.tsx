import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { getTouristStation, type TouristRoute } from '../data/touristRoutes'
import { hasKakaoMapsKey, loadKakaoMaps, type KakaoMap, type KakaoMapsApi, type KakaoOverlay } from '../services/kakaoMaps'
import type { LonLat } from '../services/bikeRoute'
import type { PublicCamera } from '../services/publicCctv'
import type { RouteCondition } from '../services/routeConditions'

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

export function KakaoRouteMap({ route, routePath, accessPath, accessEstimated, routeConditions, cctvCameras, locale, userLocation, selectedStop, onSelectStop, onHoverStop, fallback }: {
  route: TouristRoute
  routePath: LonLat[] | null
  accessPath: LonLat[] | null
  accessEstimated: boolean
  routeConditions: RouteCondition[]
  cctvCameras: PublicCamera[]
  locale: 'en' | 'ko'
  userLocation: { lat: number; lng: number } | null
  selectedStop: number | null
  onSelectStop: (index: number) => void
  onHoverStop: (index: number | null) => void
  fallback: ReactNode
}) {
  const host = useRef<HTMLDivElement>(null)
  const mapRef = useRef<KakaoMap | null>(null)
  const apiRef = useRef<KakaoMapsApi | null>(null)
  const routeOverlaysRef = useRef<KakaoOverlay[]>([])
  const accessOverlaysRef = useRef<KakaoOverlay[]>([])
  const conditionOverlaysRef = useRef<KakaoOverlay[]>([])
  const cctvOverlaysRef = useRef<KakaoOverlay[]>([])
  const userOverlayRef = useRef<KakaoOverlay | null>(null)
  const activePopupRef = useRef<KakaoOverlay | null>(null)
  const activePopupIdRef = useRef<string | null>(null)
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
      cctvOverlaysRef.current.forEach(overlay => overlay.setMap(null))
      userOverlayRef.current?.setMap(null)
      activePopupRef.current?.setMap(null)
      routeOverlaysRef.current = []
      accessOverlaysRef.current = []
      conditionOverlaysRef.current = []
      cctvOverlaysRef.current = []
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
    const casing = new api.Polyline({ map, path, strokeWeight: 10, strokeColor: '#ffffff', strokeOpacity: .95, strokeStyle: 'solid' })
    const line = new api.Polyline({ map, path, strokeWeight: 5, strokeColor: '#08765b', strokeOpacity: 1, strokeStyle: 'solid' })
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
    const map = mapRef.current, api = apiRef.current
    if (!map || !api || status !== 'ready') return
    accessOverlaysRef.current.forEach(overlay => overlay.setMap(null))
    accessOverlaysRef.current = []
    if (!accessPath || accessPath.length < 2) return
    const path = accessPath.map(([lng, lat]) => new api.LatLng(lat, lng))
    accessOverlaysRef.current.push(new api.Polyline({ map, path, strokeWeight: 10, strokeColor: '#ffffff', strokeOpacity: .98, strokeStyle: 'solid' }))
    accessOverlaysRef.current.push(new api.Polyline({ map, path, strokeWeight: 6, strokeColor: '#2479db', strokeOpacity: 1, strokeStyle: accessEstimated ? 'shortdash' : 'solid' }))
  }, [accessEstimated, accessPath, status])

  useEffect(() => {
    const map = mapRef.current
    const api = apiRef.current
    if (!map || !api || status !== 'ready') return
    conditionOverlaysRef.current.forEach(overlay => overlay.setMap(null))
    conditionOverlaysRef.current = routeConditions.map(condition => {
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
    })
    return () => {
      conditionOverlaysRef.current.forEach(overlay => overlay.setMap(null))
      conditionOverlaysRef.current = []
    }
  }, [locale, routeConditions, status])

  useEffect(() => {
    const map = mapRef.current
    const api = apiRef.current
    if (!map || !api || status !== 'ready') return
    cctvOverlaysRef.current.forEach(overlay => overlay.setMap(null))
    cctvOverlaysRef.current = []
    activePopupRef.current?.setMap(null)
    activePopupRef.current = null
    activePopupIdRef.current = null
    cctvCameras.forEach(camera => {
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
  }, [cctvCameras, locale, status])

  useEffect(() => {
    const map = mapRef.current
    const api = apiRef.current
    if (!map || !api || status !== 'ready') return
    userOverlayRef.current?.setMap(null)
    userOverlayRef.current = null
    if (!userLocation) return
    const marker = document.createElement('div')
    marker.className = 'tour-user-location-marker kakao-user-marker'
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
      ? '카카오 지도를 불러오지 못해 기본 지도를 표시합니다. 키의 도메인 등록과 카카오맵 사용 설정을 확인해 주세요.'
      : 'Kakao Maps could not load, so the fallback route map is shown. Check the key domain and Kakao Map activation.'}</p>
    <div className="kakao-route-fallback">{fallback}</div>
  </div>

  return <div className="kakao-route-map">
    {status === 'loading' && <div className="kakao-route-underlay">{fallback}</div>}
    <div ref={host} className="kakao-route-host" role="region" aria-label={locale === 'ko' ? `${route.titleKo} 카카오 지도` : `${route.title} Kakao map`}
      style={{ visibility: status === 'loading' ? 'hidden' : 'visible' }} />
    {status === 'loading' && <p className="google-route-loading" role="status">{locale === 'ko' ? '카카오 지도를 불러오는 중…' : 'Loading Kakao map…'}</p>}
  </div>
}

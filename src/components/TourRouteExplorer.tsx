import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet'
import { latLngBounds, type LatLngExpression } from 'leaflet'
import { getTouristStation, type TourCategory, type TourSeason, type TouristRoute } from '../data/touristRoutes'
import { GoogleRoute3D } from './GoogleRoute3D'
import { hasGoogleMapsKey } from '../services/googleMaps3d'
import { KakaoRouteMap } from './KakaoRouteMap'
import { hasKakaoMapsKey } from '../services/kakaoMaps'
import { downloadEarthRoute, googleEarthUrl } from '../utils/googleEarth'
import { findSceneryPhoto, type SceneryPhoto } from '../services/sceneryPhotos'
import { getSolarPosition, todayInSeoul } from '../utils/solarPosition'
import { fetchBikePath, fetchBikeRoute, type LonLat } from '../services/bikeRoute'
import { usePublicCctvData } from '../hooks/usePublicCctvData'

const MapLibreRoute3D = lazy(() => import('./MapLibreRoute3D').then(module => ({ default: module.MapLibreRoute3D })))
const SEOUL_REFERENCE = { lat: 37.5665, lng: 126.978 }
type Coordinates = { lat: number; lng: number }
type RotationRequest = { direction: 'left' | 'right'; serial: number }
const categoryNames: Record<TourCategory, [string, string]> = {
  sightseeing: ['Sights', '관광'],
  fitness: ['Workout', '운동'],
  night: ['Night views', '야경'],
  seasonal: ['Seasons', '계절'],
}

function distanceMeters(from: Coordinates, to: Coordinates) {
  const radians = Math.PI / 180
  const latitude = (to.lat - from.lat) * radians
  const longitude = (to.lng - from.lng) * radians
  const arc = Math.sin(latitude / 2) ** 2 + Math.cos(from.lat * radians) * Math.cos(to.lat * radians) * Math.sin(longitude / 2) ** 2
  return 6371000 * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc))
}

function nearestStopDistance(route: TouristRoute, location: Coordinates) {
  return Math.min(...route.stops.map(stop => {
    const station = getTouristStation(stop.stationId)
    return distanceMeters(location, station)
  }))
}

function distanceLabel(meters: number) {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`
}

// A relaxed public-bike pace; sightseeing breaks and traffic signals are excluded.
function bikeMinutes(meters: number) {
  return Math.max(1, Math.ceil(meters / 200)) // 12 km/h = 200 m/min
}

function pathDistance(points: LonLat[]) {
  return points.slice(1).reduce((total, [lng, lat], index) => total + distanceMeters(
    { lng: points[index][0], lat: points[index][1] }, { lng, lat }), 0)
}

function seasonForToday(): TourSeason {
  const month = Number(todayInSeoul().slice(5, 7))
  if (month >= 3 && month <= 5) return 'spring'
  if (month >= 6 && month <= 8) return 'summer'
  if (month >= 9 && month <= 11) return 'autumn'
  return 'winter'
}

const seasonOptions: { id: TourSeason; en: string; ko: string; sceneryEn: string; sceneryKo: string }[] = [
  { id: 'spring', en: 'Spring', ko: '봄', sceneryEn: 'Blossoms · soft spring light', sceneryKo: '봄꽃과 부드러운 봄빛' },
  { id: 'summer', en: 'Summer', ko: '여름', sceneryEn: 'Deep green · summer sun', sceneryKo: '짙은 녹음과 여름 햇살' },
  { id: 'autumn', en: 'Autumn', ko: '가을', sceneryEn: 'Golden leaves · crisp air', sceneryKo: '황금빛 단풍과 맑은 공기' },
  { id: 'winter', en: 'Winter', ko: '겨울', sceneryEn: 'Snowfall · cool winter haze', sceneryKo: '눈발과 차분한 겨울빛' },
]

const seasonGuides: Record<TourSeason, { title: [string, string]; atmosphere: [string, string]; highlight: [string, string]; timing: [string, string]; advice: [string, string]; details: [string, string][] }> = {
  spring: {
    title: ['A riverside in bloom', '꽃빛이 번지는 강변'],
    atmosphere: ['Fresh air · blossom color · gentle light', '산뜻한 공기 · 봄꽃 색감 · 부드러운 햇빛'],
    highlight: ['Yeouido flowers, then a quiet Saetgang walk', '여의도 봄꽃길을 지나 샛강생태공원 산책'],
    timing: ['A quiet weekday morning', '한적한 평일 오전'],
    advice: ['Bloom dates shift each year. Expect crowds near festival areas and slow down around pedestrians.', '개화 시기는 해마다 다릅니다. 축제 구간은 붐빌 수 있으니 보행자 주변에서 속도를 줄이세요.'],
    details: [['Pink blossoms frame the path; fresh leaves brighten the riverside.', '분홍 꽃이 길을 감싸고 강변 새잎이 밝게 돋아납니다.'], ['Soft morning light gives the water a pale rose reflection.', '부드러운 아침빛이 강물에 연분홍 반사를 남깁니다.'], ['The map colors are seasonal illustrations, not live bloom reports.', '지도 색감은 계절 연출이며 실시간 개화 정보는 아닙니다.']],
  },
  summer: {
    title: ['Find shade by the river', '강변 그늘을 따라'],
    atmosphere: ['Deep green · warm sun · cooling river air', '짙은 녹음 · 강한 햇살 · 강바람'],
    highlight: ['Rest beneath Seoul Forest trees, then meet the river at Ttukseom', '서울숲 그늘에서 쉬고 뚝섬 강변으로 이어가기'],
    timing: ['Early morning or late afternoon', '이른 오전 또는 늦은 오후'],
    advice: ['Avoid peak heat, bring water, and check for rain or wet surfaces before setting out.', '한낮 더위를 피하고 물을 챙기세요. 출발 전 비와 젖은 노면도 확인하세요.'],
    details: [['Dense green canopies provide pauses between open river sections.', '짙은 녹음이 탁 트인 강변 구간 사이사이에 쉼터를 만듭니다.'], ['The sun sits high; ride early for longer shadows and cooler air.', '해가 높으니 그림자가 길고 공기가 선선한 이른 시간에 달려보세요.'], ['The map uses a warm green summer treatment; check actual heat and rain.', '지도는 따뜻한 여름 녹음을 연출합니다. 실제 더위와 비는 별도로 확인하세요.']],
  },
  autumn: {
    title: ['Follow the golden reeds', '황금빛 갈대길을 따라'],
    atmosphere: ['Clear light · copper leaves · crisp air', '맑은 햇빛 · 구릿빛 갈대 · 선선한 공기'],
    highlight: ['Ride from Jamsil toward Amsa and leave time for the reed trail', '잠실에서 암사까지 달린 뒤 갈대 산책길 걷기'],
    timing: ['Morning through mid-afternoon', '오전부터 이른 오후까지'],
    advice: ['Riverside wind can pick up. Check sunset time and leave enough daylight for the return.', '강변 바람이 강해질 수 있어요. 해 지는 시간을 확인하고 돌아올 낮 시간을 남겨두세요.'],
    details: [['Copper leaves and pale gold reeds line the quieter paths.', '구릿빛 단풍과 연한 금빛 갈대가 한적한 길을 따라 이어집니다.'], ['Low afternoon light brings out warm colors along the river.', '낮게 비치는 오후 햇살이 강변의 따뜻한 색을 또렷하게 만듭니다.'], ['Falling leaves can hide uneven paving, especially after rain.', '낙엽은 특히 비 온 뒤 고르지 않은 노면을 가릴 수 있어요.']],
  },
  winter: {
    title: ['A short ride in clear winter light', '겨울 햇빛 아래 짧은 라이딩'],
    atmosphere: ['Low winter sun · quiet paths · cool air', '낮은 겨울 햇살 · 한적한 길 · 차가운 공기'],
    highlight: ['Keep to the Ttukseom riverside and turn back while it is bright', '뚝섬 강변을 짧게 달리고 밝을 때 돌아오기'],
    timing: ['Around midday', '햇살이 있는 한낮'],
    advice: ['Check for ice before riding. Shorten the route if the path is slippery, cold, or visibility is poor.', '주행 전 결빙을 확인하세요. 길이 미끄럽거나 춥고 시야가 나쁘면 코스를 줄이세요.'],
    details: [['Cool blue water and bare branches give the river a quiet outline.', '푸른 강물과 잎을 떨군 나무가 차분한 강변의 윤곽을 만듭니다.'], ['Snow details on the map are illustrative; they do not report snowfall.', '지도 속 눈 표현은 연출이며 실제 강설 정보가 아닙니다.'], ['Bridges and shaded stretches may freeze before open paths.', '다리와 그늘진 구간은 햇볕 드는 길보다 먼저 얼 수 있어요.']],
  },
}

function FocusMap({ points, linePoints, approachPoints, selectedStop }: { points: LatLngExpression[]; linePoints: LatLngExpression[]; approachPoints: LatLngExpression[]; selectedStop: number | null }) {
  const map = useMap()
  useEffect(() => {
    if (approachPoints.length) map.fitBounds(latLngBounds(selectedStop === null ? [...linePoints, ...approachPoints] : approachPoints), { padding: [42, 42], maxZoom: 15, animate: false })
    else if (selectedStop === null) map.fitBounds(latLngBounds(linePoints), { padding: [45, 45], maxZoom: 14, animate: false })
    else map.setView(points[selectedStop], 15, { animate: false })
  }, [map, points, linePoints, approachPoints, selectedStop])
  return null
}

export function TourRouteExplorer({ route, routes, category, onRouteSelect, locale, shadowDate, shadowMinutes }: {
  route: TouristRoute
  routes: TouristRoute[]
  category: TourCategory
  onRouteSelect: (routeId: string) => void
  locale: 'en' | 'ko'
  shadowDate: string
  shadowMinutes: number
}) {
  const [selection, setSelection] = useState<{ routeId: string; index: number } | null>(null)
  const [hover, setHover] = useState<{ routeId: string; index: number } | null>(null)
  const [sceneryPhoto, setSceneryPhoto] = useState<SceneryPhoto | null>(null)
  const [photoLoading, setPhotoLoading] = useState(false)
  const [view, setView] = useState<'city' | 'google' | 'kakao' | 'map'>(() => hasKakaoMapsKey ? 'kakao' : 'map')
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null)
  const [trackingLocation, setTrackingLocation] = useState(false)
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState<'denied' | 'unavailable' | 'timeout' | null>(null)
  const [nearestResult, setNearestResult] = useState<{ routeId: string; distance: number } | null>(null)
  const [routeGeometry, setRouteGeometry] = useState<{ routeId: string; points: LonLat[]; distanceMeters: number } | null>(null)
  const [approachRoute, setApproachRoute] = useState<{ key: string; points: LonLat[]; estimated: boolean; loading: boolean; distanceMeters?: number } | null>(null)
  const [showCctv, setShowCctv] = useState(true)
  const [rotationRequest, setRotationRequest] = useState<RotationRequest | null>(null)
  const [displaySeason, setDisplaySeason] = useState<TourSeason>(() => route.season ?? seasonForToday())
  const [routeSearch, setRouteSearch] = useState('')
  const preview = useRef<HTMLElement>(null)
  const text = (en: string, ko: string) => locale === 'en' ? en : ko
  const selectedStop = selection?.routeId === route.id ? selection.index : null
  const hoveredStop = hover?.routeId === route.id ? hover.index : null
  const destinationIndex = selectedStop ?? route.stops.length - 1
  const destinationStop = route.stops[destinationIndex]
  const destinationStation = getTouristStation(destinationStop.stationId)
  const locationLat = userLocation ? Number(userLocation.lat.toFixed(4)) : null
  const locationLng = userLocation ? Number(userLocation.lng.toFixed(4)) : null
  const approachKey = locationLat === null || locationLng === null ? null : `${route.id}:${destinationIndex}:${locationLng}:${locationLat}`
  const activeApproachRoute = approachRoute?.key === approachKey ? approachRoute : null
  const approachPath = activeApproachRoute?.points ?? null
  const approachDistance = activeApproachRoute?.distanceMeters ?? (userLocation
    ? distanceMeters(userLocation, { lat: destinationStation.lat, lng: destinationStation.lng }) * 1.3 : null)
  const selectStop = useCallback((index: number | null) => {
    setSelection(index === null ? null : { routeId: route.id, index })
  }, [route.id])
  const hoverStop = useCallback((index: number | null) => {
    setHover(index === null ? null : { routeId: route.id, index })
  }, [route.id])
  const points = useMemo<LatLngExpression[]>(() => route.stops.map(stop => {
    const station = getTouristStation(stop.stationId)
    return [station.lat, station.lng]
  }), [route])
  const routedPath = routeGeometry?.routeId === route.id ? routeGeometry.points : null
  const routeDistance = routeGeometry?.routeId === route.id
    ? routeGeometry.distanceMeters
    : route.distance && Number.isFinite(Number.parseFloat(route.distance))
      ? Number.parseFloat(route.distance) * 1000
      : pathDistance(route.stops.map(stop => {
        const station = getTouristStation(stop.stationId)
        return [station.lng, station.lat] as LonLat
      })) * 1.3
  const routeDistanceEstimated = routeGeometry?.routeId !== route.id
  const linePoints = useMemo<LatLngExpression[]>(() => routedPath
    ? routedPath.map(([lng, lat]) => [lat, lng] as LatLngExpression)
    : points, [routedPath, points])
  const approachPoints = useMemo<LatLngExpression[]>(() => approachPath?.map(([lng, lat]) => [lat, lng] as LatLngExpression) ?? [], [approachPath])
  const cctvCenter = useMemo(() => userLocation ?? getTouristStation(route.stops[0].stationId), [route, userLocation])
  const cctvData = usePublicCctvData(cctvCenter)
  const cctvCameras = useMemo(() => showCctv ? cctvData.nearby.map(item => item.camera) : [], [cctvData.nearby, showCctv])
  const solar = getSolarPosition(shadowDate || todayInSeoul(), shadowMinutes, SEOUL_REFERENCE.lat, SEOUL_REFERENCE.lng)
  const activeSeason = seasonOptions.find(item => item.id === displaySeason) ?? seasonOptions[0]
  const seasonGuide = seasonGuides[displaySeason]
  const categoryRoutes = routes.filter(candidate => candidate.category === category)
    .sort((first, second) => userLocation ? nearestStopDistance(first, userLocation) - nearestStopDistance(second, userLocation) : 0)
  const visibleRoutes = categoryRoutes.filter(candidate => `${candidate.title} ${candidate.titleKo} ${candidate.area} ${candidate.areaKo}`
    .toLocaleLowerCase().includes(routeSearch.trim().toLocaleLowerCase()))
  const locateNearestRoute = (chooseNearest = true) => {
    if (!navigator.geolocation) {
      setLocationError('unavailable')
      return
    }
    setLocating(true)
    setLocationError(null)
    navigator.geolocation.getCurrentPosition(position => {
      const location = { lat: position.coords.latitude, lng: position.coords.longitude }
      let closest: { route: TouristRoute; distance: number } | null = null
      for (const candidate of routes) {
        candidate.stops.forEach(stop => {
          const station = getTouristStation(stop.stationId)
          const distance = distanceMeters(location, station)
          if (closest === null || distance < closest.distance) closest = { route: candidate, distance }
        })
      }
      setLocating(false)
      setUserLocation(location)
      setTrackingLocation(true)
      if (closest === null) return
      const nearest: { route: TouristRoute; distance: number } = closest
      setNearestResult({ routeId: nearest.route.id, distance: nearest.distance })
      if (chooseNearest) {
        if (nearest.route.id === route.id) setSelection(null)
        else onRouteSelect(nearest.route.id)
      }
    }, error => {
      setLocating(false)
      setLocationError(error.code === 1 ? 'denied' : error.code === 3 ? 'timeout' : 'unavailable')
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 120000 })
  }
  const rotateMap = (direction: RotationRequest['direction']) => setRotationRequest(current => ({ direction, serial: (current?.serial ?? 0) + 1 }))
  useLayoutEffect(() => {
    setSelection(null)
    setHover(null)
  }, [route.id])
  useEffect(() => {
    let active = true
    if (!navigator.permissions) return
    void navigator.permissions.query({ name: 'geolocation' }).then(permission => {
      if (active && permission.state === 'granted') setTrackingLocation(true)
    }).catch(() => { /* the button still allows manual location access */ })
    return () => { active = false }
  }, [])
  useEffect(() => {
    if (!trackingLocation || !navigator.geolocation) return
    const watchId = navigator.geolocation.watchPosition(position => {
      setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude })
      setLocationError(null)
    }, error => {
      setLocationError(error.code === 1 ? 'denied' : error.code === 3 ? 'timeout' : 'unavailable')
      if (error.code === 1) { setTrackingLocation(false); setUserLocation(null) }
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 15000 })
    return () => navigator.geolocation.clearWatch(watchId)
  }, [trackingLocation])
  useEffect(() => {
    if (route.season) setDisplaySeason(route.season)
  }, [route.season])
  useEffect(() => {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 12000)
    void fetchBikeRoute(route, controller.signal)
      .then(result => { if (!controller.signal.aborted) setRouteGeometry({ routeId: route.id, points: result.geometry, distanceMeters: result.distanceMeters ?? pathDistance(result.geometry) }) })
      .catch(() => { if (!controller.signal.aborted) setRouteGeometry(null) })
      .finally(() => window.clearTimeout(timeout))
    return () => { window.clearTimeout(timeout); controller.abort() }
  }, [route])
  useEffect(() => {
    if (approachKey === null || locationLng === null || locationLat === null) {
      setApproachRoute(null)
      return
    }
    const origin: LonLat = [locationLng, locationLat]
    const destination: LonLat = [destinationStation.lng, destinationStation.lat]
    setApproachRoute({ key: approachKey, points: [origin, destination], estimated: true, loading: true })
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 15000)
    void fetchBikePath([origin, destination], controller.signal)
      .then(result => {
        if (!controller.signal.aborted) setApproachRoute({ key: approachKey, points: result.geometry, estimated: false, loading: false, distanceMeters: result.distanceMeters })
      })
      .catch(() => {
        if (!controller.signal.aborted) setApproachRoute({ key: approachKey, points: [origin, destination], estimated: true, loading: false })
      })
      .finally(() => window.clearTimeout(timeout))
    return () => { window.clearTimeout(timeout); controller.abort() }
  }, [approachKey, destinationStation.lat, destinationStation.lng, locationLat, locationLng])
  useEffect(() => {
    if (hoveredStop === null || hoveredStop >= route.stops.length) {
      setSceneryPhoto(null)
      setPhotoLoading(false)
      return
    }
    const station = getTouristStation(route.stops[hoveredStop].stationId)
    const stop = route.stops[hoveredStop]
    const controller = new AbortController()
    setSceneryPhoto(null)
    setPhotoLoading(true)
    const timeout = window.setTimeout(() => {
      void findSceneryPhoto(station.lat, station.lng, [stop.place, stop.placeKo], controller.signal)
        .then(photo => {
          if (!controller.signal.aborted) setSceneryPhoto(photo)
        })
        .catch(() => {
          if (!controller.signal.aborted) setSceneryPhoto(null)
        })
        .finally(() => {
          if (!controller.signal.aborted) setPhotoLoading(false)
        })
    }, 140)
    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [hoveredStop, route])
  const chooseSeason = (season: TourSeason) => {
    setDisplaySeason(season)
    setRouteSearch('')
    const seasonalRoute = routes.find(candidate => candidate.category === 'seasonal' && candidate.season === season)
    if (seasonalRoute) onRouteSelect(seasonalRoute.id)
  }
  const map = <MapContainer className="tour-explorer-map" center={points[0]} zoom={13} scrollWheelZoom={false}>
    <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' />
    <FocusMap points={points} linePoints={linePoints} approachPoints={approachPoints} selectedStop={selectedStop} />
    <Polyline positions={linePoints} pathOptions={{ color: '#f5f5ed', weight: 9, opacity: .96 }} />
    <Polyline positions={linePoints} pathOptions={{ color: '#08765b', weight: 5, opacity: 1 }} />
    {approachPoints.length > 1 && <Polyline positions={approachPoints} pathOptions={{ color: '#fff', weight: 9, opacity: .95 }} />}
    {approachPoints.length > 1 && <Polyline positions={approachPoints} pathOptions={{ color: '#3578e5', weight: 5, opacity: 1, dashArray: approachRoute?.estimated ? '8 7' : undefined }} />}
    {userLocation && <CircleMarker center={[userLocation.lat, userLocation.lng]} radius={9}
      pathOptions={{ color: '#fff', weight: 3, fillColor: '#246fe5', fillOpacity: 1 }}>
      <Tooltip direction="top">{text('You are here', '내 위치')}</Tooltip>
    </CircleMarker>}
    {cctvCameras.map(camera => <CircleMarker key={`cctv-${camera.id}`} center={[camera.lat, camera.lng]} radius={7}
      pathOptions={{ color: '#fff', weight: 2, fillColor: '#7654ba', fillOpacity: .98 }}>
      <Popup>
        <strong>{camera.purpose || text('Public CCTV', '공공 CCTV')}</strong>
        <div>{camera.name}</div><div>{camera.address || text('Address not listed', '주소 정보 없음')}</div>
        <div>{text(`Cameras: ${camera.cameras || '—'}`, `카메라 ${camera.cameras || '—'}대`)} · {camera.resolution || '—'}</div>
        <div>{text(`Data date: ${camera.updatedAt || '—'}`, `자료 기준일: ${camera.updatedAt || '—'}`)}</div>
        <div>{text('Public location record; no live video URL is provided.', '공개된 설치 위치이며 실시간 영상 주소는 제공되지 않습니다.')}</div>
      </Popup>
    </CircleMarker>)}
    {route.stops.map((stop, index) => <CircleMarker key={stop.stationId} center={points[index]} radius={selectedStop === index ? 13 : 9}
      eventHandlers={{ click: () => selectStop(index), mouseover: () => hoverStop(index) }} pathOptions={{ color: '#fff', weight: 3, fillColor: selectedStop === index ? '#d99628' : '#08765b', fillOpacity: 1 }}>
      <Tooltip direction="top" permanent>{index + 1}. {text(stop.place, stop.placeKo)}</Tooltip>
    </CircleMarker>)}
  </MapContainer>

  return <div className="tour-explorer-grid">
    <section className="tour-earth-preview" ref={preview} aria-label={text('Explore this route', '코스 지도 살펴보기')}>
      <div className={`tour-ride-toolbar${hasKakaoMapsKey ? ' tour-ride-toolbar--kakao' : ''}`}>
        <div><span className="tour-card-kicker">{text('EXPLORE YOUR STOPS', '경유지를 눌러 둘러보세요')}</span>
          <strong aria-live="polite">{selectedStop === null ? text('Entire route', '전체 코스') : text(route.stops[selectedStop].place, route.stops[selectedStop].placeKo)}</strong></div>
        <div className={`tour-view-switch${hasKakaoMapsKey ? ' tour-view-switch--kakao' : ''}`} role="group" aria-label={text('Map view', '지도 보기')}>
          <button type="button" aria-pressed={view === 'city'} onClick={() => setView('city')}>{text('3D aerial', '위성 3D')}</button>
          {hasGoogleMapsKey && <button type="button" aria-pressed={view === 'google'} onClick={() => setView('google')}>Google 3D</button>}
          {hasKakaoMapsKey && <button type="button" aria-pressed={view === 'kakao'} onClick={() => setView('kakao')}>{text('Kakao map', '카카오 지도')}</button>}
          <button type="button" aria-pressed={view === 'map'} onClick={() => setView('map')}>{text('2D map', '2D 지도')}</button>
        </div>
      </div>
      <div className={`tour-map-stage tour-weather-${displaySeason}`} data-season={displaySeason} onMouseLeave={() => hoverStop(null)}>
        {view === 'city' && <Suspense fallback={<div className="tour-maplibre-3d tour-map-starting">{map}<p className="tour-map-loading-label" role="status">{text('Preparing the 3D city view…', '3D 도시 지도를 준비하고 있어요…')}</p></div>}>
          <MapLibreRoute3D viewMode="city" route={route} routePath={routedPath} accessPath={approachPath} accessEstimated={activeApproachRoute?.estimated ?? false} season={displaySeason} cctvCameras={cctvCameras} showCctv={showCctv} rotationRequest={rotationRequest} locale={locale} userLocation={userLocation} selectedStop={selectedStop} onSelectStop={selectStop} onHoverStop={hoverStop} shadowAzimuth={solar.shadowAzimuth} sunElevation={solar.elevation} fallback={map} />
        </Suspense>}
        {view === 'google' && hasGoogleMapsKey && <GoogleRoute3D route={route} routePath={routedPath} accessPath={approachPath} cctvCameras={cctvCameras} rotationRequest={rotationRequest} locale={locale} userLocation={userLocation} selectedStop={selectedStop} onSelectStop={selectStop} onHoverStop={hoverStop} fallback={map} />}
        {view === 'kakao' && hasKakaoMapsKey && <KakaoRouteMap route={route} routePath={routedPath} accessPath={approachPath} accessEstimated={activeApproachRoute?.estimated ?? false} cctvCameras={cctvCameras} locale={locale} userLocation={userLocation} selectedStop={selectedStop} onSelectStop={selectStop} onHoverStop={hoverStop} fallback={map} />}
        {view === 'map' && <Suspense fallback={<div className="tour-maplibre-3d tour-map-starting">{map}</div>}>
          <MapLibreRoute3D viewMode="map" route={route} routePath={routedPath} accessPath={approachPath} accessEstimated={activeApproachRoute?.estimated ?? false} season={displaySeason} cctvCameras={cctvCameras} showCctv={showCctv} rotationRequest={rotationRequest} locale={locale} userLocation={userLocation} selectedStop={selectedStop} onSelectStop={selectStop} onHoverStop={hoverStop} shadowAzimuth={solar.shadowAzimuth} sunElevation={solar.elevation} fallback={map} />
        </Suspense>}
        <div className="tour-season-atmosphere" aria-hidden="true" />
        <div className="tour-season-controls">
          <div className="tour-season-picker" role="group" aria-label={text('Seasonal map scenery', '계절별 지도 풍경')}>
            {seasonOptions.map(option => <button key={option.id} type="button" aria-pressed={displaySeason === option.id}
              className={`tour-season-tab tour-season-tab--${option.id}`} aria-label={text(option.en, option.ko)} onClick={() => chooseSeason(option.id)}>{text(option.en, option.ko)}</button>)}
          </div>
          <div className="tour-map-overlay-meta">
            <span className="tour-season-weather" aria-live="polite">{text(activeSeason.sceneryEn, activeSeason.sceneryKo)}</span>
            {view !== 'google' && view !== 'kakao' && <span className="tour-shadow-status" aria-label={text('Building shadows are shown on the map', '지도에 건물 그림자를 표시합니다')}><i aria-hidden="true" />{text('Shadows', '그림자')}</span>}
          </div>
        </div>
        <button type="button" className="tour-map-locate" onClick={() => locateNearestRoute(false)} disabled={locating} aria-label={text('Show my location and a route to the destination', '내 위치와 목적지까지의 경로 표시')}>
          <span aria-hidden="true">◎</span>{locating ? text('Locating…', '위치 확인 중…') : text('My location', '내 위치')}
        </button>
        {userLocation && <div className="tour-journey-legend" role="status">
          <span className="tour-journey-legend-route"><i aria-hidden="true" />{text('Your location → destination', '내 위치 → 목적지')}</span>
          <strong>{text(destinationStop.place, destinationStop.placeKo)}</strong>
          {approachDistance !== null && <b>{activeApproachRoute?.estimated ? '≈ ' : ''}{distanceLabel(approachDistance)} · {text(`about ${bikeMinutes(approachDistance)} min by Ttareungi`, `따릉이 약 ${bikeMinutes(approachDistance)}분`)}</b>}
          <small>{activeApproachRoute?.loading ? text('Calculating the bicycle route…', '자전거 경로를 계산하는 중…')
            : activeApproachRoute?.estimated ? text('Estimated from straight-line distance; blue dashed line is not a road route.', '직선거리로 추정한 시간입니다. 파란 점선은 실제 도로 경로가 아닙니다.')
              : text('At 12 km/h, excluding stops and traffic lights.', '시속 12km 기준 · 정차와 신호 대기 제외')}</small>
        </div>}
        {view !== 'kakao' && <div className="tour-map-rotate-controls" role="group" aria-label={text('Rotate the map', '지도 회전')}>
          <button type="button" onClick={() => rotateMap('left')} aria-label={text('Rotate map to the left', '지도를 왼쪽으로 회전')}>←</button>
          <button type="button" onClick={() => rotateMap('right')} aria-label={text('Rotate map to the right', '지도를 오른쪽으로 회전')}>→</button>
        </div>}
        {hoveredStop !== null && <aside className="tour-scenery-preview" aria-live="polite" aria-label={text('Scenery near this stop', '경유지 주변 풍경 사진')}>
          <button className="tour-scenery-close" type="button" aria-label={text('Close photo preview', '사진 미리보기 닫기')} onClick={() => hoverStop(null)}>×</button>
          <span className="tour-scenery-kicker">{text('A VIEW NEAR THIS STOP', '경유지 주변 풍경')}</span>
          {photoLoading ? <div className="tour-scenery-placeholder">{text('Finding a local photo…', '주변 사진을 찾고 있어요…')}</div>
            : sceneryPhoto ? <>
              <img src={sceneryPhoto.thumbnail} alt={sceneryPhoto.title} loading="lazy" />
              <div className="tour-scenery-caption"><a href={sceneryPhoto.page} target="_blank" rel="noopener noreferrer">{sceneryPhoto.title}</a>
                <small>{sceneryPhoto.credit} · {sceneryPhoto.license}</small></div>
            </> : <div className="tour-scenery-placeholder">{text('No nearby public photo is available for this stop.', '이 경유지 주변에서 사용할 수 있는 공개 사진을 찾지 못했습니다.')}</div>}
        </aside>}
      </div>
      <div className="tour-earth-actions">
        <a className="button button--primary" href={googleEarthUrl(route, selectedStop ?? 0)} target="_blank" rel="noopener noreferrer">{text('Open in Google Earth ↗', 'Google Earth에서 보기 ↗')}</a>
        <button type="button" className="button button--ghost" onClick={() => downloadEarthRoute(route, locale)}>{text('Download route for Earth', 'Earth용 코스 받기')}</button>
        <button type="button" className="tour-show-all" onClick={() => selectStop(null)}>{text('Show all stops', '전체 경유지 보기')}</button>
      </div>
      <details className="tour-map-details">
        <summary>{text('Map and route information', '지도 및 코스 안내')}</summary>
        <div>
          <p className="tour-map-note">{view === 'kakao'
            ? text('Kakao street map · route line, stops and public camera locations. Building shadows are not modeled in this view; switch to 3D aerial for estimated shadows.', '카카오 도로 지도에 코스 선·경유지·공공 CCTV를 표시합니다. 이 보기에는 건물 그림자가 없으며, 그림자는 위성 3D 보기에서 확인할 수 있어요.')
            : view === 'map'
            ? text('Street map view · route line, stops and public camera locations. Use the center-side arrows to rotate the map.', '일반 지도에 코스 선·경유지·공공 CCTV를 표시합니다. 지도 양쪽 중앙 화살표로 화면을 회전할 수 있어요.')
            : view === 'google'
              ? text('Explore this route in Google 3D. Building detail varies by area; Google Earth can open the selected stop or the downloaded KML can show the full route.', 'Google 3D로 코스를 살펴보세요. 지역별 건물 표현은 다를 수 있으며 Google Earth에서 선택한 경유지를 열거나 KML로 전체 코스를 볼 수 있습니다.')
              : text('The 3D aerial view combines satellite imagery with OpenStreetMap building heights. Building detail varies by area. Google Earth opens in a new tab at the selected stop; import the KML to see all stops.', '위성 사진 위에 OpenStreetMap 건물 높이 데이터를 입체로 겹쳐 보여줍니다. 건물 표현은 지역별 지도 데이터에 따라 달라집니다. Google Earth는 선택한 경유지를 새 탭에서 열며, KML을 가져오면 전체 경유지를 볼 수 있습니다.')}</p>
          <p className="tour-map-note">{routedPath
            ? text('The line is a suggested bicycle route between stops. Check signs and path conditions before riding.', '표시된 선은 경유지 사이의 추천 자전거 경로입니다. 출발 전에 표지와 길 상태를 확인하세요.')
            : text('The line connects stops while bicycle routing loads or is unavailable. It is not turn-by-turn directions.', '자전거 경로를 불러오는 동안 또는 불러올 수 없을 때는 경유지를 선으로 연결합니다. 이 선은 길안내가 아닙니다.')}</p>
        </div>
      </details>
    </section>
    <aside className="tour-itinerary" aria-label={text('Route stops', '코스 경유지')}>
      <div className="tour-sidebar-heading">
        <span className="tour-card-kicker">{text('EXPLORE SEOUL BY BIKE', '따릉이로 서울 둘러보기')}</span>
        <h1>{text(route.title, route.titleKo)}</h1>
        <p>{text(route.summary, route.summaryKo)}</p>
        <div><span>◷ {text(route.suggestedTime, route.suggestedTimeKo)}</span><span>{route.stops.length} {text('stops', '곳 경유')}</span></div>
        <div className="tour-bike-time" role="status"><strong>{routeDistanceEstimated ? '≈ ' : ''}{distanceLabel(routeDistance)} · {text(`about ${bikeMinutes(routeDistance)} min by Ttareungi`, `따릉이 약 ${bikeMinutes(routeDistance)}분`)}</strong><small>{text('At 12 km/h · riding only, without sightseeing stops', '시속 12km 기준 · 관광·신호 대기 제외')}{routeDistanceEstimated ? text(' · distance estimate', ' · 거리 추정치') : ''}</small></div>
      </div>
      <div className="tour-route-finder">
        <label className="tour-map-search">
          <span aria-hidden="true">⌕</span>
          <input type="search" value={routeSearch} onChange={event => setRouteSearch(event.target.value)}
            placeholder={text('Search Seoul routes', '서울 코스 검색')} aria-label={text('Search routes', '코스 검색')} />
        </label>
        <button type="button" className="tour-nearby-button" onClick={() => locateNearestRoute()} disabled={locating}>
          <span aria-hidden="true">◎</span>{locating ? text('Finding nearby routes…', '가까운 코스를 찾는 중…') : text('Find routes near me', '내 위치로 가까운 코스 찾기')}
        </button>
        <p className="tour-location-result" role="status">
          {locationError === 'denied' ? text('Location access was blocked. Choose a route below.', '위치 권한이 차단됐어요. 아래에서 코스를 선택해 주세요.')
            : locationError === 'timeout' ? text('Location timed out. Please try again.', '위치를 찾는 시간이 초과됐어요. 다시 시도해 주세요.')
              : locationError === 'unavailable' ? text('Your location is unavailable. Choose a route below.', '현재 위치를 사용할 수 없어요. 아래에서 코스를 선택해 주세요.')
                : nearestResult ? text(`Nearest stop: ${distanceLabel(nearestResult.distance)} away`, `가장 가까운 경유지까지 ${distanceLabel(nearestResult.distance)}`)
                  : userLocation ? text('Your position and route to the selected destination are on the map.', '지도에 내 위치와 선택한 목적지까지의 경로를 표시했어요.')
                    : text('Use your location to show a route from here to your destination.', '내 위치를 사용해 목적지까지의 경로를 지도에 표시합니다.')}
        </p>
        <button type="button" className="tour-cctv-toggle" aria-pressed={showCctv} onClick={() => setShowCctv(value => !value)}>
          <span className="tour-cctv-dot" aria-hidden="true" />
          <span>{text('Show public CCTV on map', '지도에 공공 CCTV 표시')}</span>
          <strong>{cctvData.loading ? '…' : cctvData.error ? '!' : cctvData.nearby.length}</strong>
          <i>{showCctv ? text('ON', '표시') : text('OFF', '숨김')}</i>
        </button>
        <p className="tour-cctv-status" role="status">{cctvData.loading
          ? text('Loading public CCTV data…', '공공 CCTV 데이터를 불러오는 중…')
          : cctvData.error
            ? text('Public camera locations could not be loaded.', '공공 CCTV 위치 데이터를 불러오지 못했습니다.')
            : text(`${cctvData.nearby.length} locations shown within 5 km · data ${cctvData.latestRecordDate}`, `반경 5km 내 ${cctvData.nearby.length}곳 표시 · 자료 기준일 ${cctvData.latestRecordDate}`)}</p>
        <a className="tour-cctv-source" href="https://www.data.go.kr/data/15013094/standard.do" target="_blank" rel="noopener noreferrer">
          {text('Source: National Public CCTV Standard Data ↗', '출처: 전국 공공 CCTV 표준데이터 ↗')}
        </a>
        <div className="tour-itinerary-heading"><h3>{text('Browse routes', '코스 구경하기')}</h3><span>{routes.length}{text(' routes', '개 코스')}</span></div>
        <div className="tour-finder-categories" role="group" aria-label={text('Route categories', '코스 종류')}>
          {(Object.keys(categoryNames) as TourCategory[]).map(key => <button key={key} type="button" aria-pressed={category === key}
            onClick={() => { setRouteSearch(''); const next = routes.find(candidate => candidate.category === key); if (next) onRouteSelect(next.id) }}>
            {text(...categoryNames[key])}</button>)}
        </div>
        <div className="tour-finder-routes" role="group" aria-label={text('Choose a route', '코스 선택')}>
          {visibleRoutes.map(candidate => <button key={candidate.id} type="button" aria-pressed={candidate.id === route.id} onClick={() => onRouteSelect(candidate.id)}>
            <strong>{text(candidate.title, candidate.titleKo)}</strong>
            <small>{userLocation ? `${distanceLabel(nearestStopDistance(candidate, userLocation))} · ` : ''}{text(candidate.suggestedTime, candidate.suggestedTimeKo)}</small>
          </button>)}
          {visibleRoutes.length === 0 && <p className="tour-no-routes">{text('No routes match this search.', '검색 결과가 없습니다.')}</p>}
        </div>
        {category === 'seasonal' && route.season && <section className={`tour-season-guide tour-season-guide--${route.season}`} aria-live="polite" aria-atomic="true">
          <div className="tour-season-guide-heading"><span>{text('SEASONAL RIDE NOTES', '계절 라이딩 노트')}</span><b>{text(route.season.toUpperCase(), `${route.season === 'spring' ? '봄' : route.season === 'summer' ? '여름' : route.season === 'autumn' ? '가을' : '겨울'} 시즌`)}</b></div>
          <h4>{text(...seasonGuide.title)}</h4>
          <p className="tour-season-guide-atmosphere">{text(...seasonGuide.atmosphere)}</p>
          <div className="tour-season-guide-facts">
            <div><small>{text('BEST LIGHT', '추천 시간')}</small><strong>{text(...seasonGuide.timing)}</strong></div>
            <div><small>{text('ROUTE MOMENT', '이 계절의 장면')}</small><strong>{text(...seasonGuide.highlight)}</strong></div>
          </div>
          <p className="tour-season-guide-advice"><span aria-hidden="true">↗</span>{text(...seasonGuide.advice)}</p>
          <ul className="tour-season-guide-details">{seasonGuide.details.map((detail, index) => <li key={index}>{text(...detail)}</li>)}</ul>
          <div className="tour-season-guide-footer"><strong>{text(route.title, route.titleKo)}</strong><span>{text(route.distance ?? route.suggestedTime, route.distance ?? route.suggestedTimeKo)}</span></div>
        </section>}
      </div>
      <div className="tour-itinerary-heading"><h3>{text('Your stops', '이 순서로 둘러보세요')}</h3><span>{route.stops.length}{text(' stops', '곳')}</span></div>
      <ol className="tour-connected-stops">
        {route.stops.map((stop, index) => {
          const station = getTouristStation(stop.stationId)
          return <li key={stop.stationId}>
            <button type="button" aria-pressed={selectedStop === index} onMouseEnter={() => hoverStop(index)} onMouseLeave={() => hoverStop(null)} onFocus={() => hoverStop(index)} onBlur={() => hoverStop(null)} onClick={() => {
              selectStop(index)
              preview.current?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
            }}>
              <span className="tour-stop-number">{index + 1}</span>
              <span><strong>{text(stop.place, stop.placeKo)}</strong><span className="tour-stop-detail">{text(stop.detail, stop.detailKo)}</span><small>{text('Bike station', '대여소')} #{station.id} · {station.name}</small><span className="tour-stop-action">{text('View this stop', '이 위치 보기')} ↗</span></span>
            </button>
          </li>
        })}
      </ol>
      <a className="tour-resource-link" href="#tour-checks">{text('Next: check before riding', '다음: 출발 전 확인하기')} <span aria-hidden="true">↓</span></a>
      <div className="tour-route-source">{text('Route reference: ', '코스 참고: ')}
        <a href={route.source} target="_blank" rel="noopener noreferrer">{text("Visit Seoul's official travel guide ↗", '서울 공식 관광 안내 ↗')}</a>
        <p>{text('Station locations: Seoul Open Data, June 2026 snapshot. Check live availability in the official app.', '대여소 위치: 서울 열린데이터광장 2026년 6월 자료. 실시간 대여 가능 여부는 공식 앱에서 확인하세요.')}</p></div>
    </aside>
  </div>
}

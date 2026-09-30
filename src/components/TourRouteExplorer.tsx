import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet'
import { divIcon, latLngBounds, type LatLngExpression } from 'leaflet'
import { getTouristStation, type TourCategory, type TourSeason, type TouristRoute } from '../data/touristRoutes'
import { GoogleRoute3D } from './GoogleRoute3D'
import { hasGoogleMapsKey } from '../services/googleMaps3d'
import { KakaoRouteMap } from './KakaoRouteMap'
import type { TreeFocusRequest } from './MapLibreRoute3D'
import { hasKakaoMapsKey } from '../services/kakaoMaps'
import { downloadEarthRoute, googleEarthUrl } from '../utils/googleEarth'
import { findSceneryPhoto, type SceneryPhoto } from '../services/sceneryPhotos'
import { getSolarPosition, todayInSeoul } from '../utils/solarPosition'
import { fetchBikePath, fetchBikeRoute, fetchWalkingPath, type LonLat } from '../services/bikeRoute'
import { fetchNearbyBikeStations, nearestSnapshotStations, type NearbyBikeStation } from '../services/nearbyBikes'
import { usePublicCctvData } from '../hooks/usePublicCctvData'
import { clusterPublicCameras, publicCamerasAlongRoute } from '../services/publicCctv'
import { fetchRouteBikeLanes, fetchRouteGrades, fetchRouteRestaurants, fetchRouteSignals, type RouteBikeLane, type RouteCondition, type RouteRestaurant } from '../services/routeConditions'

const MapLibreRoute3D = lazy(() => import('./MapLibreRoute3D').then(module => ({ default: module.MapLibreRoute3D })))
const SEOUL_REFERENCE = { lat: 37.5665, lng: 126.978 }
type Coordinates = { lat: number; lng: number; heading?: number }
type RotationRequest = { direction: 'left' | 'right' | 'up' | 'down'; serial: number }
type MapLayerKey = 'course' | 'restaurants' | 'cctv' | 'roadInfo' | 'riders' | 'bikeLanes'
type MapLayers = Record<MapLayerKey, boolean>
const DEFAULT_MAP_LAYERS: MapLayers = { course: true, restaurants: false, cctv: false, roadInfo: true, riders: true, bikeLanes: true }

function readMapLayers(): MapLayers {
  try {
    const saved = localStorage.getItem('seoul-bike-map-layers-v2')
    if (!saved) {
      const previous = localStorage.getItem('seoul-bike-map-layers-v1')
      if (!previous) return DEFAULT_MAP_LAYERS
      const migrated = JSON.parse(previous) as Partial<MapLayers>
      return { ...DEFAULT_MAP_LAYERS, ...migrated, cctv: false }
    }
    const parsed = JSON.parse(saved) as Partial<MapLayers>
    return Object.fromEntries(Object.keys(DEFAULT_MAP_LAYERS).map(key => [
      key,
      typeof parsed[key as MapLayerKey] === 'boolean' ? parsed[key as MapLayerKey] : DEFAULT_MAP_LAYERS[key as MapLayerKey],
    ])) as MapLayers
  } catch {
    return DEFAULT_MAP_LAYERS
  }
}
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

function bearingDegrees(from: Coordinates, to: Coordinates) {
  const radians = Math.PI / 180
  const latitude1 = from.lat * radians
  const latitude2 = to.lat * radians
  const longitude = (to.lng - from.lng) * radians
  const y = Math.sin(longitude) * Math.cos(latitude2)
  const x = Math.cos(latitude1) * Math.sin(latitude2) - Math.sin(latitude1) * Math.cos(latitude2) * Math.cos(longitude)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
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

function FocusMap({ points, linePoints, approachPoints, walkingPoints, selectedStop, userLocation, locationFocusRequest }: { points: LatLngExpression[]; linePoints: LatLngExpression[]; approachPoints: LatLngExpression[]; walkingPoints: LatLngExpression[]; selectedStop: number | null; userLocation: Coordinates | null; locationFocusRequest: number }) {
  const map = useMap()
  const lastFocusRequest = useRef(0)
  const userLocationRef = useRef(userLocation)
  userLocationRef.current = userLocation
  useEffect(() => {
    const currentLocation = userLocationRef.current
    if (locationFocusRequest > lastFocusRequest.current && currentLocation) {
      lastFocusRequest.current = locationFocusRequest
      map.setView([currentLocation.lat, currentLocation.lng], 16, { animate: false })
      return
    }
    if (locationFocusRequest > 0 && selectedStop === null && currentLocation) {
      map.setView([currentLocation.lat, currentLocation.lng], 16, { animate: false })
      return
    }
    if (approachPoints.length) map.fitBounds(latLngBounds(selectedStop === null ? [...linePoints, ...approachPoints, ...walkingPoints] : [...approachPoints, ...walkingPoints]), { padding: [42, 42], maxZoom: 15, animate: false })
    else if (selectedStop === null) map.fitBounds(latLngBounds(linePoints), { padding: [45, 45], maxZoom: 14, animate: false })
    else map.setView(points[selectedStop], 15, { animate: false })
  }, [map, points, linePoints, approachPoints, walkingPoints, selectedStop, locationFocusRequest])
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
  const [view, setView] = useState<'city' | 'satellite' | 'map' | 'google' | 'kakao'>(() => hasKakaoMapsKey ? 'kakao' : 'city')
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null)
  const [trackingLocation, setTrackingLocation] = useState(false)
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState<'denied' | 'unavailable' | 'timeout' | null>(null)
  const [nearestResult, setNearestResult] = useState<{ routeId: string; distance: number } | null>(null)
  const [routeGeometry, setRouteGeometry] = useState<{ routeId: string; points: LonLat[]; distanceMeters: number } | null>(null)
  const [bikeLanesState, setBikeLanesState] = useState<{ routeId: string; lanes: RouteBikeLane[]; status: 'loading' | 'ready' | 'unavailable' } | null>(null)
  const [roadConditions, setRoadConditions] = useState<{
    routeId: string; signals: RouteCondition[]; grades: RouteCondition[]
    signalsStatus: 'idle' | 'loading' | 'ready' | 'unavailable'
    gradesStatus: 'idle' | 'loading' | 'ready' | 'unavailable'
  }>({ routeId: '', signals: [], grades: [], signalsStatus: 'idle', gradesStatus: 'idle' })
  const [approachRoute, setApproachRoute] = useState<{ key: string; points: LonLat[]; estimated: boolean; loading: boolean; distanceMeters?: number } | null>(null)
  const [walkingRoute, setWalkingRoute] = useState<{ key: string; points: LonLat[]; estimated: boolean; loading: boolean; distanceMeters?: number } | null>(null)
  const [nearbyBikes, setNearbyBikes] = useState<{ key: string; stations: NearbyBikeStation[]; updatedAt: string | null; status: 'loading' | 'live' | 'unavailable' } | null>(null)
  const [selectedBikeStationId, setSelectedBikeStationId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [flatOnly, setFlatOnly] = useState(false)
  const [mapLayers, setMapLayers] = useState<MapLayers>(readMapLayers)
  const [locationFocusRequest, setLocationFocusRequest] = useState(0)
  const [routePlacesState, setRoutePlacesState] = useState<{ routeId: string; places: RouteRestaurant[]; status: 'idle' | 'loading' | 'ready' | 'unavailable' }>(
    { routeId: '', places: [], status: 'idle' },
  )
  const [locationMovementTick, setLocationMovementTick] = useState(0)
  const [rideFoodPrompt, setRideFoodPrompt] = useState<{ routeId: string; stopIndex: number } | null>(null)
  const [rotationRequest, setRotationRequest] = useState<RotationRequest | null>(null)
  const [treeFocusRequest, setTreeFocusRequest] = useState<TreeFocusRequest | null>(null)
  const autoLocationRequested = useRef(false)
  const previousLocationRef = useRef<Coordinates | null>(null)
  const distanceSinceMovementTickRef = useRef(0)
  const promptedStopsRef = useRef(new Set<string>())
  const [displaySeason, setDisplaySeason] = useState<TourSeason>(() => route.season ?? seasonForToday())
  const [routeSearch, setRouteSearch] = useState('')
  const preview = useRef<HTMLElement>(null)
  const text = (en: string, ko: string) => locale === 'en' ? en : ko
  const publishLocation = (position: GeolocationPosition) => {
    const previous = previousLocationRef.current
    const next = { lat: position.coords.latitude, lng: position.coords.longitude }
    const moved = previous ? distanceMeters(previous, next) : 0
    const sensorHeading = position.coords.heading
    const heading = sensorHeading !== null && Number.isFinite(sensorHeading)
      ? sensorHeading
      : moved >= 4 && previous ? bearingDegrees(previous, next) : previous?.heading ?? 0
    const location = { ...next, heading }
    previousLocationRef.current = location
    setUserLocation(location)
    if (moved > 0) {
      distanceSinceMovementTickRef.current += moved
      if (distanceSinceMovementTickRef.current >= 35) {
        distanceSinceMovementTickRef.current %= 35
        setLocationMovementTick(tick => tick + 1)
      }
    }
    setLocationError(null)
  }
  const selectedStop = selection?.routeId === route.id ? selection.index : null
  const hoveredStop = hover?.routeId === route.id ? hover.index : null
  const destinationIndex = selectedStop ?? route.stops.length - 1
  const destinationStop = route.stops[destinationIndex]
  const destinationStation = getTouristStation(destinationStop.stationId)
  const locationLat = userLocation ? Number(userLocation.lat.toFixed(4)) : null
  const locationLng = userLocation ? Number(userLocation.lng.toFixed(4)) : null
  const locationKey = locationLat === null || locationLng === null ? null : `${locationLat}:${locationLng}`
  const snapshotNearby = useMemo(() => locationLat === null || locationLng === null ? []
    : nearestSnapshotStations({ lat: locationLat, lng: locationLng }), [locationLat, locationLng])
  const activeNearbyBikes = nearbyBikes?.key === locationKey ? nearbyBikes : null
  const nearbyStations = activeNearbyBikes?.status === 'live' ? activeNearbyBikes.stations : snapshotNearby
  const pickupStation = nearbyStations.find(station => station.id === selectedBikeStationId && (station.available === null || station.available > 0))
    ?? nearbyStations.find(station => station.available === null || station.available > 0)
    ?? (activeNearbyBikes?.status === 'live' ? null : nearbyStations[0] ?? null)
  const approachKey = pickupStation ? `${route.id}:${selectedStop ?? 'all'}:${pickupStation.id}` : null
  const walkingKey = locationKey && pickupStation ? `${locationKey}:${pickupStation.id}` : null
  const activeApproachRoute = approachRoute?.key === approachKey ? approachRoute : null
  const approachPath = activeApproachRoute?.points ?? null
  const activeWalkingRoute = walkingRoute?.key === walkingKey ? walkingRoute : null
  const walkingPath = activeWalkingRoute?.points ?? null
  const approachDistance = activeApproachRoute?.distanceMeters ?? (pickupStation
    ? distanceMeters(pickupStation, { lat: destinationStation.lat, lng: destinationStation.lng }) * 1.3 : null)
  const walkingDistance = activeWalkingRoute?.distanceMeters ?? (pickupStation && userLocation
    ? distanceMeters(userLocation, pickupStation) * 1.25 : null)
  const selectStop = useCallback((index: number | null) => {
    setTreeFocusRequest(null)
    setSelection(index === null ? null : { routeId: route.id, index })
    if (userLocation) setLocationFocusRequest(request => request + 1)
  }, [route.id, userLocation])
  const hoverStop = useCallback((index: number | null) => {
    setHover(index === null ? null : { routeId: route.id, index })
  }, [route.id])
  const focusTree = useCallback((anchor: LonLat) => {
    setTreeFocusRequest(current => ({ routeId: route.id, anchor, serial: (current?.serial ?? 0) + 1 }))
    setRotationRequest(null)
    setMapLayers(current => ({ ...current, course: true }))
    setSidebarOpen(false)
    setView('city')
  }, [route.id])
  const viewTrees = () => {
    const station = getTouristStation(route.stops[selectedStop ?? 0].stationId)
    const anchor = selectedStop === null && userLocation ? userLocation : station
    focusTree([anchor.lng, anchor.lat])
  }
  const points = useMemo<LatLngExpression[]>(() => route.stops.map(stop => {
    const station = getTouristStation(stop.stationId)
    return [station.lat, station.lng]
  }), [route])
  const routedPath = routeGeometry?.routeId === route.id ? routeGeometry.points : null
  const activeRoadConditions = roadConditions.routeId === route.id ? roadConditions : null
  const activeRoutePlaces = routePlacesState.routeId === route.id ? routePlacesState : null
  const routeSignals = activeRoadConditions?.signals ?? []
  const routeGrades = activeRoadConditions?.grades ?? []
  const routeRestaurants = activeRoutePlaces?.places ?? []
  const showCourse = mapLayers.course
  const showRestaurants = mapLayers.restaurants
  const showCctv = mapLayers.cctv
  const showRoadInfo = mapLayers.roadInfo
  const showRiders = mapLayers.riders
  const showBikeLanes = mapLayers.bikeLanes
  const routeBikeLanes = bikeLanesState?.routeId === route.id ? bikeLanesState.lanes : []
  const routeConditions = useMemo(() => [...routeSignals, ...routeGrades], [routeGrades, routeSignals])
  const signalCountLabel = !routedPath || activeRoadConditions?.signalsStatus === 'loading' ? '…'
    : activeRoadConditions?.signalsStatus === 'ready' ? String(routeSignals.length) : '—'
  const uphillCountLabel = !routedPath || activeRoadConditions?.gradesStatus === 'loading' ? '…'
    : activeRoadConditions?.gradesStatus === 'ready' ? String(routeGrades.filter(item => item.kind === 'uphill').length) : '—'
  const downhillCountLabel = !routedPath || activeRoadConditions?.gradesStatus === 'loading' ? '…'
    : activeRoadConditions?.gradesStatus === 'ready' ? String(routeGrades.filter(item => item.kind === 'downhill').length) : '—'
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
  const walkingPoints = useMemo<LatLngExpression[]>(() => walkingPath?.map(([lng, lat]) => [lat, lng] as LatLngExpression) ?? [], [walkingPath])
  const cctvData = usePublicCctvData()
  const cctvRoutePath = useMemo<LonLat[]>(() => {
    const bikePath = approachPath && approachPath.length > 1 ? approachPath
      : routedPath && routedPath.length > 1 ? routedPath
        : route.stops.map((stop) => {
          const station = getTouristStation(stop.stationId)
          return [station.lng, station.lat] as LonLat
        })
    return walkingPath && walkingPath.length > 1 ? [...walkingPath, ...bikePath.slice(1)] : bikePath
  }, [approachPath, route.stops, routedPath, walkingPath])
  const cctvCameras = useMemo(() => showCctv
    ? publicCamerasAlongRoute(cctvData.cameras, cctvRoutePath)
    : [], [cctvData.cameras, cctvRoutePath, showCctv])
  const fallbackCctvClusters = useMemo(() => showCctv
    ? clusterPublicCameras(cctvCameras, getTouristStation(route.stops[0].stationId), 48_000, 2_000)
    : [], [cctvCameras, route.stops, showCctv])
  const solar = getSolarPosition(shadowDate || todayInSeoul(), shadowMinutes, SEOUL_REFERENCE.lat, SEOUL_REFERENCE.lng)
  const activeSeason = seasonOptions.find(item => item.id === displaySeason) ?? seasonOptions[0]
  const seasonGuide = seasonGuides[displaySeason]
  const categoryRoutes = routes.filter(candidate => candidate.category === category)
    .sort((first, second) => userLocation ? nearestStopDistance(first, userLocation) - nearestStopDistance(second, userLocation) : 0)
  const routeChoices = flatOnly ? routes.filter(candidate => candidate.mostlyFlat)
    .sort((first, second) => userLocation ? nearestStopDistance(first, userLocation) - nearestStopDistance(second, userLocation) : 0) : categoryRoutes
  const visibleRoutes = routeChoices.filter(candidate => `${candidate.title} ${candidate.titleKo} ${candidate.area} ${candidate.areaKo}`
    .toLocaleLowerCase().includes(routeSearch.trim().toLocaleLowerCase()))
  const locateNearestRoute = (chooseNearest = true) => {
    setTreeFocusRequest(null)
    if (!navigator.geolocation) {
      setLocationError('unavailable')
      return
    }
    setLocating(true)
    setLocationError(null)
    navigator.geolocation.getCurrentPosition(position => {
      publishLocation(position)
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
      setTrackingLocation(true)
      setLocationFocusRequest(request => request + 1)
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
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 1000 })
  }
  const rotateMap = (direction: RotationRequest['direction']) => setRotationRequest(current => ({ direction, serial: (current?.serial ?? 0) + 1 }))
  const chooseMapView = (nextView: 'city' | 'satellite' | 'map' | 'google' | 'kakao') => {
    setTreeFocusRequest(null)
    setRotationRequest(null)
    setView(nextView)
  }
  const toggleMapLayer = (layer: MapLayerKey) => setMapLayers(current => ({ ...current, [layer]: !current[layer] }))
  useLayoutEffect(() => {
    setTreeFocusRequest(null)
    setSelection(null)
    setHover(null)
    if (userLocation) setLocationFocusRequest(request => request + 1)
  }, [route.id])
  useEffect(() => {
    if (autoLocationRequested.current) return
    autoLocationRequested.current = true
    locateNearestRoute(false)
  }, [])
  useEffect(() => {
    let active = true
    if (!navigator.permissions) return
    void navigator.permissions.query({ name: 'geolocation' }).then(permission => {
      if (active && permission.state === 'granted') setTrackingLocation(true)
    }).catch(() => { /* the button still allows manual location access */ })
    return () => { active = false }
  }, [])
  useEffect(() => {
    try { localStorage.setItem('seoul-bike-map-layers-v2', JSON.stringify(mapLayers)) } catch { /* Map controls remain available without storage. */ }
  }, [mapLayers])
  useEffect(() => {
    if (!trackingLocation || !navigator.geolocation) return
    const watchId = navigator.geolocation.watchPosition(position => {
      publishLocation(position)
    }, error => {
      setLocationError(error.code === 1 ? 'denied' : error.code === 3 ? 'timeout' : 'unavailable')
      if (error.code === 1) { setTrackingLocation(false); setUserLocation(null) }
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 1000 })
    return () => navigator.geolocation.clearWatch(watchId)
  }, [trackingLocation])
  useEffect(() => {
    if (!trackingLocation || !userLocation || locationMovementTick === 0 || rideFoodPrompt?.routeId === route.id) return
    const nearbyStop = route.stops.map((stop, index) => {
      const station = getTouristStation(stop.stationId)
      return { index, distance: distanceMeters(userLocation, station) }
    }).filter(stop => stop.distance <= 280 && !promptedStopsRef.current.has(`${route.id}:${stop.index}`))
      .sort((first, second) => first.distance - second.distance)[0]
    if (!nearbyStop) return
    promptedStopsRef.current.add(`${route.id}:${nearbyStop.index}`)
    setRideFoodPrompt({ routeId: route.id, stopIndex: nearbyStop.index })
  }, [locationMovementTick, route, trackingLocation, userLocation, rideFoodPrompt])
  useEffect(() => {
    setRideFoodPrompt(null)
  }, [route.id])
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
    if (!routedPath || routedPath.length < 2) {
      setBikeLanesState(null)
      return
    }
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 12_000)
    let active = true
    setBikeLanesState({ routeId: route.id, lanes: [], status: 'loading' })
    void fetchRouteBikeLanes(routedPath, controller.signal).then(lanes => {
      if (active) setBikeLanesState({ routeId: route.id, lanes, status: 'ready' })
    }).catch(() => {
      if (active) setBikeLanesState(current => current?.routeId === route.id ? { ...current, status: 'unavailable' } : current)
    }).finally(() => window.clearTimeout(timeout))
    return () => { active = false; window.clearTimeout(timeout); controller.abort() }
  }, [route.id, routedPath])
  useEffect(() => {
    if (!routedPath || routedPath.length < 2) {
      setRoadConditions({ routeId: route.id, signals: [], grades: [], signalsStatus: 'idle', gradesStatus: 'idle' })
      return
    }
    const signalsController = new AbortController()
    const gradesController = new AbortController()
    const signalsTimeout = window.setTimeout(() => signalsController.abort(), 11000)
    const gradesTimeout = window.setTimeout(() => gradesController.abort(), 9000)
    let active = true
    setRoadConditions({ routeId: route.id, signals: [], grades: [], signalsStatus: 'loading', gradesStatus: 'loading' })
    void fetchRouteSignals(routedPath, signalsController.signal).then(signals => {
      if (active) setRoadConditions(current => current.routeId === route.id ? { ...current, signals, signalsStatus: 'ready' } : current)
    }).catch(() => {
      if (active) setRoadConditions(current => current.routeId === route.id ? { ...current, signalsStatus: 'unavailable' } : current)
    }).finally(() => window.clearTimeout(signalsTimeout))
    void fetchRouteGrades(routedPath, gradesController.signal).then(grades => {
      if (active) setRoadConditions(current => current.routeId === route.id ? { ...current, grades, gradesStatus: 'ready' } : current)
    }).catch(() => {
      if (active) setRoadConditions(current => current.routeId === route.id ? { ...current, gradesStatus: 'unavailable' } : current)
    }).finally(() => window.clearTimeout(gradesTimeout))
    return () => {
      active = false
      window.clearTimeout(signalsTimeout)
      window.clearTimeout(gradesTimeout)
      signalsController.abort()
      gradesController.abort()
    }
  }, [route.id, routedPath])
  useEffect(() => {
    if (!routedPath || routedPath.length < 2) {
      setRoutePlacesState({ routeId: route.id, places: [], status: 'idle' })
      return
    }
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 14000)
    let active = true
    setRoutePlacesState({ routeId: route.id, places: [], status: 'loading' })
    void fetchRouteRestaurants(routedPath, controller.signal).then(places => {
      if (active) setRoutePlacesState({ routeId: route.id, places, status: 'ready' })
    }).catch(() => {
      if (active) setRoutePlacesState(current => current.routeId === route.id ? { ...current, status: 'unavailable' } : current)
    }).finally(() => window.clearTimeout(timeout))
    return () => {
      active = false
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [route.id, routedPath])
  useEffect(() => {
    if (!locationKey || locationLat === null || locationLng === null) {
      setNearbyBikes(null)
      return
    }
    const controller = new AbortController()
    let active = true
    const location = { lat: locationLat, lng: locationLng }
    setNearbyBikes({ key: locationKey, stations: nearestSnapshotStations(location), updatedAt: null, status: 'loading' })
    const refresh = () => {
      void fetchNearbyBikeStations(location, controller.signal).then(result => {
        if (active) setNearbyBikes({ key: locationKey, stations: result.stations, updatedAt: result.updatedAt, status: 'live' })
      }).catch(() => {
        if (active) setNearbyBikes(current => current?.key === locationKey ? { ...current, status: 'unavailable' } : current)
      })
    }
    refresh()
    const interval = window.setInterval(refresh, 60_000)
    return () => { active = false; window.clearInterval(interval); controller.abort() }
  }, [locationKey, locationLat, locationLng])
  useEffect(() => {
    if (approachKey === null || locationLng === null || locationLat === null) {
      setApproachRoute(null)
      return
    }
    if (!pickupStation) return
    const origin: LonLat = [pickupStation.lng, pickupStation.lat]
    const destinations = selectedStop === null
      ? route.stops.map(stop => { const station = getTouristStation(stop.stationId); return [station.lng, station.lat] as LonLat })
      : [[destinationStation.lng, destinationStation.lat] as LonLat]
    const waypoints = [origin, ...destinations].filter((point, index, all) => index === 0 || distanceMeters(
      { lng: all[index - 1][0], lat: all[index - 1][1] }, { lng: point[0], lat: point[1] }) > 10)
    if (waypoints.length < 2) {
      setApproachRoute({ key: approachKey, points: [origin, origin], estimated: true, loading: false, distanceMeters: 0 })
      return
    }
    const destination = waypoints[waypoints.length - 1]
    setApproachRoute({ key: approachKey, points: [origin, destination], estimated: true, loading: true })
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 15000)
    void fetchBikePath(waypoints, controller.signal)
      .then(result => {
        if (!controller.signal.aborted) setApproachRoute({ key: approachKey, points: result.geometry, estimated: false, loading: false, distanceMeters: result.distanceMeters })
      })
      .catch(() => {
        if (!controller.signal.aborted) setApproachRoute({ key: approachKey, points: [origin, destination], estimated: true, loading: false })
      })
      .finally(() => window.clearTimeout(timeout))
    return () => { window.clearTimeout(timeout); controller.abort() }
  }, [approachKey, destinationStation.lat, destinationStation.lng, locationLat, locationLng, route.stops, selectedStop])
  useEffect(() => {
    if (!walkingKey || !pickupStation || locationLat === null || locationLng === null) {
      setWalkingRoute(null)
      return
    }
    const origin: LonLat = [locationLng, locationLat]
    const destination: LonLat = [pickupStation.lng, pickupStation.lat]
    if (distanceMeters({ lat: locationLat, lng: locationLng }, pickupStation) < 20) {
      setWalkingRoute({ key: walkingKey, points: [origin, destination], estimated: true, loading: false, distanceMeters: 0 })
      return
    }
    setWalkingRoute({ key: walkingKey, points: [origin, destination], estimated: true, loading: true })
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 12000)
    void fetchWalkingPath([origin, destination], controller.signal)
      .then(result => {
        if (!controller.signal.aborted) setWalkingRoute({ key: walkingKey, points: result.geometry, estimated: false, loading: false, distanceMeters: result.distanceMeters })
      })
      .catch(() => {
        if (!controller.signal.aborted) setWalkingRoute({ key: walkingKey, points: [origin, destination], estimated: true, loading: false })
      })
      .finally(() => window.clearTimeout(timeout))
    return () => { window.clearTimeout(timeout); controller.abort() }
  }, [walkingKey, locationLat, locationLng])
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
    if (seasonalRoute) { setFlatOnly(false); onRouteSelect(seasonalRoute.id) }
  }
  const locationHeading = userLocation?.heading ?? 0
  const locationIcon = useMemo(() => divIcon({
    className: 'tour-leaflet-location-icon',
    html: `<span class="tour-user-location-marker" style="--tour-user-heading:${locationHeading}deg"></span>`,
    iconSize: [34, 39],
    iconAnchor: [17, 20],
  }), [locationHeading])
  const map = <MapContainer className="tour-explorer-map" center={points[0]} zoom={13} scrollWheelZoom={false}>
    <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' />
    <FocusMap points={points} linePoints={linePoints} approachPoints={approachPoints} walkingPoints={walkingPoints} selectedStop={selectedStop} userLocation={userLocation} locationFocusRequest={locationFocusRequest} />
    {showCourse && <Polyline positions={linePoints} pathOptions={{ color: '#f5f5ed', weight: 9, opacity: .96 }} />}
    {showCourse && <Polyline positions={linePoints} pathOptions={{ color: '#08765b', weight: 5, opacity: 1 }} />}
    {showCourse && approachPoints.length > 1 && <Polyline positions={approachPoints} pathOptions={{ color: '#fff', weight: 9, opacity: .95 }} />}
    {showCourse && approachPoints.length > 1 && <Polyline positions={approachPoints} pathOptions={{ color: '#3578e5', weight: 5, opacity: 1, dashArray: approachRoute?.estimated ? '8 7' : undefined }} />}
    {walkingPoints.length > 1 && <Polyline positions={walkingPoints} pathOptions={{ color: '#fff', weight: 8, opacity: .95 }} />}
    {walkingPoints.length > 1 && <Polyline positions={walkingPoints} pathOptions={{ color: '#546a78', weight: 4, opacity: 1, dashArray: '6 6' }} />}
    {userLocation && <Marker position={[userLocation.lat, userLocation.lng]} icon={locationIcon} zIndexOffset={1000}>
      <Tooltip direction="top">{text('You are here', '내 위치')}</Tooltip>
    </Marker>}
    {pickupStation && <CircleMarker center={[pickupStation.lat, pickupStation.lng]} radius={11}
      pathOptions={{ color: '#fff', weight: 3, fillColor: '#137e72', fillOpacity: 1 }}>
      <Tooltip direction="top" permanent>{text('Pick up a bike', '자전거 대여')} · {pickupStation.available === null ? '—' : `${pickupStation.available}${text(' bikes', '대')}`}</Tooltip>
    </CircleMarker>}
    {showRoadInfo && routeConditions.map(condition => <CircleMarker key={condition.id} center={[condition.lat, condition.lng]}
      radius={condition.kind === 'signal' ? 7 : 9} pathOptions={{ color: '#fff', weight: 2,
        fillColor: condition.kind === 'signal' ? '#e3aa45' : condition.kind === 'uphill' ? '#c85c43' : '#428cba', fillOpacity: 1 }}>
      <Tooltip direction="top" permanent>{condition.kind === 'signal' ? text('Signal', '신호등') : `${condition.kind === 'uphill' ? '↗' : '↘'} ${condition.grade}%`}</Tooltip>
    </CircleMarker>)}
    {showRestaurants && routeRestaurants.map(place => <CircleMarker key={`place-${place.id}`} center={[place.lat, place.lng]} radius={8}
      pathOptions={{ color: '#fff', weight: 2, fillColor: place.kind === 'cafe' ? '#8d6246' : '#d8723b', fillOpacity: 1 }}>
      <Tooltip direction="top" permanent>{place.kind === 'cafe' ? '☕ ' : '🍽 '}{place.name}</Tooltip>
    </CircleMarker>)}
    {fallbackCctvClusters.map((cluster, index) => <CircleMarker key={`cctv-cluster-${index}`} center={[cluster.lat, cluster.lng]} radius={cluster.cameras.length > 1 ? 9 : 7}
      pathOptions={{ color: '#fff', weight: 2, fillColor: '#7654ba', fillOpacity: .98 }}>
      <Popup>
        {cluster.cameras.length > 1 ? <><strong>{text(`${cluster.cameras.length} public CCTV locations`, `공공 CCTV ${cluster.cameras.length}곳`)}</strong>
          {cluster.cameras.slice(0, 6).map(camera => <div key={camera.id}>{camera.name} · {camera.address}</div>)}</>
          : <><strong>{cluster.cameras[0].purpose || text('Public CCTV', '공공 CCTV')}</strong>
            <div>{cluster.cameras[0].name}</div><div>{cluster.cameras[0].address || text('Address not listed', '주소 정보 없음')}</div>
            <div>{text(`Cameras: ${cluster.cameras[0].cameras || '—'}`, `카메라 ${cluster.cameras[0].cameras || '—'}대`)} · {cluster.cameras[0].resolution || '—'}</div>
            <div>{text(`Data date: ${cluster.cameras[0].updatedAt || '—'}`, `자료 기준일: ${cluster.cameras[0].updatedAt || '—'}`)}</div></>}
        <div>{text('Public location records; live video is not provided.', '공개 설치 위치이며 실시간 영상은 제공되지 않습니다.')}</div>
      </Popup>
      <Tooltip direction="top">CCTV {cluster.cameras.length > 1 ? cluster.cameras.length : ''}</Tooltip>
    </CircleMarker>)}
    {showCourse && route.stops.map((stop, index) => <CircleMarker key={stop.stationId} center={points[index]} radius={selectedStop === index ? 13 : 9}
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
          {hasKakaoMapsKey && <button type="button" aria-pressed={view === 'kakao'} onClick={() => chooseMapView('kakao')}>{text('Kakao map', '카카오 지도')}</button>}
          <button type="button" aria-pressed={view === 'city'} onClick={() => chooseMapView('city')}>{text('3D city', '3D 도시')}</button>
          <button type="button" aria-pressed={view === 'satellite'} onClick={() => chooseMapView('satellite')}>{text('2D aerial', '2D 위성')}</button>
          <button type="button" aria-pressed={view === 'map'} onClick={() => chooseMapView('map')}>{text('Flat map', '평면 지도')}</button>
          {hasGoogleMapsKey && <button type="button" aria-pressed={view === 'google'} onClick={() => chooseMapView('google')}>Google 3D</button>}
        </div>
        <button className="tour-sidebar-toggle" type="button" aria-controls="tour-route-sidebar" aria-expanded={sidebarOpen}
          onClick={() => setSidebarOpen(open => !open)}>{sidebarOpen ? text('Hide routes ×', '코스 닫기 ×') : text('Routes & bikes ☰', '코스·대여소 ☰')}</button>
      </div>
      <div className="tour-map-stage" onMouseLeave={() => hoverStop(null)}>
        {view === 'city' && <Suspense fallback={<div className="tour-maplibre-3d tour-map-starting">{map}<p className="tour-map-loading-label" role="status">{text('Preparing the 3D city view…', '3D 도시 지도를 준비하고 있어요…')}</p></div>}>
          <MapLibreRoute3D key={view} viewMode="city" route={route} routePath={routedPath} accessPath={approachPath} accessEstimated={activeApproachRoute?.estimated ?? false} walkPath={walkingPath} pickupStation={pickupStation} bikeLanes={routeBikeLanes} showBikeLanes={showBikeLanes} season={displaySeason} routeConditions={routeConditions} restaurants={routeRestaurants} showCourse={showCourse} showRestaurants={showRestaurants} showRoadInfo={showRoadInfo} showRiders={showRiders} cctvCameras={cctvCameras} showCctv={showCctv} locationFocusRequest={locationFocusRequest} rotationRequest={rotationRequest} treeFocusRequest={treeFocusRequest} onFocusTree={focusTree} locale={locale} userLocation={userLocation} selectedStop={selectedStop} onSelectStop={selectStop} onHoverStop={hoverStop} shadowAzimuth={solar.shadowAzimuth} sunElevation={solar.elevation} fallback={map} />
        </Suspense>}
        {view === 'google' && hasGoogleMapsKey && <GoogleRoute3D route={route} routePath={routedPath} accessPath={approachPath} routeConditions={routeConditions} restaurants={routeRestaurants} showCourse={showCourse} showRestaurants={showRestaurants} showRoadInfo={showRoadInfo} showRiders={showRiders} showCctv={showCctv} cctvCameras={cctvCameras} locationFocusRequest={locationFocusRequest} rotationRequest={rotationRequest} locale={locale} userLocation={userLocation} selectedStop={selectedStop} onSelectStop={selectStop} onHoverStop={hoverStop} fallback={map} />}
        {view === 'kakao' && hasKakaoMapsKey && <KakaoRouteMap route={route} routePath={routedPath} accessPath={approachPath} accessEstimated={activeApproachRoute?.estimated ?? false} bikeLanes={routeBikeLanes} showBikeLanes={showBikeLanes} season={displaySeason} showRiders={showRiders} routeConditions={routeConditions} restaurants={routeRestaurants} showCourse={showCourse} showRestaurants={showRestaurants} showRoadInfo={showRoadInfo} showCctv={showCctv} cctvCameras={cctvCameras} locationFocusRequest={locationFocusRequest} locale={locale} userLocation={userLocation} selectedStop={selectedStop} onSelectStop={selectStop} onHoverStop={hoverStop} onFocusTree={focusTree} fallback={map} />}
        {(view === 'satellite' || view === 'map') && <Suspense fallback={<div className="tour-maplibre-3d tour-map-starting">{map}</div>}>
          <MapLibreRoute3D key={view} viewMode={view} route={route} routePath={routedPath} accessPath={approachPath} accessEstimated={activeApproachRoute?.estimated ?? false} walkPath={walkingPath} pickupStation={pickupStation} bikeLanes={routeBikeLanes} showBikeLanes={showBikeLanes} season={displaySeason} routeConditions={routeConditions} restaurants={routeRestaurants} showCourse={showCourse} showRestaurants={showRestaurants} showRoadInfo={showRoadInfo} showRiders={showRiders} cctvCameras={cctvCameras} showCctv={showCctv} locationFocusRequest={locationFocusRequest} rotationRequest={rotationRequest} treeFocusRequest={treeFocusRequest} onFocusTree={focusTree} locale={locale} userLocation={userLocation} selectedStop={selectedStop} onSelectStop={selectStop} onHoverStop={hoverStop} shadowAzimuth={solar.shadowAzimuth} sunElevation={solar.elevation} fallback={map} />
        </Suspense>}
        <div className="tour-season-controls">
          <div className="tour-season-picker" role="group" aria-label={text('Seasonal map scenery', '계절별 지도 풍경')}>
            {seasonOptions.map(option => <button key={option.id} type="button" aria-pressed={displaySeason === option.id}
              className={`tour-season-tab tour-season-tab--${option.id}`} aria-label={text(option.en, option.ko)} onClick={() => chooseSeason(option.id)}>{text(option.en, option.ko)}</button>)}
          </div>
          <div className="tour-map-overlay-meta">
            <span className="tour-season-weather" aria-live="polite">{text(activeSeason.sceneryEn, activeSeason.sceneryKo)}</span>
            {view === 'city' && <span className="tour-shadow-status" aria-label={text('Building shadows are shown on the map', '지도에 건물 그림자를 표시합니다')}><i aria-hidden="true" />{text('Shadows', '그림자')}</span>}
          </div>
          <div className="tour-map-quick-actions">
            <button type="button" className="tour-tree-focus" onClick={viewTrees}
              title={text('Zoom to trees along this route in 3D', '이 코스의 나무가 있는 구간을 3D로 확대')}>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21v-7m-3 7h6M8 16a4 4 0 0 1-3-6 5 5 0 0 1 4-7 4 4 0 0 1 7 3 5 5 0 0 1 3 8 4 4 0 0 1-5 2" /></svg>
              {text('View trees', '나무길 보기')}
            </button>
            <button type="button" className="tour-cctv-toggle tour-cctv-toggle--map" aria-pressed={showCctv}
              aria-label={text(showCctv ? 'Hide public CCTV from the map' : 'Show public CCTV on the map', showCctv ? '지도에서 공공 CCTV 숨기기' : '지도에 공공 CCTV 표시하기')}
              onClick={() => toggleMapLayer('cctv')}>
              <span className="tour-cctv-dot" aria-hidden="true" />
              <span>{text('Public CCTV', '공공 CCTV')}</span>
              <strong>{cctvData.loading ? '…' : cctvData.error ? '!' : cctvCameras.length.toLocaleString()}</strong>
              <i>{showCctv ? text('ON', '켜짐') : text('OFF', '꺼짐')}</i>
            </button>
          </div>
        </div>
        <button type="button" className="tour-map-locate" onClick={() => locateNearestRoute(false)} disabled={locating} aria-label={text('Find a nearby Ttareungi station and show my route', '가까운 따릉이 대여소와 이동 경로 찾기')}>
          <span aria-hidden="true">◎</span>{locating ? text('Locating…', '위치 확인 중…') : text('My location', '내 위치')}
        </button>
        {pickupStation && <div className="tour-bike-stock-overlay" role="status" aria-live="polite">
          <span aria-hidden="true">🚲</span><div><strong>{pickupStation.available !== null
            ? text(`${pickupStation.available} bikes available`, `${pickupStation.available}대 대여 가능`)
            : activeNearbyBikes?.status === 'unavailable' ? text('Live count unavailable', '실시간 잔여 대수 확인 불가') : text('Checking bikes', '잔여 수 확인 중')}</strong><small>{pickupStation.name}</small></div>
        </div>}
        {userLocation && <div className="tour-journey-legend" role="status">
          <span className="tour-journey-legend-route"><i aria-hidden="true" />{text('From here to your destination', '내 위치에서 목적지까지')}</span>
          {pickupStation && <strong>{text('Walk', '도보')} {walkingDistance === null ? '—' : `${distanceLabel(walkingDistance)} · ${Math.max(1, Math.ceil(walkingDistance / 75))}${text(' min', '분')}`} → {pickupStation.name}</strong>}
          {approachDistance !== null && <b>{text('Ride', '자전거')} {activeApproachRoute?.estimated ? '≈ ' : ''}{distanceLabel(approachDistance)} · {text(`about ${bikeMinutes(approachDistance)} min`, `약 ${bikeMinutes(approachDistance)}분`)}</b>}
          <small>{text(destinationStop.place, destinationStop.placeKo)} · {pickupStation?.available === null ? text('Bike count unavailable', '자전거 잔여 대수 확인 전') : `${pickupStation?.available ?? '—'}${text(' bikes available', '대 대여 가능')}`}</small>
        </div>}
        {rideFoodPrompt?.routeId === route.id && <aside className="tour-ride-food-prompt" role="status" aria-live="polite">
          <button type="button" className="tour-ride-food-prompt-close" aria-label={text('Dismiss food suggestion', '맛집 안내 닫기')} onClick={() => setRideFoodPrompt(null)}>×</button>
          <span className="tour-ride-food-prompt-kicker">{text('A STOP ALONG YOUR RIDE', '라이딩 중 경유지')}</span>
          <strong>{text('Want to find good food nearby?', '이 근처 맛집을 찾아볼까요?')}</strong>
          <p>{text(`You are near ${route.stops[rideFoodPrompt.stopIndex]?.place ?? 'a route stop'}.`, `${route.stops[rideFoodPrompt.stopIndex]?.placeKo ?? '경유지'} 근처에 도착했어요.`)}{' '}
            {activeRoutePlaces?.status === 'loading' ? text('Searching nearby…', '주변 가게를 찾고 있어요…')
              : activeRoutePlaces?.status === 'ready' ? text(`${routeRestaurants.filter(place => distanceMeters(userLocation ?? destinationStation, place) <= 750).length} food and cafe options nearby`, `반경 750m 맛집·카페 ${routeRestaurants.filter(place => distanceMeters(userLocation ?? destinationStation, place) <= 750).length}곳`)
                : text('See nearby restaurants and cafes on the map.', '지도에서 주변 음식점과 카페를 볼 수 있어요.')}</p>
          <div><button type="button" className="tour-ride-food-prompt-primary" onClick={() => {
            setMapLayers(current => ({ ...current, restaurants: true }))
            setSidebarOpen(true)
            setRideFoodPrompt(null)
          }}>{text('Show nearby food', '주변 맛집 보기')}</button>
            <button type="button" onClick={() => setRideFoodPrompt(null)}>{text('Keep riding', '계속 라이딩')}</button></div>
        </aside>}
        {view !== 'kakao' && <div className={`tour-map-rotate-controls${view === 'city' || view === 'google' ? ' tour-map-rotate-controls--tilt' : ''}`} role="group" aria-label={text('Map camera controls', '지도 방향 조작')}>
          <button type="button" className="tour-map-arrow--up" onClick={() => rotateMap('up')} aria-label={view === 'city' || view === 'google' ? text('Tilt the camera up', '카메라 시점을 올리기') : text('Move map north', '지도를 북쪽으로 이동')}>↑</button>
          <button type="button" className="tour-map-arrow--left" onClick={() => rotateMap('left')} aria-label={text('Rotate map to the left', '지도를 왼쪽으로 회전')}>←</button>
          <button type="button" className="tour-map-arrow--right" onClick={() => rotateMap('right')} aria-label={text('Rotate map to the right', '지도를 오른쪽으로 회전')}>→</button>
          <button type="button" className="tour-map-arrow--down" onClick={() => rotateMap('down')} aria-label={view === 'city' || view === 'google' ? text('Tilt the camera down', '카메라 시점을 내리기') : text('Move map south', '지도를 남쪽으로 이동')}>↓</button>
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
            ? text('Flat street map · route line, stops and public cameras. Use the arrows to pan north and south or rotate the map.', '평면 지도에 코스 선·경유지·공공 CCTV를 표시합니다. 화살표로 위아래 이동과 좌우 회전을 할 수 있어요.')
            : view === 'satellite'
              ? text('Top-down satellite imagery with no raised buildings. Use the arrows to pan or rotate the map.', '건물을 세우지 않은 위에서 본 위성 지도입니다. 화살표로 지도를 이동하거나 회전할 수 있어요.')
            : view === 'google'
              ? text('Explore this route in Google 3D. Building detail varies by area; Google Earth can open the selected stop or the downloaded KML can show the full route.', 'Google 3D로 코스를 살펴보세요. 지역별 건물 표현은 다를 수 있으며 Google Earth에서 선택한 경유지를 열거나 KML로 전체 코스를 볼 수 있습니다.')
              : text('The 3D aerial view combines satellite imagery with OpenStreetMap building heights. Building detail varies by area. Google Earth opens in a new tab at the selected stop; import the KML to see all stops.', '위성 사진 위에 OpenStreetMap 건물 높이 데이터를 입체로 겹쳐 보여줍니다. 건물 표현은 지역별 지도 데이터에 따라 달라집니다. Google Earth는 선택한 경유지를 새 탭에서 열며, KML을 가져오면 전체 경유지를 볼 수 있습니다.')}</p>
          <p className="tour-map-note">{routedPath
            ? text('The line is a suggested bicycle route between stops. Check signs and path conditions before riding.', '표시된 선은 경유지 사이의 추천 자전거 경로입니다. 출발 전에 표지와 길 상태를 확인하세요.')
            : text('The line connects stops while bicycle routing loads or is unavailable. It is not turn-by-turn directions.', '자전거 경로를 불러오는 동안 또는 불러올 수 없을 때는 경유지를 선으로 연결합니다. 이 선은 길안내가 아닙니다.')}</p>
        </div>
      </details>
    </section>
    <aside id="tour-route-sidebar" className="tour-itinerary" aria-label={text('Routes and nearby bikes', '코스와 가까운 따릉이')} hidden={!sidebarOpen}>
      <div className="tour-sidebar-topline"><strong>{text('Plan your ride', '라이딩 계획')}</strong><button type="button" onClick={() => setSidebarOpen(false)} aria-label={text('Close route panel', '코스 패널 닫기')}>×</button></div>
      <div className="tour-sidebar-heading">
        <span className="tour-card-kicker">{text('EXPLORE SEOUL BY BIKE', '따릉이로 서울 둘러보기')}</span>
        <h1>{text(route.title, route.titleKo)}</h1>
        <p>{text(route.summary, route.summaryKo)}</p>
        <div><span>◷ {text(route.suggestedTime, route.suggestedTimeKo)}</span><span>{route.stops.length} {text('stops', '곳 경유')}</span></div>
        <div className="tour-bike-time" role="status"><strong>{routeDistanceEstimated ? '≈ ' : ''}{distanceLabel(routeDistance)} · {text(`about ${bikeMinutes(routeDistance)} min by Ttareungi`, `따릉이 약 ${bikeMinutes(routeDistance)}분`)}</strong><small>{text('At 12 km/h · riding only, without sightseeing stops', '시속 12km 기준 · 관광·신호 대기 제외')}{routeDistanceEstimated ? text(' · distance estimate', ' · 거리 추정치') : ''}</small></div>
      </div>
      <section className="tour-nearby-stations" aria-live="polite">
        <div className="tour-itinerary-heading"><h3>{text('Nearby Ttareungi', '내 근처 따릉이')}</h3><span>{activeNearbyBikes?.status === 'live' ? text('LIVE', '실시간') : activeNearbyBikes?.status === 'unavailable' ? text('OFFLINE', '연결 대기') : text('LOCATION', '위치')}</span></div>
        {!userLocation ? <p>{text('Tap My location to find the nearest rental station.', '내 위치를 누르면 가까운 대여소와 자전거 수를 찾아드려요.')}</p>
          : nearbyStations.length === 0 ? <p>{text('No rental station was found within 5 km.', '5km 이내에서 대여소를 찾지 못했습니다.')}</p>
            : <div className="tour-nearby-list">{nearbyStations.slice(0, 5).map(station => <button key={station.id} type="button" disabled={station.available === 0} aria-pressed={pickupStation?.id === station.id} onClick={() => {
              setSelectedBikeStationId(station.id)
              if (userLocation) setLocationFocusRequest(request => request + 1)
            }}>
              <span><strong>{station.name}</strong><small>#{station.id} · {distanceLabel(station.distanceMeters)}</small></span>
              <b>{station.available === null ? '—' : station.available}<small>{text('bikes', '대')}</small></b>
            </button>)}</div>}
        {userLocation && <p className="tour-nearby-status">{activeNearbyBikes?.status === 'loading' ? text('Checking live bike counts…', '남은 자전거 수 확인 중…')
          : activeNearbyBikes?.status === 'live' ? text(`Updated ${new Date(activeNearbyBikes.updatedAt ?? '').toLocaleTimeString(locale === 'ko' ? 'ko-KR' : 'en-US', { hour: '2-digit', minute: '2-digit' })} · availability may change`, `최근 조회 ${new Date(activeNearbyBikes.updatedAt ?? '').toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} · 재고는 바뀔 수 있어요`)
            : activeNearbyBikes?.status === 'unavailable'
              ? text('Live data could not be reached. Showing published station locations until it reconnects.', '실시간 자료를 불러오지 못해 공개 대여소 위치를 표시합니다. 연결 후 다시 확인해 주세요.')
              : text('Station locations are available now; live bike counts are loading.', '대여소 위치를 표시했어요. 실시간 자전거 수를 불러오고 있습니다.')}</p>}
        {userLocation && activeNearbyBikes?.status === 'live' && nearbyStations.length > 0 && !pickupStation &&
          <p className="tour-nearby-status">{text('No bikes are currently available at the nearby stations.', '가까운 대여소에 현재 대여 가능한 자전거가 없습니다.')}</p>}
        <a className="tour-bikes-source" href="https://data.seoul.go.kr/dataList/datasetView.do?currentPageNo=1&infId=OA-15493&serviceKind=1&srvType=A" target="_blank" rel="noopener noreferrer">
          {text('Source: Seoul public bike availability ↗', '출처: 서울시 공공자전거 실시간 대여정보 ↗')}
        </a>
        {userLocation && pickupStation && <ol className="tour-nearby-steps">
          <li><span>{text('Walk to the selected station', '선택한 대여소까지 도보')}</span><strong>{walkingDistance === null ? '—' : `${distanceLabel(walkingDistance)} · ${Math.max(1, Math.ceil(walkingDistance / 75))}${text(' min', '분')}`}</strong></li>
          <li><span>{text(`Ride to ${destinationStop.place}`, `${destinationStop.placeKo}(으)로 이동`)}</span><strong>{approachDistance === null ? '—' : `${activeApproachRoute?.estimated ? '≈ ' : ''}${distanceLabel(approachDistance)} · ${bikeMinutes(approachDistance)}${text(' min', '분')}`}</strong></li>
        </ol>}
      </section>
      <section className="tour-sidebar-seasons" aria-label={text('Choose a season', '계절 선택')}>
        <strong>{text('Explore by season', '계절별 풍경')}</strong>
        <div>{seasonOptions.map((option, index) => <button key={option.id} type="button" aria-pressed={displaySeason === option.id}
          className={`tour-sidebar-season--${option.id}`} onClick={() => chooseSeason(option.id)}>
          <span className={`tour-sidebar-season-scene tour-sidebar-season-scene--${option.id}`} aria-hidden="true"><i /></span>
          <span className="tour-sidebar-season-copy"><strong>{text(option.en, option.ko)}</strong><small>{text(option.sceneryEn, option.sceneryKo)}</small></span>
          <b aria-hidden="true">0{index + 1}</b>
        </button>)}</div>
      </section>
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
        <details className="tour-my-map" open>
          <summary><strong>{text('My map', '나만의 지도')}</strong><span>{text('Choose what appears on the map', '지도에 표시할 항목을 선택하세요')}</span></summary>
          <div className="tour-my-map-layers" role="group" aria-label={text('Map layers', '지도 항목')}>
            <label><input type="checkbox" checked={showCourse} onChange={() => toggleMapLayer('course')} /><span>{text('Tour route', '관광 코스')}</span></label>
            <label><input type="checkbox" checked={showBikeLanes} onChange={() => toggleMapLayer('bikeLanes')} /><span className="tour-bike-lane-label">{text('Mapped bike roads', '자전거도로')}</span><small>{bikeLanesState?.status === 'loading' ? '…' : routeBikeLanes.length || ''}</small></label>
            <label><input type="checkbox" checked={showRestaurants} onChange={() => toggleMapLayer('restaurants')} /><span>{text('Restaurants', '맛집')}</span><small>{activeRoutePlaces?.status === 'loading' ? '…' : routeRestaurants.length || ''}</small></label>
            <button type="button" className="tour-my-map-cctv-button" aria-pressed={showCctv} onClick={() => toggleMapLayer('cctv')}>
              <span className="tour-cctv-dot" aria-hidden="true" /><span>{text('CCTV near route', '경로 주변 CCTV')}</span>
              <small>{cctvData.loading ? '…' : cctvData.error ? '!' : cctvCameras.length.toLocaleString()}</small><i>{showCctv ? text('ON', '켜짐') : text('OFF', '꺼짐')}</i>
            </button>
            <label><input type="checkbox" checked={showRoadInfo} onChange={() => toggleMapLayer('roadInfo')} /><span>{text('Signals & slopes', '신호등·오르막·내리막')}</span><small>{routeConditions.length || ''}</small></label>
            <label><input type="checkbox" checked={showRiders} onChange={() => toggleMapLayer('riders')} /><span>{text('AI riders', 'AI 라이더')}</span></label>
          </div>
          <p className="tour-cctv-status" role="status">{cctvData.loading
            ? text('Loading Seoul public CCTV locations…', '서울 공공 CCTV 위치를 불러오는 중…')
            : cctvData.error
              ? text('Public camera locations could not be loaded.', '공공 CCTV 위치 데이터를 불러오지 못했습니다.')
              : text(`${cctvCameras.length.toLocaleString()} cameras within 500 m of this route · ${cctvData.count.toLocaleString()} locations in source data · updated ${cctvData.latestRecordDate}`, `선택 경로 500m 이내 CCTV ${cctvCameras.length.toLocaleString()}곳 · 전체 자료 ${cctvData.count.toLocaleString()}곳 · 기준일 ${cctvData.latestRecordDate}`)}</p>
          <a className="tour-cctv-source" href="https://www.data.go.kr/data/15013094/standard.do" target="_blank" rel="noopener noreferrer">
            {text('Source: National Public CCTV Standard Data ↗', '출처: 전국 공공 CCTV 표준데이터 ↗')}
          </a>
        </details>
        {showRestaurants && activeRoutePlaces && <p className="tour-cctv-status" role="status">
          {activeRoutePlaces.status === 'loading' ? text('Loading food places along the route…', '코스 주변 식당을 불러오는 중…')
            : activeRoutePlaces.status === 'unavailable' ? text('Nearby food places could not be loaded. Try again shortly.', '주변 식당을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.')
              : activeRoutePlaces.places.length ? text(`${activeRoutePlaces.places.length} cafes and food places shown near the route.`, `코스 주변 카페·식당 ${activeRoutePlaces.places.length}곳을 표시합니다.`)
                : text('No named food places were found near this route.', '이 코스 주변에 이름이 등록된 식당을 찾지 못했습니다.')}
        </p>}
        <section className="tour-road-conditions" aria-live="polite" aria-label={text('Route terrain and traffic signals', '코스 경사와 신호등')}>
          <div className="tour-road-conditions-heading"><strong>{text('Along this route', '이 코스의 도로 정보')}</strong><span>{text('MAP DATA', '지도 자료')}</span></div>
          <div className="tour-road-conditions-grid">
            <div className="tour-road-condition-card tour-road-condition-card--signal">
              <span aria-hidden="true">🚦</span>
              <div><small>{text('Signals', '신호등')}</small><strong>{signalCountLabel}</strong></div>
            </div>
            <div className="tour-road-condition-card tour-road-condition-card--uphill">
              <span aria-hidden="true">↗</span>
              <div><small>{text('Uphill', '오르막')}</small><strong>{uphillCountLabel}</strong></div>
            </div>
            <div className="tour-road-condition-card tour-road-condition-card--downhill">
              <span aria-hidden="true">↘</span>
              <div><small>{text('Downhill', '내리막')}</small><strong>{downhillCountLabel}</strong></div>
            </div>
          </div>
          <p className="tour-road-conditions-note">
            {!routedPath
              ? text('Waiting for the bicycle route before checking signals and elevation.', '자전거 경로를 불러온 뒤 신호등과 고도 자료를 확인합니다.')
              : activeRoadConditions?.signalsStatus === 'loading' || activeRoadConditions?.gradesStatus === 'loading'
              ? text('Checking mapped crossings and elevation…', '지도 신호등과 고도 자료를 확인하고 있어요…')
              : activeRoadConditions?.signalsStatus === 'unavailable' || activeRoadConditions?.gradesStatus === 'unavailable'
                ? text('Some road data could not be reached. Markers appear only when source data is available.', '일부 도로 자료를 불러오지 못했어요. 자료를 받을 수 있을 때만 지도에 표시합니다.')
                : text('Signals are map records, not live light states. Grade estimates use terrain elevation and may miss short slopes.', '신호등은 지도 기록이며 실시간 신호 상태가 아닙니다. 경사는 지형 고도 추정치라 짧은 언덕은 빠질 수 있어요.')}
          </p>
          <div className="tour-road-conditions-sources">
            <a href="https://wiki.openstreetmap.org/wiki/Traffic_light" target="_blank" rel="noopener noreferrer">{text('Signal map data ↗', '신호등 지도 자료 ↗')}</a>
            <a href="https://open-meteo.com/en/docs/elevation-api" target="_blank" rel="noopener noreferrer">{text('Elevation source ↗', '고도 자료 출처 ↗')}</a>
          </div>
        </section>
        <div className="tour-itinerary-heading"><h3>{text('Browse routes', '코스 구경하기')}</h3><span>{routeChoices.length}{text(' routes', '개 코스')}</span></div>
        <button type="button" className="tour-flat-toggle" aria-pressed={flatOnly} onClick={() => { setFlatOnly(value => !value); setRouteSearch('') }}>
          <span aria-hidden="true">↔</span>{text('Mostly flat riverside routes', '강변 평탄 코스')}
        </button>
        <div className="tour-finder-categories" role="group" aria-label={text('Route categories', '코스 종류')}>
          {(Object.keys(categoryNames) as TourCategory[]).map(key => <button key={key} type="button" aria-pressed={!flatOnly && category === key}
            onClick={() => { setFlatOnly(false); setRouteSearch(''); const next = routes.find(candidate => candidate.category === key); if (next) onRouteSelect(next.id) }}>
            {text(...categoryNames[key])}</button>)}
        </div>
        <div className="tour-finder-routes" role="group" aria-label={text(flatOnly ? 'Mostly flat route choices' : 'Choose a route', flatOnly ? '평탄한 코스 선택' : '코스 선택')}>
          {visibleRoutes.map(candidate => <button key={candidate.id} type="button" aria-pressed={candidate.id === route.id} onClick={() => onRouteSelect(candidate.id)}>
            <strong>{text(candidate.title, candidate.titleKo)}</strong>
            <small>{text(candidate.mostlyFlat ? 'Mostly flat · ' : '', candidate.mostlyFlat ? '대체로 평탄 · ' : '')}{userLocation ? `${distanceLabel(nearestStopDistance(candidate, userLocation))} · ` : ''}{text(candidate.suggestedTime, candidate.suggestedTimeKo)}</small>
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

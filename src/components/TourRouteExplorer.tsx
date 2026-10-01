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
import { fetchBikePath, fetchBikeRoute, fetchWalkingPath, type BikeRouteInstruction, type LonLat } from '../services/bikeRoute'
import { fetchNearbyBikeStations, nearestSnapshotStations, type NearbyBikeStation } from '../services/nearbyBikes'
import { usePublicCctvData } from '../hooks/usePublicCctvData'
import { clusterPublicCameras, publicCamerasAlongRoute } from '../services/publicCctv'
import { fetchRouteAmenities, fetchRouteBikeLanes, fetchRouteElevationProfile, fetchRouteGrades, fetchRouteRestaurants, fetchRouteSignals, type RouteAmenity, type RouteBikeLane, type RouteCondition, type RouteElevationPoint, type RouteRestaurant } from '../services/routeConditions'

const MapLibreRoute3D = lazy(() => import('./MapLibreRoute3D').then(module => ({ default: module.MapLibreRoute3D })))
const SEOUL_REFERENCE = { lat: 37.5665, lng: 126.978 }
type Coordinates = { lat: number; lng: number; heading?: number }
type RotationRequest = { direction: 'left' | 'right' | 'up' | 'down'; serial: number }
type MapLayerKey = 'course' | 'restaurants' | 'cctv' | 'roadInfo' | 'riders' | 'bikeLanes' | 'amenities' | 'bikeStations'
type MapTool = 'routes' | 'course' | 'food' | 'bikeLanes' | 'cctv' | 'settings' | 'location' | '3d' | 'map' | 'facilities'
type MapLayers = Record<MapLayerKey, boolean>
const DEFAULT_MAP_LAYERS: MapLayers = { course: true, restaurants: false, cctv: false, roadInfo: true, riders: true, bikeLanes: true, amenities: true, bikeStations: true }
const FOOD_PHOTOS = {
  cafe: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=720&q=82',
  restaurant: 'https://images.unsplash.com/photo-1498654896293-37aacf113fd9?auto=format&fit=crop&w=720&q=82',
  quick: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=720&q=82',
}

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

function amenityTitle(amenity: RouteAmenity, locale: 'en' | 'ko') {
  const labels = locale === 'ko'
    ? { pump: '공기주입기', water: '음수대', toilet: '공중화장실', convenience: '편의점' }
    : { pump: 'Bike pump', water: 'Drinking water', toilet: 'Public toilet', convenience: 'Convenience store' }
  return `${labels[amenity.kind]}${amenity.name ? ` · ${amenity.name}` : ''}`
}

const AMENITY_DISPLAY = {
  pump: { icon: '🔧', shortKo: '공기주입기', shortEn: 'Air pump' },
  water: { icon: '💧', shortKo: '음수대', shortEn: 'Water' },
  toilet: { icon: '🚻', shortKo: '화장실', shortEn: 'Toilet' },
  convenience: { icon: '🏪', shortKo: '편의점', shortEn: 'Shop' },
} as const

function distanceMetersBetween(a: LonLat, b: LonLat) {
  return distanceMeters({ lng: a[0], lat: a[1] }, { lng: b[0], lat: b[1] })
}

function coordinateAtDistance(points: LonLat[], distance: number): LonLat {
  let remaining = Math.max(0, distance)
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1], to = points[index]
    const length = distanceMetersBetween(from, to)
    if (remaining <= length || index === points.length - 1) {
      const ratio = Math.max(0, Math.min(1, remaining / Math.max(1, length)))
      return [from[0] + (to[0] - from[0]) * ratio, from[1] + (to[1] - from[1]) * ratio]
    }
    remaining -= length
  }
  return points.at(-1) ?? [126.978, 37.5665]
}

function instructionLabel(instruction: BikeRouteInstruction, locale: 'en' | 'ko') {
  const { maneuver, modifier, roadName } = instruction
  const ko: Record<string, string> = { left: '왼쪽', right: '오른쪽', 'slight left': '왼쪽으로 살짝', 'slight right': '오른쪽으로 살짝', 'sharp left': '왼쪽으로 크게', 'sharp right': '오른쪽으로 크게', straight: '직진', uturn: '유턴' }
  const en: Record<string, string> = { left: 'left', right: 'right', 'slight left': 'slightly left', 'slight right': 'slightly right', 'sharp left': 'sharply left', 'sharp right': 'sharply right', straight: 'straight', uturn: 'make a U-turn' }
  if (locale === 'ko') {
    if (maneuver === 'arrive') return '목적지에 도착합니다'
    if (maneuver === 'depart') return roadName ? `${roadName}에서 출발합니다` : '출발합니다'
    if (maneuver === 'roundabout' || maneuver === 'rotary') return roadName ? `${roadName} 회전교차로로 진입합니다` : '회전교차로로 진입합니다'
    if (maneuver === 'merge') return roadName ? `${roadName} 방향으로 합류합니다` : '도로에 합류합니다'
    const action = maneuver === 'turn' || maneuver === 'end of road' ? `${ko[modifier ?? ''] ?? '앞쪽'}으로 돕니다` : '계속 직진합니다'
    return roadName ? `${roadName}에서 ${action}` : action
  }
  if (maneuver === 'arrive') return 'Arrive at your destination'
  if (maneuver === 'depart') return roadName ? `Start on ${roadName}` : 'Start riding'
  if (maneuver === 'roundabout' || maneuver === 'rotary') return roadName ? `Enter the roundabout toward ${roadName}` : 'Enter the roundabout'
  if (maneuver === 'merge') return roadName ? `Merge onto ${roadName}` : 'Merge onto the road'
  const action = maneuver === 'turn' || maneuver === 'end of road' ? `Turn ${en[modifier ?? ''] ?? 'ahead'}` : 'Continue straight'
  return roadName ? `${action} onto ${roadName}` : action
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
    if (locationFocusRequest === 0 && selectedStop === null) {
      map.setView([37.5665, 126.978], 11, { animate: false })
      return
    }
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
  const [roadviewOpen, setRoadviewOpen] = useState(false)
  const [activeMapTool, setActiveMapTool] = useState<MapTool | null>(null)
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null)
  const [trackingLocation, setTrackingLocation] = useState(false)
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState<'denied' | 'unavailable' | 'timeout' | null>(null)
  const [nearestResult, setNearestResult] = useState<{ routeId: string; distance: number } | null>(null)
  const [routeGeometry, setRouteGeometry] = useState<{ routeId: string; points: LonLat[]; distanceMeters: number; instructions: BikeRouteInstruction[] } | null>(null)
  const [routeGuidanceStatus, setRouteGuidanceStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading')
  const [amenitiesState, setAmenitiesState] = useState<{ routeId: string; places: RouteAmenity[]; status: 'loading' | 'ready' | 'unavailable' } | null>(null)
  const [elevationState, setElevationState] = useState<{ routeId: string; points: RouteElevationPoint[]; status: 'loading' | 'ready' | 'unavailable' } | null>(null)
  const [courseBikeStationsState, setCourseBikeStationsState] = useState<{ routeId: string; stations: NearbyBikeStation[]; updatedAt: string | null; status: 'loading' | 'live' | 'unavailable' } | null>(null)
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
  const [sidebarOpen, setSidebarOpen] = useState(() => window.matchMedia('(min-width: 901px)').matches)
  const [flatOnly, setFlatOnly] = useState(false)
  const [mapLayers, setMapLayers] = useState<MapLayers>(readMapLayers)
  const [showShadows, setShowShadows] = useState(true)
  const [locationFocusRequest, setLocationFocusRequest] = useState(0)
  const [routePlacesState, setRoutePlacesState] = useState<{ routeId: string; places: RouteRestaurant[]; status: 'idle' | 'loading' | 'ready' | 'unavailable' }>(
    { routeId: '', places: [], status: 'idle' },
  )
  const [locationMovementTick, setLocationMovementTick] = useState(0)
  const [rideFoodPrompt, setRideFoodPrompt] = useState<{ routeId: string; stopIndex: number } | null>(null)
  const [foodGuideOpen, setFoodGuideOpen] = useState(false)
  const [rentalLimitMinutes, setRentalLimitMinutes] = useState<60 | 120>(60)
  const [rentalDeadline, setRentalDeadline] = useState<number | null>(null)
  const [rentalNow, setRentalNow] = useState(Date.now())
  const [transferRecommendation, setTransferRecommendation] = useState<{ routeId: string; station: NearbyBikeStation | null; status: 'loading' | 'ready' | 'unavailable' } | null>(null)
  const [foodGuideAnchorOverride, setFoodGuideAnchorOverride] = useState<LonLat | null>(null)
  const [mapWeather, setMapWeather] = useState<'sunny' | 'cloudy' | 'rainy'>('sunny')
  const [rotationRequest, setRotationRequest] = useState<RotationRequest | null>(null)
  const [treeFocusRequest, setTreeFocusRequest] = useState<TreeFocusRequest | null>(null)
  const previousLocationRef = useRef<Coordinates | null>(null)
  const distanceSinceMovementTickRef = useRef(0)
  const promptedStopsRef = useRef(new Set<string>())
  const [displaySeason, setDisplaySeason] = useState<TourSeason>(() => route.season ?? seasonForToday())
  const [routeSearch, setRouteSearch] = useState('')
  const preview = useRef<HTMLElement>(null)
  const text = (en: string, ko: string) => locale === 'en' ? en : ko
  const openFoodGuideAt = useCallback((point: LonLat) => {
    setFoodGuideAnchorOverride(point)
    setFoodGuideOpen(true)
    setMapLayers(current => ({ ...current, restaurants: true }))
  }, [])
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
  const routeInstructions = routeGeometry?.routeId === route.id ? routeGeometry.instructions : []
  const activeElevation = elevationState?.routeId === route.id ? elevationState : null
  const routeAmenities = amenitiesState?.routeId === route.id ? amenitiesState.places : []
  const courseBikeStations = courseBikeStationsState?.routeId === route.id ? courseBikeStationsState.stations : []
  const activeRoadConditions = roadConditions.routeId === route.id ? roadConditions : null
  const activeRoutePlaces = routePlacesState.routeId === route.id ? routePlacesState : null
  const routeSignals = activeRoadConditions?.signals ?? []
  const routeGrades = activeRoadConditions?.grades ?? []
  const routeRestaurants = activeRoutePlaces?.places ?? []
  const foodGuideAnchor = foodGuideAnchorOverride
    ? { lat: foodGuideAnchorOverride[1], lng: foodGuideAnchorOverride[0] }
    : userLocation ?? (selectedStop === null
    ? { lat: destinationStation.lat, lng: destinationStation.lng }
    : getTouristStation(route.stops[selectedStop]?.stationId ?? destinationStop.stationId))
  const foodRecommendations = useMemo(() => routeRestaurants
    .map(place => ({ place, distance: distanceMeters(foodGuideAnchor, { lat: place.lat, lng: place.lng }) }))
    .sort((first, second) => first.distance - second.distance)
    .slice(0, 6), [foodGuideAnchor.lat, foodGuideAnchor.lng, routeRestaurants])
  const showCourse = mapLayers.course
  const showRestaurants = mapLayers.restaurants
  const showCctv = mapLayers.cctv
  const showRoadInfo = mapLayers.roadInfo
  const showRiders = mapLayers.riders
  const showBikeLanes = mapLayers.bikeLanes
  const showAmenities = mapLayers.amenities
  const showBikeStations = mapLayers.bikeStations
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
  const journeyOrigin = userLocation && pickupStation ? text('My location', '내 위치') : text(route.stops[0].place, route.stops[0].placeKo)
  const journeyDistance = userLocation && pickupStation && approachDistance !== null ? approachDistance + (walkingDistance ?? 0) : routeDistance
  const journeyMinutes = userLocation && pickupStation && approachDistance !== null
    ? bikeMinutes(approachDistance) + Math.ceil((walkingDistance ?? 0) / 75)
    : bikeMinutes(routeDistance)
  const rentalSecondsRemaining = rentalDeadline === null ? null : Math.max(0, Math.ceil((rentalDeadline - rentalNow) / 1000))
  const elevationPoints = activeElevation?.points ?? []
  const elevationMinimum = elevationPoints.length ? Math.min(...elevationPoints.map(point => point.elevationMeters)) : 0
  const elevationMaximum = elevationPoints.length ? Math.max(...elevationPoints.map(point => point.elevationMeters)) : 0
  const elevationProfileLine = elevationPoints.map((point, index) => `${(index / Math.max(1, elevationPoints.length - 1) * 320).toFixed(1)},${(76 - (point.elevationMeters - elevationMinimum) / Math.max(1, elevationMaximum - elevationMinimum) * 58).toFixed(1)}`).join(' ')
  const totalAscent = elevationPoints.slice(1).reduce((total, point, index) => total + Math.max(0, point.elevationMeters - elevationPoints[index].elevationMeters), 0)
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
    setRoadviewOpen(false)
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
    const nearbyStation = getTouristStation(route.stops[nearbyStop.index].stationId)
    setFoodGuideAnchorOverride([nearbyStation.lng, nearbyStation.lat])
    setFoodGuideOpen(true)
  }, [locationMovementTick, route, trackingLocation, userLocation, rideFoodPrompt])
  useEffect(() => {
    setRideFoodPrompt(null)
    setFoodGuideOpen(false)
    setFoodGuideAnchorOverride(null)
  }, [route.id])
  useEffect(() => {
    if (route.season) setDisplaySeason(route.season)
  }, [route.season])
  useEffect(() => {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 12000)
    setRouteGuidanceStatus('loading')
    void fetchBikeRoute(route, controller.signal)
      .then(result => { if (!controller.signal.aborted) { setRouteGeometry({ routeId: route.id, points: result.geometry, distanceMeters: result.distanceMeters ?? pathDistance(result.geometry), instructions: result.instructions }); setRouteGuidanceStatus('ready') } })
      .catch(() => { if (!controller.signal.aborted) { setRouteGeometry(null); setRouteGuidanceStatus('unavailable') } })
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
    if (!routedPath || routedPath.length < 2) { setAmenitiesState(null); setCourseBikeStationsState(null); return }
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 14_000)
    let active = true
    setAmenitiesState({ routeId: route.id, places: [], status: 'loading' })
    void fetchRouteAmenities(routedPath, controller.signal).then(places => {
      if (active) setAmenitiesState({ routeId: route.id, places, status: 'ready' })
    }).catch(() => {
      if (active) setAmenitiesState(current => current?.routeId === route.id ? { ...current, status: 'unavailable' } : current)
    }).finally(() => window.clearTimeout(timeout))
    return () => { active = false; window.clearTimeout(timeout); controller.abort() }
  }, [route.id, routedPath])
  useEffect(() => {
    if (!routedPath || routedPath.length < 2) { setElevationState(null); return }
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 10_000)
    let active = true
    setElevationState({ routeId: route.id, points: [], status: 'loading' })
    void fetchRouteElevationProfile(routedPath, controller.signal).then(points => {
      if (active) setElevationState({ routeId: route.id, points, status: 'ready' })
    }).catch(() => {
      if (active) setElevationState(current => current?.routeId === route.id ? { ...current, status: 'unavailable' } : current)
    }).finally(() => window.clearTimeout(timeout))
    return () => { active = false; window.clearTimeout(timeout); controller.abort() }
  }, [route.id, routedPath])
  useEffect(() => {
    if (!routedPath || routedPath.length < 2) return
    const controller = new AbortController()
    let active = true
    const anchors = [0, routeDistance * .5, routeDistance].map(distance => coordinateAtDistance(routedPath, distance))
    setCourseBikeStationsState({ routeId: route.id, stations: [], updatedAt: null, status: 'loading' })
    const refresh = () => {
      void Promise.allSettled(anchors.map(([lng, lat]) => fetchNearbyBikeStations({ lat, lng }, controller.signal))).then(results => {
        if (!active) return
        const successful = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])
        if (!successful.length) {
          const snapshotStations = anchors.flatMap(([lng, lat]) => nearestSnapshotStations({ lat, lng }))
            .filter(station => station.distanceMeters <= 1_250)
          const byId = new Map(snapshotStations.map(station => [station.id, station]))
          const stations = [...byId.values()].sort((a, b) => a.distanceMeters - b.distanceMeters).slice(0, 14)
          setCourseBikeStationsState({ routeId: route.id, stations, updatedAt: null, status: 'unavailable' })
          return
        }
        const byId = new Map<string, NearbyBikeStation>()
        for (const result of successful) for (const station of result.stations) {
          if (station.distanceMeters > 1_250) continue
          const previous = byId.get(station.id)
          if (!previous || station.distanceMeters < previous.distanceMeters) byId.set(station.id, station)
        }
        const stations = [...byId.values()].sort((a, b) => a.distanceMeters - b.distanceMeters).slice(0, 14)
        const updatedAt = successful.map(result => result.updatedAt).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null
        setCourseBikeStationsState({ routeId: route.id, stations, updatedAt, status: 'live' })
      })
    }
    refresh()
    const interval = window.setInterval(refresh, 90_000)
    return () => { active = false; window.clearInterval(interval); controller.abort() }
  }, [route.id, routeDistance, routedPath])
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
    if (rentalDeadline === null) return
    const interval = window.setInterval(() => setRentalNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [rentalDeadline])
  useEffect(() => {
    if (rentalDeadline === null || !routedPath?.length) { setTransferRecommendation(null); return }
    const [lng, lat] = coordinateAtDistance(routedPath, Math.min(routeDistance, rentalLimitMinutes * 200 * .8))
    const controller = new AbortController()
    let active = true
    setTransferRecommendation({ routeId: route.id, station: null, status: 'loading' })
    const refresh = () => {
      if (Date.now() >= rentalDeadline) return
      void fetchNearbyBikeStations({ lat, lng }, controller.signal).then(result => {
        if (!active) return
        const station = result.stations.filter(item => item.available !== null && item.available > 0).sort((a, b) => a.distanceMeters - b.distanceMeters)[0] ?? null
        setTransferRecommendation({ routeId: route.id, station, status: 'ready' })
      }).catch(() => {
        if (active) setTransferRecommendation({ routeId: route.id, station: nearestSnapshotStations({ lat, lng }, 1)[0] ?? null, status: 'unavailable' })
      })
    }
    refresh()
    const interval = window.setInterval(refresh, 5 * 60_000)
    return () => { active = false; window.clearInterval(interval); controller.abort() }
  }, [rentalDeadline, rentalLimitMinutes, route.id, routeDistance, routedPath])
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
    {showCourse && <Polyline positions={linePoints} pathOptions={{ color: '#fff', weight: 14, opacity: .98 }} />}
    {showCourse && <Polyline positions={linePoints} pathOptions={{ color: '#ff3b30', weight: 8, opacity: 1 }} />}
    {showCourse && approachPoints.length > 1 && <Polyline positions={approachPoints} pathOptions={{ color: '#fff', weight: 14, opacity: .98 }} />}
    {showCourse && approachPoints.length > 1 && <Polyline positions={approachPoints} pathOptions={{ color: '#ff3b30', weight: 8, opacity: 1, dashArray: approachRoute?.estimated ? '8 7' : undefined }} />}
    {walkingPoints.length > 1 && <Polyline positions={walkingPoints} pathOptions={{ color: '#fff', weight: 8, opacity: .95 }} />}
    {walkingPoints.length > 1 && <Polyline positions={walkingPoints} pathOptions={{ color: '#546a78', weight: 4, opacity: 1, dashArray: '6 6' }} />}
    {showBikeStations && courseBikeStations.map(station => <Marker key={`live-bike-${station.id}`} position={[station.lat, station.lng]}
      icon={divIcon({ className: 'tour-live-bike-icon', html: `<span>${station.available ?? '–'}</span>`, iconSize: [34, 34], iconAnchor: [17, 30] })}>
      <Tooltip>{station.name} · {station.available === null ? '—' : station.available} {text('bikes available', '대 대여 가능')}</Tooltip>
    </Marker>)}
    {showAmenities && routeAmenities.map(amenity => <Marker key={amenity.id} position={[amenity.lat, amenity.lng]}
      icon={divIcon({ className: `tour-amenity-icon tour-amenity-icon--${amenity.kind}`, html: `<span>${AMENITY_DISPLAY[amenity.kind].icon}</span><b>${locale === 'ko' ? ({ pump: '공기', water: '물', toilet: '화장실', convenience: '편의점' } as const)[amenity.kind] : AMENITY_DISPLAY[amenity.kind].shortEn}</b>`, iconSize: [86, 34], iconAnchor: [43, 17] })}>
      <Tooltip>{amenityTitle(amenity, locale)} · {distanceLabel(amenity.distanceMeters)}</Tooltip>
    </Marker>)}
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
        <div><span className="tour-card-kicker">{text('01 ROUTE · 02 MAP · 03 RIDE', '01 코스 · 02 지도 · 03 출발')}</span>
          <strong aria-live="polite">{selectedStop === null ? text('Entire route', '전체 코스') : text(route.stops[selectedStop].place, route.stops[selectedStop].placeKo)}</strong></div>
      </div>
      <div className="tour-route-summary" aria-label={text('Selected route overview', '선택한 경로 안내')}>
        <div className="tour-route-summary-stops"><span>{journeyOrigin}</span><i aria-hidden="true">→</i><strong>{text(destinationStop.place, destinationStop.placeKo)}</strong></div>
        <div className="tour-route-summary-metrics"><span><small>{text('DISTANCE', '거리')}</small><strong>{(userLocation && pickupStation ? activeApproachRoute?.estimated !== false : routeDistanceEstimated) ? '≈ ' : ''}{distanceLabel(journeyDistance)}</strong></span>
          <span><small>{text('ESTIMATED TIME', '예상 시간')}</small><strong>{text(`About ${journeyMinutes} min`, `약 ${journeyMinutes}분`)}</strong></span>
          {pickupStation && <span className="tour-route-summary-bikes"><small>{text('BIKES NEARBY', '대여 가능')}</small><strong>{pickupStation.available === null ? '—' : `${pickupStation.available}${text(' bikes', '대')}`}</strong></span>}
        </div>
      </div>
      <aside className="tour-elevation-card" aria-label={text('Route elevation profile', '코스 고도 그래프')}>
        <div className="tour-elevation-heading"><div><small>{text('ROUTE ELEVATION', '코스 고도')}</small><strong>{activeElevation?.status === 'loading' ? text('Loading profile…', '고도 정보를 불러오는 중…') : activeElevation?.status === 'unavailable' ? text('Profile unavailable', '고도 정보 없음') : text(`Total climb ${Math.round(totalAscent)} m`, `누적 오르막 ${Math.round(totalAscent)} m`)}</strong></div><span>{elevationPoints.length ? `${Math.round(elevationMinimum)}–${Math.round(elevationMaximum)} m` : ''}</span></div>
        {elevationProfileLine && <svg viewBox="0 0 320 84" preserveAspectRatio="none" role="img" aria-label={text('Elevation changes over the route', '전체 경로의 고도 변화')}><path d={`M ${elevationProfileLine.replaceAll(' ', ' L ')} L 320 82 L 0 82 Z`} className="tour-elevation-fill" /><polyline points={elevationProfileLine} className="tour-elevation-line" /></svg>}
      </aside>
      <div className="tour-map-quick-guide" aria-label={text('How to start', '빠른 이용 안내')}>
        <span><b>1</b>{text('Choose a route', '코스를 골라요')}</span><i aria-hidden="true">›</i>
        <span><b>2</b>{text('Check the map', '지도를 살펴봐요')}</span><i aria-hidden="true">›</i>
        <span><b>3</b>{text('Find a bike nearby', '내 주변 자전거를 찾아요')}</span>
      </div>
      <div className={`tour-map-stage tour-map-stage--${mapWeather}`} onMouseLeave={() => hoverStop(null)}>
        {view === 'city' && <Suspense fallback={<div className="tour-maplibre-3d tour-map-starting">{map}<p className="tour-map-loading-label" role="status">{text('Preparing the 3D city view…', '3D 도시 지도를 준비하고 있어요…')}</p></div>}>
          <MapLibreRoute3D key={view} viewMode="city" route={route} routePath={routedPath} accessPath={approachPath} accessEstimated={activeApproachRoute?.estimated ?? false} walkPath={walkingPath} pickupStation={pickupStation} bikeLanes={routeBikeLanes} showBikeLanes={showBikeLanes} amenities={routeAmenities} showAmenities={showAmenities} bikeStations={courseBikeStations} showBikeStations={showBikeStations} season={displaySeason} weather={mapWeather} routeConditions={routeConditions} restaurants={routeRestaurants} showCourse={showCourse} showRestaurants={showRestaurants} showRoadInfo={showRoadInfo} showRiders={showRiders} cctvCameras={cctvCameras} showCctv={showCctv} showShadows={showShadows} locationFocusRequest={locationFocusRequest} rotationRequest={rotationRequest} treeFocusRequest={treeFocusRequest} onFocusTree={focusTree} onFoodGuideOpen={openFoodGuideAt} locale={locale} userLocation={userLocation} selectedStop={selectedStop} onSelectStop={selectStop} onHoverStop={hoverStop} shadowAzimuth={solar.shadowAzimuth} sunElevation={solar.elevation} fallback={map} />
        </Suspense>}
        {view === 'google' && hasGoogleMapsKey && <GoogleRoute3D route={route} routePath={routedPath} accessPath={approachPath} season={displaySeason} routeConditions={routeConditions} restaurants={routeRestaurants} showCourse={showCourse} showRestaurants={showRestaurants} showRoadInfo={showRoadInfo} showRiders={showRiders} showCctv={showCctv} cctvCameras={cctvCameras} locationFocusRequest={locationFocusRequest} rotationRequest={rotationRequest} locale={locale} userLocation={userLocation} selectedStop={selectedStop} onSelectStop={selectStop} onHoverStop={hoverStop} onFoodGuideOpen={openFoodGuideAt} fallback={map} />}
        {view === 'kakao' && hasKakaoMapsKey && <KakaoRouteMap route={route} routePath={routedPath} accessPath={approachPath} accessEstimated={activeApproachRoute?.estimated ?? false} bikeLanes={routeBikeLanes} showBikeLanes={showBikeLanes} amenities={routeAmenities} showAmenities={showAmenities} bikeStations={courseBikeStations} showBikeStations={showBikeStations} season={displaySeason} showRiders={showRiders} routeConditions={routeConditions} restaurants={routeRestaurants} showCourse={showCourse} showRestaurants={showRestaurants} showRoadInfo={showRoadInfo} showCctv={showCctv} cctvCameras={cctvCameras} locationFocusRequest={locationFocusRequest} locale={locale} userLocation={userLocation} selectedStop={selectedStop} onSelectStop={selectStop} onHoverStop={hoverStop} onFocusTree={focusTree} onFoodGuideOpen={openFoodGuideAt} showRoadview={roadviewOpen} onCloseRoadview={() => setRoadviewOpen(false)} fallback={map} />}
        {(view === 'satellite' || view === 'map') && <Suspense fallback={<div className="tour-maplibre-3d tour-map-starting">{map}</div>}>
          <MapLibreRoute3D key={view} viewMode={view} route={route} routePath={routedPath} accessPath={approachPath} accessEstimated={activeApproachRoute?.estimated ?? false} walkPath={walkingPath} pickupStation={pickupStation} bikeLanes={routeBikeLanes} showBikeLanes={showBikeLanes} amenities={routeAmenities} showAmenities={showAmenities} bikeStations={courseBikeStations} showBikeStations={showBikeStations} season={displaySeason} weather={mapWeather} routeConditions={routeConditions} restaurants={routeRestaurants} showCourse={showCourse} showRestaurants={showRestaurants} showRoadInfo={showRoadInfo} showRiders={showRiders} cctvCameras={cctvCameras} showCctv={showCctv} showShadows={showShadows} locationFocusRequest={locationFocusRequest} rotationRequest={rotationRequest} treeFocusRequest={treeFocusRequest} onFocusTree={focusTree} onFoodGuideOpen={openFoodGuideAt} locale={locale} userLocation={userLocation} selectedStop={selectedStop} onSelectStop={selectStop} onHoverStop={hoverStop} shadowAzimuth={solar.shadowAzimuth} sunElevation={solar.elevation} fallback={map} />
        </Suspense>}
        <aside className="tour-map-control-rail" aria-label={text('Map controls', '지도 도구')}>
          <button type="button" className="tour-map-rail-sidebar-toggle" aria-expanded={sidebarOpen || activeMapTool === 'routes'}
            onClick={() => { if (window.matchMedia('(min-width: 901px)').matches) { setSidebarOpen(open => !open); setActiveMapTool(null) } else setActiveMapTool(current => current === 'routes' ? null : 'routes') }}><span aria-hidden="true">☷</span>{text('Routes', '코스 목록')}</button>
          <nav className="tour-map-quick-filters" aria-label={text('Quick map layers', '빠른 지도 필터')}>
            <button type="button" aria-pressed={showCourse} onClick={() => { toggleMapLayer('course'); setActiveMapTool('course') }}><span aria-hidden="true">⌁</span>{text('Route', '코스')}</button>
            <button type="button" aria-pressed={showRestaurants} onClick={() => { toggleMapLayer('restaurants'); setActiveMapTool('food') }}><span aria-hidden="true">♨</span>{text('Food', '맛집')}</button>
            <button type="button" aria-pressed={showBikeLanes} onClick={() => { toggleMapLayer('bikeLanes'); setActiveMapTool('bikeLanes') }}><span aria-hidden="true">↗</span>{text('Bike path', '자전거도로')}</button>
            <button type="button" aria-pressed={showCctv} onClick={() => { toggleMapLayer('cctv'); setActiveMapTool('cctv') }}><span aria-hidden="true">◉</span>{text('CCTV', 'CCTV')}</button>
            <button type="button" aria-pressed={showAmenities} onClick={() => { if (!showAmenities) toggleMapLayer('amenities'); setActiveMapTool('facilities') }}><span aria-hidden="true">⌖</span>{text('Facilities', '시설')}</button>
          </nav>
          <label className="tour-map-mode-select"><span>{text('Map view', '지도 보기')}</span>
            <select value={view} aria-label={text('Choose a map view', '지도 종류 선택')} onChange={event => chooseMapView(event.currentTarget.value as typeof view)}>
              {hasKakaoMapsKey && <option value="kakao">{text('Kakao map · street view', '카카오 지도 · 도로')}</option>}
              <option value="city">{text('3D city', '3D 도시')}</option>
              <option value="satellite">{text('2D satellite', '2D 위성')}</option>
              <option value="map">{text('Flat map', '평면 지도')}</option>
              {hasGoogleMapsKey && <option value="google">Google 3D</option>}
            </select>
          </label>
          <button type="button" className="tour-map-3d-button" aria-pressed={view === 'city'} onClick={() => { chooseMapView('city'); setActiveMapTool('3d') }}>
            <span aria-hidden="true">3D</span>{text('3D city', '3D 도시')}
          </button>
          {hasKakaoMapsKey && <button type="button" className="tour-roadview-toggle" aria-pressed={roadviewOpen}
            onClick={() => { setActiveMapTool(null); setFoodGuideOpen(false); setView('kakao'); setRoadviewOpen(true) }}>
            <span aria-hidden="true">▣</span>{text('Road view', '로드뷰')}
          </button>}
        <button type="button" className="tour-map-settings-button" aria-expanded={activeMapTool === 'settings'} onClick={() => setActiveMapTool(current => current === 'settings' ? null : 'settings')}>
          <span aria-hidden="true">⚙</span>{text('Settings', '설정')}
        </button>
        <button type="button" className="tour-map-locate" onClick={() => { locateNearestRoute(false); setActiveMapTool('location') }} disabled={locating} aria-label={text('Find a nearby Ttareungi station and show my route', '가까운 따릉이 대여소와 이동 경로 찾기')}>
          <span aria-hidden="true">◎</span>{locating ? text('Locating…', '위치 확인 중…') : text('My location', '내 위치')}
        </button>
        <button type="button" className={`tour-food-guide-trigger${rideFoodPrompt?.routeId === route.id ? ' is-nearby' : ''}`}
          aria-expanded={foodGuideOpen} aria-controls="tour-food-guide-panel" onClick={() => {
            setActiveMapTool(null)
            setFoodGuideOpen(open => !open)
            setMapLayers(current => ({ ...current, restaurants: true }))
          }}>
          <span className="tour-food-guide-avatar" aria-hidden="true">🧑‍🍳</span>
          <span><small>{text('LOCAL FOOD GUIDE', '동네 맛집 가이드')}</small><strong>{text('Find a good stop', '근처 맛집 추천')}</strong></span>
          <i aria-hidden="true">{foodGuideOpen ? '−' : '+'}</i>
        </button>
        </aside>
        {activeMapTool && <aside className="tour-map-side-panel" aria-label={text('Map tools panel', '지도 도구 패널')}>
          <header className="tour-map-side-panel-header">
            <div><small>{text('MAP TOOLS', '지도 도구')}</small><strong>{activeMapTool === 'routes' ? text('Routes and stops', '코스와 경유지')
              : activeMapTool === 'course' ? text('Route display', '코스 표시')
                : activeMapTool === 'food' ? text('Food along the way', '경로 주변 맛집')
                  : activeMapTool === 'bikeLanes' ? text('Bike paths', '자전거도로')
                    : activeMapTool === 'cctv' ? text('Public CCTV', '공공 CCTV')
                      : activeMapTool === 'settings' ? text('Map settings', '지도 설정')
                        : activeMapTool === 'location' ? text('Nearby bikes', '내 주변 따릉이')
                          : activeMapTool === '3d' ? text('3D city view', '3D 도시 보기')
                            : activeMapTool === 'facilities' ? text('Rider facilities', '라이더 편의시설') : text('Map view', '지도 보기')}</strong></div>
            <button type="button" onClick={() => setActiveMapTool(null)} aria-label={text('Close map panel', '지도 패널 닫기')}>×</button>
          </header>
          <div className="tour-map-side-panel-body">
            {activeMapTool === 'routes' && <>
              <div className="tour-map-panel-feature"><small>{text('SELECTED ROUTE', '선택한 코스')}</small><strong>{text(route.title, route.titleKo)}</strong>
                <span>{distanceLabel(routeDistance)} · {text(`about ${bikeMinutes(routeDistance)} min by bike`, `따릉이 약 ${bikeMinutes(routeDistance)}분`)}</span></div>
              <section className="tour-course-bike-stations"><h3>{text('Live bikes along this course', '코스 주변 실시간 대여소')}</h3>
                <p>{courseBikeStationsState?.status === 'loading' ? text('Checking nearby stations…', '주변 대여소를 확인 중입니다…') : courseBikeStationsState?.status === 'unavailable' ? text('Live station counts are temporarily unavailable.', '실시간 대여소 정보를 가져올 수 없습니다.') : text(`${courseBikeStations.length} stations near this route`, `경로 주변 ${courseBikeStations.length}곳`)}</p>
                {courseBikeStations.length > 0 && <ul>{courseBikeStations.slice(0, 8).map(station => <li key={station.id}><span><strong>{station.name}</strong><small>{distanceLabel(station.distanceMeters)} {text('from route', '경로 근처')}</small></span><b className={station.available === 0 ? 'is-empty' : ''}>{station.available ?? '—'}<small>{text('bikes', '대')}</small></b></li>)}</ul>}
              </section>
              <section className="tour-destination-list"><h3>{text('Choose your destination', '가고 싶은 곳을 선택하세요')}</h3><p>{text('Directions begin after you pick a stop.', '목적지를 선택하면 길 안내가 시작됩니다.')}</p>
                {route.stops.map((stop, index) => <button type="button" key={stop.stationId} aria-pressed={selectedStop === index} onClick={() => selectStop(index)}><b>{index + 1}</b><span>{text(stop.place, stop.placeKo)}</span><small>{selectedStop === index ? text('Selected', '선택됨') : text('Choose', '선택')}</small></button>)}
              </section>
              <button type="button" className="tour-map-panel-action tour-map-panel-action--quiet" onClick={() => { setActiveMapTool(null); setSidebarOpen(true) }}>{text('Browse all courses', '전체 코스 둘러보기')} ↗</button>
              <section className="tour-turn-guide"><h3>{text('Turn-by-turn guide', '구간별 길 안내')}</h3>
                {selectedStop === null ? <p>{text('Choose a destination above or tap a numbered stop on the map to start directions.', '위에서 목적지를 고르거나 지도 위 번호가 있는 지점을 누르면 길 안내가 시작됩니다.')}</p>
                  : !routeInstructions.length ? <p>{routeGuidanceStatus === 'loading' ? text('Loading bicycle directions…', '자전거 경로 안내를 불러오는 중입니다…') : routeGuidanceStatus === 'unavailable' ? text('Could not load turn-by-turn directions. Check your connection and try again.', '상세 경로 안내를 불러오지 못했습니다. 연결을 확인하고 다시 시도해 주세요.') : text('Detailed bicycle directions are unavailable for this route.', '이 코스는 상세 자전거 길 안내를 제공하지 않습니다.')}</p>
                    : <ol>{routeInstructions.slice(0, 18).map((instruction, index) => <li key={`${instruction.point.join(',')}-${index}`}><span>{instructionLabel(instruction, locale)}</span><small>{distanceLabel(instruction.distanceMeters)}{instruction.roadName ? ` · ${instruction.roadName}` : ''}</small></li>)}</ol>}
              </section>
              <p>{text(route.summary, route.summaryKo)}</p>
            </>}
            {activeMapTool === 'course' && <>
              <p>{text('Show the selected route and the path from your location.', '선택한 코스와 내 위치에서 출발하는 경로를 지도에 표시합니다.')}</p>
              <button type="button" className="tour-map-panel-action" aria-pressed={showCourse} onClick={() => toggleMapLayer('course')}>{showCourse ? text('Hide route', '코스 숨기기') : text('Show route', '코스 표시')}</button>
            </>}
            {activeMapTool === 'food' && <>
              <p>{text(`${routeRestaurants.length} nearby places found along this route.`, `경로 주변 맛집 ${routeRestaurants.length}곳을 찾았습니다.`)}</p>
              <button type="button" className="tour-map-panel-action" aria-pressed={showRestaurants} onClick={() => toggleMapLayer('restaurants')}>{showRestaurants ? text('Hide food markers', '맛집 표시 끄기') : text('Show food markers', '맛집 표시 켜기')}</button>
              <button type="button" className="tour-map-panel-action tour-map-panel-action--quiet" onClick={() => { setFoodGuideOpen(true); setMapLayers(current => ({ ...current, restaurants: true })); setActiveMapTool(null) }}>{text('Open chef recommendations', '요리사 맛집 추천 열기')}</button>
            </>}
            {activeMapTool === 'bikeLanes' && <>
              <p>{bikeLanesState?.status === 'loading' ? text('Loading bike paths…', '자전거도로를 불러오는 중…') : text(`${routeBikeLanes.length} mapped bike path segments near this route.`, `경로 주변 자전거도로 ${routeBikeLanes.length}개 구간을 찾았습니다.`)}</p>
              <button type="button" className="tour-map-panel-action" aria-pressed={showBikeLanes} onClick={() => toggleMapLayer('bikeLanes')}>{showBikeLanes ? text('Hide bike paths', '자전거도로 숨기기') : text('Show bike paths', '자전거도로 표시')}</button>
            </>}
            {activeMapTool === 'cctv' && <>
              <p>{text(`${cctvCameras.length.toLocaleString()} public CCTV locations are available.`, `공공 CCTV ${cctvCameras.length.toLocaleString()}곳 정보를 사용할 수 있습니다.`)}</p>
              <button type="button" className="tour-map-panel-action" aria-pressed={showCctv} onClick={() => toggleMapLayer('cctv')}>{showCctv ? text('Hide CCTV', 'CCTV 숨기기') : text('Show CCTV', 'CCTV 표시')}</button>
            </>}
            {activeMapTool === 'facilities' && <>
              <p>{amenitiesState?.status === 'loading' ? text('Searching near the selected route…', '선택한 코스 주변 시설을 찾고 있습니다…')
                : amenitiesState?.status === 'unavailable' ? text('Facility data is temporarily unavailable. Try again later.', '시설 정보를 불러오지 못했어요. 잠시 후 다시 확인해 주세요.')
                  : routeAmenities.length ? text(`${routeAmenities.length} facilities are marked along this route.`, `이 코스 주변 편의시설 ${routeAmenities.length}곳을 지도에 표시했어요.`)
                    : text('No facilities are currently listed near this route.', '현재 이 코스 주변에 등록된 편의시설이 없습니다.')}</p>
              <button type="button" className="tour-map-panel-action" aria-pressed={showAmenities} onClick={() => toggleMapLayer('amenities')}>{showAmenities ? text('Hide facility markers', '편의시설 표시 끄기') : text('Show facility markers', '편의시설 표시 켜기')}</button>
              <section className="tour-facility-list" aria-label={text('Facility legend and nearby places', '편의시설 범례와 주변 장소')}>
                {(['pump', 'water', 'toilet', 'convenience'] as const).map(kind => {
                  const matches = routeAmenities.filter(place => place.kind === kind)
                  const display = AMENITY_DISPLAY[kind]
                  return <div className={`tour-facility-group tour-facility-group--${kind}`} key={kind}>
                    <div className="tour-facility-heading"><span aria-hidden="true">{display.icon}</span><strong>{locale === 'ko' ? display.shortKo : display.shortEn}</strong><b>{matches.length}</b></div>
                    {matches.length ? <ul>{matches.slice(0, 4).map(place => <li key={place.id}><span>{place.name || (locale === 'ko' ? display.shortKo : display.shortEn)}</span><small>{distanceLabel(place.distanceMeters)} {text('along route', '지점')}</small></li>)}</ul>
                      : <p>{text('None found on this route', '이 코스 주변 등록 정보 없음')}</p>}
                  </div>
                })}
              </section>
            </>}
            {activeMapTool === 'settings' && <>
              <section className="tour-map-panel-section"><h3>{text('Map style', '지도 종류')}</h3>
                <div className="tour-map-view-options">
                  {hasKakaoMapsKey && <button type="button" aria-pressed={view === 'kakao'} onClick={() => chooseMapView('kakao')}>{text('Kakao street', '카카오 도로')}</button>}
                  <button type="button" aria-pressed={view === 'city'} onClick={() => chooseMapView('city')}>3D {text('City', '도시')}</button>
                  <button type="button" aria-pressed={view === 'satellite'} onClick={() => chooseMapView('satellite')}>{text('Satellite', '위성')}</button>
                  <button type="button" aria-pressed={view === 'map'} onClick={() => chooseMapView('map')}>{text('Flat map', '평면')}</button>
                  {hasGoogleMapsKey && <button type="button" aria-pressed={view === 'google'} onClick={() => chooseMapView('google')}>Google 3D</button>}
                </div>
              </section>
              <section className="tour-map-panel-section"><h3>{text('Seasonal scenery', '계절 풍경')}</h3>
                <div className="tour-season-picker" role="group" aria-label={text('Seasonal map scenery', '계절별 지도 풍경')}>
                  {seasonOptions.map(option => <button key={option.id} type="button" aria-pressed={displaySeason === option.id}
                    className={`tour-season-tab tour-season-tab--${option.id}`} onClick={() => chooseSeason(option.id)}>{text(option.en, option.ko)}</button>)}
                </div><p className="tour-map-panel-note">{text(activeSeason.sceneryEn, activeSeason.sceneryKo)}</p>
              </section>
              <section className="tour-map-panel-section"><h3>{text('Weather', '날씨 표현')}</h3>
                <div className="tour-weather-setting"><div role="group" aria-label={text('Choose weather appearance', '날씨 표현 선택')}>
                  {([['sunny', '☀️', 'Sun', '햇볕'], ['cloudy', '☁️', 'Cloudy', '흐림'], ['rainy', '🌧️', 'Rain', '비']] as const).map(([id, icon, en, ko]) =>
                    <button key={id} type="button" aria-pressed={mapWeather === id} onClick={() => setMapWeather(id)}><span aria-hidden="true">{icon}</span>{text(en, ko)}</button>)}
                </div></div>
              </section>
              <section className="tour-map-panel-section tour-map-panel-section--actions"><h3>{text('On the map', '지도에 표시')}</h3>
                <label className="tour-map-panel-check"><input type="checkbox" checked={showAmenities} onChange={() => setMapLayers(current => ({ ...current, amenities: !current.amenities }))} /><span>{text('Rider facilities', '라이더 편의시설')}</span><small>{amenitiesState?.status === 'loading' ? '…' : routeAmenities.length}</small></label>
                <label className="tour-map-panel-check"><input type="checkbox" checked={showBikeStations} onChange={() => setMapLayers(current => ({ ...current, bikeStations: !current.bikeStations }))} /><span>{text('Live Ttareungi stations', '실시간 따릉이 대여소')}</span><small>{courseBikeStations.length}</small></label>
                <button type="button" className="tour-map-panel-action" onClick={viewTrees}>{text('🌳 Show tree route', '🌳 나무길 보기')}</button>
                <button type="button" className="tour-map-panel-action" aria-pressed={showShadows} onClick={() => setShowShadows(value => !value)}>{text('Building shadows', '건물 그림자')} · {showShadows ? text('On', '켜짐') : text('Off', '꺼짐')}</button>
              </section>
            </>}
            {activeMapTool === 'location' && <>
              <p>{userLocation ? text('Your current location is on the map.', '현재 위치를 지도에 표시했습니다.') : text('Allow location access to find the nearest rental station.', '가까운 대여소를 찾으려면 위치 접근을 허용해 주세요.')}</p>
              <button type="button" className="tour-map-panel-action" onClick={() => locateNearestRoute(false)} disabled={locating}>{locating ? text('Finding your location…', '위치 확인 중…') : text('Find bikes near me', '내 주변 대여소 찾기')}</button>
              {pickupStation && <div className="tour-map-panel-feature"><small>{text('NEAREST RENTAL STATION', '가까운 대여소')}</small><strong>{pickupStation.name}</strong><span>{pickupStation.available === null ? text('Live count unavailable', '실시간 잔여 수 확인 불가') : text(`${pickupStation.available} bikes available`, `${pickupStation.available}대 대여 가능`)}</span></div>}
              <section className="tour-rental-timer"><h3>{text('Rental return reminder', '재대여 알림 타이머')}</h3><p>{text('Choose your pass length. We will find a live station near the route before it expires.', '이용권 시간을 고르면 만료 전에 경로 주변 실시간 대여소를 찾아드립니다.')}</p>
                <div className="tour-rental-duration" role="group" aria-label={text('Rental time limit', '따릉이 이용 시간')}>{([60, 120] as const).map(minutes => <button type="button" key={minutes} aria-pressed={rentalLimitMinutes === minutes} onClick={() => setRentalLimitMinutes(minutes)}>{minutes === 60 ? text('1 hour', '1시간') : text('2 hours', '2시간')}</button>)}</div>
                {rentalSecondsRemaining !== null && <strong className={`tour-rental-countdown${rentalSecondsRemaining <= 900 ? ' is-due-soon' : ''}`} role="timer" aria-live="polite">{String(Math.floor(rentalSecondsRemaining / 3600)).padStart(2, '0')}:{String(Math.floor(rentalSecondsRemaining % 3600 / 60)).padStart(2, '0')}:{String(rentalSecondsRemaining % 60).padStart(2, '0')}</strong>}
                <button type="button" className="tour-map-panel-action" onClick={() => { setRentalNow(Date.now()); setRentalDeadline(current => current === null ? Date.now() + rentalLimitMinutes * 60_000 : null) }}>{rentalDeadline === null ? text('Start rental timer', '대여 타이머 시작') : text('Stop rental timer', '타이머 종료')}</button>
                {rentalDeadline !== null && <div className="tour-transfer-recommendation" role="status" aria-live="polite"><small>{text('SUGGESTED RE-RENTAL STOP', '추천 재대여 대여소')}</small>{transferRecommendation?.status === 'loading' ? <strong>{text('Checking live bike availability…', '실시간 잔여 자전거 확인 중…')}</strong> : transferRecommendation?.station ? <><strong>{transferRecommendation.station.name}</strong><span>{transferRecommendation.station.available === null ? text('Live bike count unavailable', '실시간 잔여 대수 확인 불가') : `${transferRecommendation.station.available}${text(' bikes available', '대 대여 가능')}`} · {distanceLabel(transferRecommendation.station.distanceMeters)} {text('from route', '경로 지점')}</span></> : <strong>{transferRecommendation?.status === 'unavailable' ? text('Live station data could not be reached.', '실시간 대여소 정보를 가져오지 못했습니다.') : text('No available bike station was found near the route point.', '경로 근처에 대여 가능한 대여소를 찾지 못했습니다.')}</strong>}{rentalSecondsRemaining !== null && rentalSecondsRemaining <= 900 && <b>{text('Rental time is nearly up. Return and rent again here.', '대여시간이 얼마 남지 않았어요. 이곳에 반납 후 다시 대여하세요.')}</b>}</div>}
              </section>
            </>}
            {activeMapTool === '3d' && <>
              <p>{text('Explore the route with raised buildings and the 3D camera controls.', '건물 입체 표현과 카메라 조작으로 코스를 살펴보세요.')}</p>
              <div className="tour-map-view-options"><button type="button" aria-pressed={view === 'city'} onClick={() => chooseMapView('city')}>{text('3D city', '3D 도시')}</button>
                <button type="button" aria-pressed={view === 'satellite'} onClick={() => chooseMapView('satellite')}>{text('2D satellite', '2D 위성')}</button></div>
            </>}
          </div>
        </aside>}
        {pickupStation && <div className="tour-bike-stock-overlay" role="status" aria-live="polite">
          <span aria-hidden="true">🚲</span><div><strong>{pickupStation.available !== null
            ? text(`${pickupStation.available} bikes available`, `${pickupStation.available}대 대여 가능`)
            : activeNearbyBikes?.status === 'unavailable' ? text('Live count unavailable', '실시간 잔여 대수 확인 불가') : text('Checking bikes', '잔여 수 확인 중')}</strong><small>{pickupStation.name}</small></div>
        </div>}
        {foodGuideOpen && <aside className="tour-food-guide-panel" id="tour-food-guide-panel" aria-label={text('Food recommendations near the route', '경로 주변 맛집 추천')}>
          <div className="tour-food-guide-heading">
            <span><small>{text('A GOOD BITE ALONG THE WAY', '라이딩 중 잠깐 들르기')}</small><strong>{rideFoodPrompt?.routeId === route.id && route.stops[rideFoodPrompt.stopIndex]
              ? text(`Near ${route.stops[rideFoodPrompt.stopIndex].place}`, `${route.stops[rideFoodPrompt.stopIndex].placeKo} 근처`)
              : text('Recommended along your route', '경로 주변 추천 맛집')}</strong></span>
            <button type="button" aria-label={text('Close recommendations', '추천 닫기')} onClick={() => setFoodGuideOpen(false)}>×</button>
          </div>
          {activeRoutePlaces?.status === 'loading' && <p className="tour-food-guide-status">{text('Finding places along the route…', '경로 주변 가게를 찾고 있어요…')}</p>}
          {activeRoutePlaces?.status === 'unavailable' && <p className="tour-food-guide-status">{text('Food places are temporarily unavailable. Try again shortly.', '맛집 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.')}</p>}
          {activeRoutePlaces?.status === 'ready' && foodRecommendations.length === 0 && <p className="tour-food-guide-status">{text('No listed restaurants were found along this route yet.', '아직 이 경로 주변에 등록된 음식점이 없어요.')}</p>}
          {activeRoutePlaces?.status === 'ready' && foodRecommendations.length > 0 && <div className="tour-food-guide-list">
            {foodRecommendations.map(({ place, distance }) => {
              const query = encodeURIComponent(`${place.name} 서울 맛집`)
              const photo = FOOD_PHOTOS[place.kind]
              return <article className="tour-food-card" key={place.id}>
                <img src={photo} alt={text(`Representative ${place.kind === 'cafe' ? 'cafe' : 'food'} photo`, '가게 대표 사진이 아닌 음식 참고 이미지')} loading="lazy" />
                <div className="tour-food-card-body"><div><strong>{place.name}</strong><small>{text(`${distanceLabel(distance)} away`, `${distanceLabel(distance)} 거리`)}{place.cuisine ? ` · ${place.cuisine}` : ''}</small></div>
                  <div className="tour-food-social-links">
                    <a href={`https://search.naver.com/search.naver?where=blog&query=${query}`} target="_blank" rel="noopener noreferrer">{text('Blog', '블로그')}</a>
                    <a href={`https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(place.name)}`} target="_blank" rel="noopener noreferrer">Instagram</a>
                    <a href={`https://www.tiktok.com/search?q=${encodeURIComponent(place.name)}`} target="_blank" rel="noopener noreferrer">TikTok</a>
                  </div>
                </div>
              </article>
            })}
          </div>}
          <p className="tour-food-guide-disclaimer">{text('Photos are representative menu inspiration. Social links open public search results.', '사진은 메뉴 참고용 이미지이며, 블로그·SNS 버튼은 공개 검색 결과로 이동합니다.')}</p>
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
            <label><input type="checkbox" checked={showRiders} onChange={() => toggleMapLayer('riders')} /><span>{text('Cyclists', '경로 위 자전거 이용자')}</span></label>
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

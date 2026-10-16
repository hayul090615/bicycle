import { siteText } from '../services/tourTranslations'
import type { SiteLocale } from '../services/siteLocale'
/**
 * 지도 기능이 만나는 중심 화면이다. 도착지와 내 위치로 길을 찾고, 주변 500m 장소와 로드뷰, 이용시간을 관리한다.
 */
﻿import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CircleMarker, MapContainer, Marker, Polygon, Polyline, Popup, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import { divIcon, latLngBounds, type LatLngExpression } from 'leaflet'
import { getTouristStation, type TourCategory, type TourSeason, type TouristRoute } from '../data/touristRoutes'
import { GoogleRoute3D } from './GoogleRoute3D'
import { hasGoogleMapsKey } from '../services/googleMaps3d'
import { KakaoRouteMap } from './KakaoRouteMap'
import { KakaoRoadviewPanel } from './KakaoRoadviewPanel'
import { DestinationArrival } from './DestinationArrival'
import { useDestinationArrival } from '../hooks/useDestinationArrival'
import { useNearbyPlaces } from '../hooks/useNearbyPlaces'
import { useNearbySignals } from '../hooks/useNearbySignals'
import { MapDiscoveryBar, type DiscoveryCategory } from './MapDiscoveryBar'
import { PlaceReviewPopup } from './PlaceReviewPopup'
import { MAP_NEARBY_RADIUS_METERS, type NearbyPlaceCategory } from '../services/nearbyPlaces'
import { hasKakaoMapsKey } from '../services/kakaoMaps'
import { downloadEarthRoute, googleEarthUrl } from '../utils/googleEarth'
import { findSceneryPhoto, type SceneryPhoto } from '../services/sceneryPhotos'
import { getSolarPosition, todayInSeoul } from '../utils/solarPosition'
import { routeArrivalConnector, routeArrivalMarker } from '../utils/routeArrival'
import { localizeBikeStationName } from '../utils/localizeBikeStationName'
import { fetchBikePath, fetchBikePaths, fetchWalkingPath, type BikeRouteInstruction, type BikeRouteResult, type LonLat } from '../services/bikeRoute'
import { fetchNearbyBikeStations, nearestSnapshotStations, type NearbyBikeStation } from '../services/nearbyBikes'
import { usePublicCctvData } from '../hooks/usePublicCctvData'
import { clusterPublicCameras, nearbyPublicCameras } from '../services/publicCctv'
import { fetchRouteAmenities, fetchRouteElevationProfile, fetchRouteGrades, fetchRouteSignals, type RouteAmenity, type RouteCondition, type RouteElevationPoint, type RouteRestaurant } from '../services/routeConditions'
import { fetchSeoulToiletsAlongRoute } from '../services/seoulToilets'
import { isInsideSeoul, SEOUL_BIKE_MAP_BOUNDS_LATLNG, SEOUL_BOUNDARY, SEOUL_BOUNDARY_COLOR, SEOUL_BOUNDARY_WIDTH, SEOUL_AREA_COLOR, SEOUL_AREA_OPACITY, SEOUL_OUTSIDE_MASK, SEOUL_OUTSIDE_DIM_COLOR, SEOUL_OUTSIDE_DIM_OPACITY } from '../data/seoulBoundary'
import { coloredRouteSegments } from '../services/routeGradient'

const MapLibreRoute3D = lazy(() => import('./MapLibreRoute3D').then(module => ({ default: module.MapLibreRoute3D })))
const SEOUL_REFERENCE = { lat: 37.5665, lng: 126.978 }
const CCTV_NEARBY_RADIUS_METERS = 20
const SEOUL_BOUNDARY_LATLNG = SEOUL_BOUNDARY.map(([lng, lat]) => [lat, lng] as LatLngExpression)
const SEOUL_MASK_LATLNG = SEOUL_OUTSIDE_MASK.geometry.coordinates.map(ring => ring.map(([lng, lat]) => [lat, lng] as LatLngExpression))
const EMPTY_STOP_INDEXES: number[] = []
const EMPTY_ROUTE_AMENITIES: RouteAmenity[] = []
const EMPTY_ROUTE_ELEVATION: RouteElevationPoint[] = []
const EMPTY_ROUTE_RESTAURANTS: RouteRestaurant[] = []
type Coordinates = { lat: number; lng: number; heading?: number; accuracy?: number; timestamp?: number }
type BikeUseMode = 'ttareungi' | 'personal'
type RotationRequest = { direction: 'left' | 'right' | 'up' | 'down'; serial: number }
type MapLayerKey = 'course' | 'restaurants' | 'cctv' | 'roadInfo' | 'riders' | 'amenities'
type MapTool = 'routes' | 'ridePlan' | 'course' | 'food' | 'cctv' | 'settings' | 'location' | '3d' | 'map' | 'facilities'
type MapLayers = Record<MapLayerKey, boolean>
const DEFAULT_MAP_LAYERS: MapLayers = { course: false, restaurants: false, cctv: false, roadInfo: true, riders: false, amenities: true }
/** 사용자가 저장한 지도 레이어 표시 설정을 읽는다. */
function readMapLayers(): MapLayers {
  try {
    const saved = localStorage.getItem('seoul-bike-map-layers-v3')
    if (!saved) {
      const previous = localStorage.getItem('seoul-bike-map-layers-v2') ?? localStorage.getItem('seoul-bike-map-layers-v1')
      if (!previous) return DEFAULT_MAP_LAYERS
      const migrated = JSON.parse(previous) as Partial<MapLayers>
      return { ...DEFAULT_MAP_LAYERS, ...migrated, cctv: false, course: false, riders: false }
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

/** 두 지리 좌표의 거리를 미터 단위로 구한다. */
function distanceMeters(from: Coordinates, to: Coordinates) {
  const radians = Math.PI / 180
  const latitude = (to.lat - from.lat) * radians
  const longitude = (to.lng - from.lng) * radians
  const arc = Math.sin(latitude / 2) ** 2 + Math.cos(from.lat * radians) * Math.cos(to.lat * radians) * Math.sin(longitude / 2) ** 2
  return 6371000 * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc))
}

/** 현재 좌표에서 목표 좌표를 향하는 방위를 도 단위로 구한다. */
function bearingDegrees(from: Coordinates, to: Coordinates) {
  const radians = Math.PI / 180
  const latitude1 = from.lat * radians
  const latitude2 = to.lat * radians
  const longitude = (to.lng - from.lng) * radians
  const y = Math.sin(longitude) * Math.cos(latitude2)
  const x = Math.cos(latitude1) * Math.sin(latitude2) - Math.sin(latitude1) * Math.cos(latitude2) * Math.cos(longitude)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

/** 현재 위치와 코스 정류 지점 사이에서 가장 짧은 거리를 구한다. */
function nearestStopDistance(route: TouristRoute, location: Coordinates) {
  return Math.min(...route.stops.map(stop => {
    const station = getTouristStation(stop.stationId)
    return distanceMeters(location, station)
  }))
}

/** 미터 거리를 화면의 m 또는 km 표시 문자열로 변환한다. */
function distanceLabel(meters: number) {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`
}
/** 저장한 따릉이·개인 자전거 이용 방식을 읽는다. */
function readBikeUseMode(): BikeUseMode {
  try { return localStorage.getItem('seoul-bike-use-mode') === 'personal' ? 'personal' : 'ttareungi' }
  catch { return 'ttareungi' }
}
/** 저장한 반납 시각을 읽고 유효한 값만 사용한다. */
function readRentalDeadline(): number | null {
  try {
    const value = Number(localStorage.getItem('seoul-bike-rental-deadline'))
    return Number.isFinite(value) && value > 0 ? value : null
  } catch { return null }
}

/** 선택 언어와 시설 종류에 맞는 지도 표시 이름을 만든다. */
function amenityTitle(amenity: RouteAmenity, locale: SiteLocale) {
  const labels: Record<RouteAmenity['kind'], string> = siteText(locale, { pump: 'Bike pump', water: 'Drinking water', toilet: 'Public toilet', convenience: 'Convenience store' , parking: 'Bicycle parking', repair: 'Bicycle repair', visit: 'Attraction'}, { pump: '공기주입기', water: '음수대', toilet: '공중화장실', convenience: '편의점' , parking: '자전거 주차', repair: '자전거 수리', visit: '관광 명소'})
  return `${labels[amenity.kind]}${amenity.name ? ` · ${amenity.name}` : ''}`
}

const AMENITY_DISPLAY = {
  pump: { icon: '🔧', shortKo: '공기주입기', shortEn: 'Air pump' },
  water: { icon: '💧', shortKo: '음수대', shortEn: 'Water' },
  toilet: { icon: '🚻', shortKo: '화장실', shortEn: 'Toilet' },
  convenience: { icon: '🏪', shortKo: '편의점', shortEn: 'Shop' },

  parking: { icon: '🚲', shortKo: '주차', shortEn: 'Park' },
  repair: { icon: '🛠️', shortKo: '수리', shortEn: 'Repair' },
  visit: { icon: '📍', shortKo: '명소', shortEn: 'Visit' },
} as const

/** 경도·위도 배열의 두 지점 사이 거리를 미터로 계산한다. */
function distanceMetersBetween(a: LonLat, b: LonLat) {
  return distanceMeters({ lng: a[0], lat: a[1] }, { lng: b[0], lat: b[1] })
}

/** 경로 시작부터 지정한 미터 거리만큼 진행한 좌표를 두 점 사이의 위치를 계산한다. */
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

/** 경로 서비스의 회전 동작을 선택 언어의 안내 문구로 변환한다. */
function instructionLabel(instruction: BikeRouteInstruction, locale: SiteLocale) {
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
  if (locale !== 'en') {
    const action = maneuver === 'arrive' ? 'Arrive at your destination'
      : maneuver === 'depart' ? 'Start riding'
      : maneuver === 'roundabout' || maneuver === 'rotary' ? 'Enter the roundabout'
      : maneuver === 'merge' ? 'Merge onto the road'
      : maneuver === 'uturn' ? 'Turn make a U-turn'
      : maneuver === 'turn' || maneuver === 'end of road' ? `Turn ${en[modifier ?? ''] ?? 'ahead'}` : 'Continue straight'
    const label = siteText(locale, action, action)
    return roadName && maneuver !== 'arrive' ? `${label} · ${roadName}` : label
  }
  if (maneuver === 'arrive') return 'Arrive at your destination'
  if (maneuver === 'depart') return roadName ? `Start on ${roadName}` : 'Start riding'
  if (maneuver === 'roundabout' || maneuver === 'rotary') return roadName ? `Enter the roundabout toward ${roadName}` : 'Enter the roundabout'
  if (maneuver === 'merge') return roadName ? `Merge onto ${roadName}` : 'Merge onto the road'
  const action = maneuver === 'turn' || maneuver === 'end of road' ? `Turn ${en[modifier ?? ''] ?? 'ahead'}` : 'Continue straight'
  return roadName ? `${action} onto ${roadName}` : action
}

/** 다음 회전 동작에 맞는 화면용 화살표를 고른다. */
function instructionArrow(instruction?: BikeRouteInstruction) {
  const direction = instruction?.modifier ?? ''
  if (direction.includes('left')) return direction.includes('sharp') ? '←' : '↰'
  if (direction.includes('right')) return direction.includes('sharp') ? '→' : '↱'
  if (instruction?.maneuver === 'arrive') return '◆'
  if (instruction?.maneuver === 'uturn') return '↶'
  return '↑'
}

// A relaxed public-bike pace; sightseeing breaks and traffic signals are excluded.
/** 거리에서 자전거 이동 시간을 분 단위로 추정한다. */
function bikeMinutes(meters: number) {
  return Math.max(1, Math.ceil(meters / 200)) // 12 km/h = 200 m/min
}

/** 선택 경로의 각 구간 길이를 합쳐 전체 미터 거리를 구한다. */
function pathDistance(points: LonLat[]) {
  return points.slice(1).reduce((total, [lng, lat], index) => total + distanceMeters(
    { lng: points[index][0], lat: points[index][1] }, { lng, lat }), 0)
}

/** 현재 위치를 경로에 투영해 지나온 미터 거리를 구한다. */
function nearestRouteProgress(location: Coordinates, path: LonLat[]) {
  const latitudeScale = 111_320
  let cumulative = 0
  let closestGap = Infinity
  let closestProgress = 0
  for (let index = 1; index < path.length; index++) {
    const [fromLng, fromLat] = path[index - 1]
    const [toLng, toLat] = path[index]
    const referenceLat = (location.lat + fromLat + toLat) / 3 * Math.PI / 180
    const xScale = latitudeScale * Math.cos(referenceLat)
    const ax = (fromLng - location.lng) * xScale, ay = (fromLat - location.lat) * latitudeScale
    const bx = (toLng - fromLng) * xScale, by = (toLat - fromLat) * latitudeScale
    const segmentLength = Math.hypot(bx, by)
    const fraction = Math.max(0, Math.min(1, -(ax * bx + ay * by) / Math.max(1, segmentLength * segmentLength)))
    const gap = Math.hypot(ax + bx * fraction, ay + by * fraction)
    if (gap < closestGap) { closestGap = gap; closestProgress = cumulative + segmentLength * fraction }
    cumulative += segmentLength
  }
  return closestGap > 250 ? 0 : closestProgress
}

/** 코스 지점 사이 거리를 바탕으로 전체 주행 시간을 추정한다. */
function estimatedRouteMinutes(route: TouristRoute) {
  const stops = route.stops.map(stop => getTouristStation(stop.stationId))
  const straightDistance = stops.slice(1).reduce((total, stop, index) => total + distanceMetersBetween(
    [stops[index].lng, stops[index].lat], [stop.lng, stop.lat]), 0)
  return bikeMinutes(straightDistance * 1.3)
}

/** 서울의 현재 날짜를 기준으로 기본 계절을 고른다. */
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

/** 목적지·현재 위치·선택 구간이 보이도록 Leaflet 중심과 축척을 맞춘다. */
function FocusMap({ points, linePoints, approachPoints, walkingPoints, selectedStop, hasDestination, userLocation, locationFocusRequest }: { points: LatLngExpression[]; linePoints: LatLngExpression[]; approachPoints: LatLngExpression[]; walkingPoints: LatLngExpression[]; selectedStop: number | null; hasDestination: boolean; userLocation: Coordinates | null; locationFocusRequest: number }) {
  const map = useMap()
  // useRef는 지도 객체나 이전 값을 기억하는 상자다. current를 바꿔도 화면을 다시 그리지는 않는다.
  const lastFocusRequest = useRef(0)
  const initialSeoulViewAt = useRef<number | null>(null)
  const focusTimer = useRef<number | null>(null)
  const userLocationRef = useRef(userLocation)
  userLocationRef.current = userLocation
  // 화면이 열리거나 대괄호 안의 값이 바뀌면 실행한다. return 안의 함수는 이전 작업을 정리할 때 실행된다.
  useEffect(() => () => {
    if (focusTimer.current !== null) window.clearTimeout(focusTimer.current)
  }, [])
  useEffect(() => {
    const currentLocation = userLocationRef.current
    if (!hasDestination && selectedStop === null && initialSeoulViewAt.current === null) {
      map.fitBounds(latLngBounds(SEOUL_BIKE_MAP_BOUNDS_LATLNG), { padding: [28, 28], maxZoom: 10, animate: false })
      initialSeoulViewAt.current = Date.now()
    }
    if (locationFocusRequest > lastFocusRequest.current && currentLocation) {
      if (focusTimer.current !== null) window.clearTimeout(focusTimer.current)
      const focus = () => {
        lastFocusRequest.current = locationFocusRequest
        const latestLocation = userLocationRef.current ?? currentLocation
        map.setView([latestLocation.lat, latestLocation.lng], 16, { animate: true, duration: 0.8 })
        focusTimer.current = null
      }
      const overviewAt = initialSeoulViewAt.current
      const delay = overviewAt === null ? 0 : Math.max(0, 1_000 - (Date.now() - overviewAt))
      if (delay) focusTimer.current = window.setTimeout(focus, delay)
      else focus()
      return
    }
    if (!hasDestination && locationFocusRequest > 0 && selectedStop === null && currentLocation) return
    if (hasDestination) {
      const routeBounds = [...linePoints, ...approachPoints, ...walkingPoints]
      if (routeBounds.length > 1) map.fitBounds(latLngBounds(routeBounds), { padding: [64, 64], maxZoom: 15, animate: false })
      lastFocusRequest.current = Math.max(lastFocusRequest.current, locationFocusRequest)
      return
    }
    if (!hasDestination && selectedStop === null && initialSeoulViewAt.current !== null) {
      return
    }
    if (approachPoints.length) map.fitBounds(latLngBounds(selectedStop === null ? [...linePoints, ...approachPoints, ...walkingPoints] : [...approachPoints, ...walkingPoints]), { padding: [42, 42], maxZoom: 15, animate: false })
    else if (selectedStop === null) map.fitBounds(latLngBounds(linePoints), { padding: [45, 45], maxZoom: 14, animate: false })
    else map.setView(points[selectedStop], 15, { animate: false })
  }, [map, points, linePoints, approachPoints, walkingPoints, selectedStop, hasDestination, locationFocusRequest])
  return null
}

/** 지도 이동 뒤 중심 좌표를 주변 대여소 조회 화면에 전달한다. */
function MapCenterReporter({ onChange }: { onChange: (center: Coordinates) => void }) {
  const map = useMap()
  useEffect(() => {
    const report = () => {
      const center = map.getCenter()
      onChange({ lat: center.lat, lng: center.lng })
    }
    report()
    map.on('moveend zoomend', report)
    return () => { map.off('moveend zoomend', report) }
  }, [map, onChange])
  return null
}

/** 선택한 주변 대여소 목록을 자전거 수량이 표시된 마커로 만든다. */
function BikeStationMarkers({ stations, locale }: { stations: NearbyBikeStation[]; locale: string }) {
  const map = useMap()
  // useState는 화면에 필요한 값을 기억한다. set으로 시작하는 함수를 부르면 새 값으로 화면도 바뀐다.
  const [viewRevision, setViewRevision] = useState(0)
  useEffect(() => {
    const refresh = () => setViewRevision(value => value + 1)
    map.on('moveend zoomend', refresh)
    return () => { map.off('moveend zoomend', refresh) }
  }, [map])
  // 같은 입력이면 전에 계산한 값을 다시 쓴다. 대괄호 안의 값이 바뀔 때만 새로 계산한다.
  const clusters = useMemo(() => {
    const points = stations.map(station => ({ station, point: map.latLngToContainerPoint([station.lat, station.lng]) }))
    const groups: Array<{ stations: NearbyBikeStation[]; x: number; y: number; lat: number; lng: number }> = []
    for (const item of points) {
      let nearest: typeof groups[number] | undefined
      let nearestDistance = 56
      for (const group of groups) {
        const distance = Math.hypot(item.point.x - group.x, item.point.y - group.y)
        if (distance < nearestDistance) { nearest = group; nearestDistance = distance }
      }
      if (nearest) {
        const length = nearest.stations.length
        nearest.stations.push(item.station)
        nearest.x = (nearest.x * length + item.point.x) / (length + 1)
        nearest.y = (nearest.y * length + item.point.y) / (length + 1)
        nearest.lat = (nearest.lat * length + item.station.lat) / (length + 1)
        nearest.lng = (nearest.lng * length + item.station.lng) / (length + 1)
      } else groups.push({ stations: [item.station], x: item.point.x, y: item.point.y, lat: item.station.lat, lng: item.station.lng })
    }
    return groups
  }, [stations, map, viewRevision])

  // 아래 JSX는 화면에 보일 내용이다. 중괄호 안에는 위에서 계산한 값이나 버튼 동작을 넣는다.
  return <>{clusters.map(cluster => {
    if (cluster.stations.length === 1) {
      const station = cluster.stations[0]
      return <Marker key={`live-bike-${station.id}`} position={[station.lat, station.lng]}
        icon={divIcon({ className: 'tour-live-bike-icon', html: `<span>${station.available ?? '–'}</span>`, iconSize: [42, 42], iconAnchor: [21, 37] })}>
        <Tooltip className="tour-live-bike-tooltip"><span><strong>{localizeBikeStationName(station.name, locale)}</strong><i aria-hidden="true">—</i><b>{station.available === null ? (siteText(locale, 'Live count unavailable', '실시간 잔여 대수 확인 불가')) : (siteText(locale, `${station.available} bikes available`, `${station.available}대 대여 가능`))}</b></span></Tooltip>
      </Marker>
    }
    const knownStations = cluster.stations.filter(station => station.available !== null)
    const bikeTotal = knownStations.reduce((total, station) => total + (station.available ?? 0), 0)
    const countLabel = knownStations.length === 0 ? '—' : `${bikeTotal}${knownStations.length < cluster.stations.length ? '+' : ''}`
    const stationNames = cluster.stations.map(station => localizeBikeStationName(station.name, locale)).join(', ')
    const summary = siteText(locale, `${countLabel} bikes · ${cluster.stations.length} stations`, `${countLabel}대 · 대여소 ${cluster.stations.length}곳`)
    return <Marker key={`live-bike-cluster-${cluster.stations.map(station => station.id).join('-')}`} position={[cluster.lat, cluster.lng]}
      icon={divIcon({ className: 'tour-live-bike-cluster-icon', html: `<span>${countLabel}</span><small>${cluster.stations.length}${siteText(locale, ' st.', '곳')}</small>`, iconSize: [52, 52], iconAnchor: [26, 26] })}
      eventHandlers={{ click: () => map.flyTo([cluster.lat, cluster.lng], Math.min(map.getZoom() + 2, map.getMaxZoom())) }}>
      <Tooltip className="tour-live-bike-cluster-tooltip"><strong>{summary}</strong><span>{stationNames}</span></Tooltip>
    </Marker>
  })}</>
}

/** 도착지 선택 모드에서 지도 클릭 좌표를 이 화면을 사용하는 부모 화면에 전달한다. */
function DestinationPickerMapEvents({ enabled, onPick }: { enabled: boolean; onPick: (point: Coordinates) => void }) {
  useMapEvents({ click: event => { if (enabled) onPick({ lat: event.latlng.lat, lng: event.latlng.lng }) } })
  return null
}

const TIMER_DIGIT_SEGMENTS: Record<string, string> = {
  '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd',
  '4': 'fgbc', '5': 'afgcd', '6': 'afgecd', '7': 'abc', '8': 'abcdefg', '9': 'abfgcd',
}

/** 숫자 문자열을 디지털 시계의 일곱 세그먼트 모양으로 표시한다. */
function SegmentedDigits({ value }: { value: string }) {
  return <span className="tour-rental-digits" aria-hidden="true">{value.split('').map((digit, digitIndex) => <span className="tour-rental-digit" key={`${digit}-${digitIndex}`}>
    {'abcdefg'.split('').map(segment => <i key={segment} className={`tour-rental-segment tour-rental-segment--${segment}${TIMER_DIGIT_SEGMENTS[digit]?.includes(segment) ? ' is-lit' : ''}`} />)}
  </span>)}</span>
}

/** 반납까지 남은 초를 시·분·초 디지털 표시로 변환한다. */
function RentalDigitalDisplay({ seconds }: { seconds: number }) {
  const safeSeconds = Math.max(0, seconds)
  const hours = String(Math.floor(safeSeconds / 3600)).padStart(2, '0')
  const minutes = String(Math.floor(safeSeconds % 3600 / 60)).padStart(2, '0')
  const remainingSeconds = String(safeSeconds % 60).padStart(2, '0')
  return <div className="tour-rental-digital-display" aria-hidden="true">
    <span className="tour-rental-digital-group"><SegmentedDigits value={hours} /><small>H</small></span>
    <span className="tour-rental-digital-colon">:</span>
    <span className="tour-rental-digital-group"><SegmentedDigits value={minutes} /><small>M</small></span>
    <span className="tour-rental-digital-colon">:</span>
    <span className="tour-rental-digital-group"><SegmentedDigits value={remainingSeconds} /><small>S</small></span>
  </div>
}

export function TourRouteExplorer({ route, routes, category, onRouteSelect, locale, shadowDate, shadowMinutes, originStopIndex, destinationStopIndex, viaStopIndex, onOriginStopChange, onDestinationStopChange, onViaStopChange, rentalWidgetTarget, rentalTimerOpen, onRoadviewOpen, onDestinationSelected, searchedDestination, onInitialMapSequenceComplete }: {
  route: TouristRoute
  routes: TouristRoute[]
  category: TourCategory
  onRouteSelect: (routeId: string) => void
  locale: SiteLocale
  shadowDate: string
  shadowMinutes: number
  originStopIndex: number | null
  destinationStopIndex: number | null
  viaStopIndex: number | null
  onOriginStopChange: (index: number | null) => void
  onDestinationStopChange: (index: number | null) => void
  onViaStopChange: (index: number | null) => void
  rentalWidgetTarget: HTMLDivElement | null
  rentalTimerOpen: boolean
  onDestinationSelected: () => void
  onRoadviewOpen: () => void
  searchedDestination: { lat: number; lng: number; serial: number } | null
  onInitialMapSequenceComplete?: () => void
}) {
  const [selection, setSelection] = useState<{ routeId: string; index: number } | null>(null)
  const [customDestination, setCustomDestination] = useState<Coordinates | null>(null)
  const [destinationPicking, setDestinationPicking] = useState(false)
  const [destinationError, setDestinationError] = useState(false)
  const [hover, setHover] = useState<{ routeId: string; index: number } | null>(null)
  const [sceneryPhoto, setSceneryPhoto] = useState<SceneryPhoto | null>(null)
  const [photoLoading, setPhotoLoading] = useState(false)
  const [view, setView] = useState<'city' | 'satellite' | 'map' | 'google' | 'kakao'>(() => hasKakaoMapsKey && locale === 'ko' ? 'kakao' : locale !== 'ko' ? 'map' : 'city')
  const previousMapLocale = useRef(locale)
  const [kakaoMapType, setKakaoMapType] = useState<'roadmap' | 'skyview'>('roadmap')
  const [roadviewEnabled, setRoadviewEnabled] = useState(false)
  const [roadviewTarget, setRoadviewTarget] = useState<Coordinates | null>(null)
  const [roadviewPosition, setRoadviewPosition] = useState<Coordinates | null>(null)
  const [activeMapTool, setActiveMapTool] = useState<MapTool | null>(null)
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null)
  const [mapCenter, setMapCenter] = useState<Coordinates>(SEOUL_REFERENCE)
  const [trackingLocation, setTrackingLocation] = useState(false)
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState<'denied' | 'unavailable' | 'timeout' | null>(null)
  const [nearestResult, setNearestResult] = useState<{ routeId: string; distance: number } | null>(null)
  const [routeOptions, setRouteOptions] = useState<{ key: string; routes: Array<{ route: BikeRouteResult; signalCount: number | null }> } | null>(null)
  const [routeGuidanceStatus, setRouteGuidanceStatus] = useState<'idle' | 'loading' | 'ready' | 'unavailable'>('idle')
  const [amenitiesState, setAmenitiesState] = useState<{ routeId: string; places: RouteAmenity[]; status: 'loading' | 'ready' | 'unavailable' } | null>(null)
  const [elevationState, setElevationState] = useState<{ key: string; points: RouteElevationPoint[]; status: 'loading' | 'ready' | 'unavailable' } | null>(null)
  const [courseBikeStationsState, setCourseBikeStationsState] = useState<{ routeId: string; stations: NearbyBikeStation[]; updatedAt: string | null; status: 'loading' | 'live' | 'unavailable' } | null>(null)
  const [roadConditions, setRoadConditions] = useState<{
    key: string; signals: RouteCondition[]; grades: RouteCondition[]
    signalsStatus: 'idle' | 'loading' | 'ready' | 'unavailable'
    gradesStatus: 'idle' | 'loading' | 'ready' | 'unavailable'
  }>({ key: '', signals: [], grades: [], signalsStatus: 'idle', gradesStatus: 'idle' })
  const [approachRoute, setApproachRoute] = useState<{ key: string; points: LonLat[]; estimated: boolean; loading: boolean; distanceMeters?: number } | null>(null)
  const [walkingRoute, setWalkingRoute] = useState<{ key: string; points: LonLat[]; estimated: boolean; loading: boolean; distanceMeters?: number } | null>(null)
  const [nearbyBikes, setNearbyBikes] = useState<{ key: string; stations: NearbyBikeStation[]; updatedAt: string | null; status: 'loading' | 'live' | 'unavailable' } | null>(null)
  const [viewportBikes, setViewportBikes] = useState<{ key: string; stations: NearbyBikeStation[]; updatedAt: string | null; status: 'loading' | 'live' | 'unavailable' } | null>(null)
  const [selectedBikeStationId, setSelectedBikeStationId] = useState<string | null>(() => {
    try { return localStorage.getItem('seoul-bike-selected-pickup-station') } catch { return null }
  })
  const [bikeUseMode, setBikeUseMode] = useState<BikeUseMode>(readBikeUseMode)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [mapMenuOpen, setMapMenuOpen] = useState(false)
  const [menuPlanTarget, setMenuPlanTarget] = useState<HTMLDivElement | null>(null)
  const [mobileSheetExpanded, setMobileSheetExpanded] = useState(false)
  const mobileSheetRef = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const sheet = mobileSheetRef.current
    const stage = sheet?.closest<HTMLElement>('.tour-map-stage')
    if (!sheet || !stage) return
    const timer = rentalWidgetTarget?.querySelector<HTMLElement>('.tour-rental-header-widget')
    const rentalStack = rentalWidgetTarget?.querySelector<HTMLElement>('.tour-rental-guidance-stack')
    const header = rentalWidgetTarget?.closest<HTMLElement>('.tour-topbar')
    const tools = preview.current?.querySelector<HTMLElement>('.tour-map-destination-tools')
    const mapDock = stage.querySelector<HTMLElement>('.tour-map-view-dock')
    const discovery = preview.current?.querySelector<HTMLElement>('.tour-discovery-bar')
    const measure = () => {
      stage.style.setProperty('--tour-discovery-height', `${discovery?.getBoundingClientRect().height ?? 0}px`)
      stage.style.setProperty('--tour-mobile-sheet-height', `${sheet.getBoundingClientRect().height}px`)
      const stageBounds = stage.getBoundingClientRect()
      if (rentalStack && header) {
        const headerBounds = header.getBoundingClientRect(), stackBounds = rentalStack.getBoundingClientRect()
        let stackTop = Math.max(headerBounds.bottom, stageBounds.top) + 12
        const obstacles = [...(discovery ? [discovery] : []), ...(tools?.children ?? []), ...(mapDock ? [mapDock] : [])]
        obstacles.forEach(element => {
          const bounds = element.getBoundingClientRect()
          if (bounds.height && bounds.left < stackBounds.right && bounds.right > stackBounds.left) stackTop = Math.max(stackTop, bounds.bottom + 12)
        })
        const mobileNavigation = window.matchMedia('(max-width: 700px)').matches && sheet.classList.contains('is-navigating') && !sheet.hidden
        const navigationSpace = mobileNavigation ? Math.min(160, window.innerHeight * .35) + 64 : 0
        rentalStack.style.setProperty('--tour-rental-stack-top', `${stackTop - headerBounds.top}px`)
        rentalStack.style.setProperty('--tour-rental-stack-max-height', `${Math.max(64, Math.min(stageBounds.bottom, window.innerHeight) - stackTop - 12 - navigationSpace)}px`)
      }
      const timerBounds = timer?.getBoundingClientRect()
      const visibleTimerBottom = timerBounds ? Math.min(timerBounds.bottom, rentalStack?.getBoundingClientRect().bottom ?? timerBounds.bottom) : 0
      let clearance = timerBounds?.height ? visibleTimerBottom - stageBounds.top + 64 : 130
      tools?.querySelectorAll('button').forEach(button => {
        const bounds = button.getBoundingClientRect()
        if (bounds.height && bounds.right > stageBounds.right - 164) clearance = Math.max(clearance, bounds.bottom - stageBounds.top + 64)
      })
      const mapBounds = mapDock?.getBoundingClientRect()
      if (mapBounds?.height) clearance = Math.max(clearance, mapBounds.bottom - stageBounds.top + 12)
      stage.style.setProperty('--tour-mobile-sheet-controls-top', `${Math.max(130, clearance)}px`)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(sheet)
    observer.observe(stage)
    if (timer) observer.observe(timer)
    if (rentalStack) observer.observe(rentalStack)
    if (header) observer.observe(header)
    if (tools) observer.observe(tools)
    if (mapDock) observer.observe(mapDock)
    if (discovery) observer.observe(discovery)
    measure()
    return () => observer.disconnect()
  }, [rentalTimerOpen, rentalWidgetTarget, customDestination, bikeUseMode])
  const [directionsPanelVisible, setDirectionsPanelVisible] = useState(true)
  const toggleDirectionsPanel = useCallback(() => {
    setDirectionsPanelVisible(visible => !visible)
    setMobileSheetExpanded(false)
  }, [])
  const [placePopupAnchor, setPlacePopupAnchor] = useState<Element | null>(null)
  const [placePopupPoint, setPlacePopupPoint] = useState<LonLat | null>(null)
  const [flatOnly, setFlatOnly] = useState(false)
  const [durationFilter, setDurationFilter] = useState<30 | 60 | null>(null)
  const [mapLayers, setMapLayers] = useState<MapLayers>(readMapLayers)
  const [showShadows, setShowShadows] = useState(true)
  const [locationFocusRequest, setLocationFocusRequest] = useState(0)

  const [locationMovementTick, setLocationMovementTick] = useState(0)
  const [rideFoodPrompt, setRideFoodPrompt] = useState<{ routeId: string; stopIndex: number } | null>(null)
  const [discoveryCategory, setDiscoveryCategory] = useState<DiscoveryCategory | null>(null)
  const [focusedPlacePoint, setFocusedPlacePoint] = useState<LonLat | null>(null)
  const [rentalLimitMinutes, setRentalLimitMinutes] = useState(() => {
    try { return localStorage.getItem('seoul-bike-rental-minutes') === '120' ? 120 : 60 }
    catch { return 60 }
  })
  const [rentalDeadline, setRentalDeadline] = useState<number | null>(readRentalDeadline)
  const [rentalReminderStatus, setRentalReminderStatus] = useState<'idle' | 'five_minutes' | 'expired' | 'permission_denied'>('idle')
  const [rentalNow, setRentalNow] = useState(Date.now())
  const [transferRecommendation, setTransferRecommendation] = useState<{ routeId: string; station: NearbyBikeStation | null; status: 'loading' | 'ready' | 'unavailable' } | null>(null)
  const [mapWeather, setMapWeather] = useState<'sunny' | 'cloudy' | 'rainy'>('sunny')
  const [skyMode, setSkyMode] = useState<'auto' | 'day' | 'night'>('auto')
  const [rotationRequest, setRotationRequest] = useState<RotationRequest | null>(null)
  const previousLocationRef = useRef<Coordinates | null>(null)
  const previousLocationTimeRef = useRef(0)
  const distanceSinceMovementTickRef = useRef(0)
  const promptedStopsRef = useRef(new Set<string>())
  const rentalNoticeRef = useRef({ fiveMinutes: false, expired: false })
  const initialLocationRequestedRef = useRef(false)
  const initialMapSequenceTimerRef = useRef<number | null>(null)
  const initialMapSequenceCompletedRef = useRef(false)
  const lastSyncedDestinationIndexRef = useRef<number | null>(null)
  const handledSearchSerialRef = useRef<number | null>(null)
  const [displaySeason, setDisplaySeason] = useState<TourSeason>(() => route.season ?? seasonForToday())
  const [routeSearch, setRouteSearch] = useState('')
  const preview = useRef<HTMLElement>(null)
  const text = (en: string, ko: string) => siteText(locale, en, ko)
  const finishInitialMapSequence = (delayMs: number) => {
    if (!onInitialMapSequenceComplete || initialMapSequenceCompletedRef.current || initialMapSequenceTimerRef.current !== null) return
    initialMapSequenceTimerRef.current = window.setTimeout(() => {
      initialMapSequenceTimerRef.current = null
      if (initialMapSequenceCompletedRef.current) return
      initialMapSequenceCompletedRef.current = true
      onInitialMapSequenceComplete()
    }, delayMs)
  }
  useEffect(() => () => {
    if (initialMapSequenceTimerRef.current !== null) window.clearTimeout(initialMapSequenceTimerRef.current)
  }, [])
  // 다른 화면에 전달할 함수를 기억한다. 대괄호 안의 값이 바뀌면 함수를 새로 만든다.
  const closeRoadview = useCallback(() => {
    setRoadviewEnabled(false)
    setRoadviewTarget(null)
    setRoadviewPosition(null)
  }, [])
  useLayoutEffect(() => {
    if (rentalTimerOpen) closeRoadview()
  }, [closeRoadview, rentalTimerOpen])
  // 로드뷰의 촬영 위치는 실제 GPS와 별개로 유지해 사진 탐색이 내 위치를 바꾸지 않게 한다.
  const selectRoadview = useCallback((point: Coordinates) => {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return
    setRoadviewTarget(point)
    setRoadviewPosition(point)
  }, [])
  const reportRoadviewPosition = useCallback((point: Coordinates) => {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return
    setRoadviewPosition(current => current?.lat === point.lat && current.lng === point.lng ? current : point)
  }, [])
  useEffect(() => {
    const switchedToInternational = previousMapLocale.current !== locale && locale !== 'ko'
    previousMapLocale.current = locale
    if (locale !== 'ko' && (view === 'google' || (!roadviewEnabled && (switchedToInternational || view === 'kakao')))) setView('map')
  }, [locale, roadviewEnabled, view])
  const openFoodGuideAt = useCallback((point: LonLat, anchor?: Element, previewOnly = false) => {
    if (!previewOnly) { setFocusedPlacePoint(point); setActiveMapTool(null) }
    setPlacePopupPoint(point)
    setPlacePopupAnchor(anchor ?? null)
  }, [])
  const closePlacePopup = useCallback(() => { setPlacePopupAnchor(null); setFocusedPlacePoint(null) }, [])
  const publishLocation = (position: GeolocationPosition) => {
    const latitude = position.coords.latitude
    const longitude = position.coords.longitude
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      setLocationError('unavailable')
      return false
    }
    const previous = previousLocationRef.current
    const next = { lat: latitude, lng: longitude }
    const moved = previous ? distanceMeters(previous, next) : 0
    const accuracy = Number.isFinite(position.coords.accuracy) && position.coords.accuracy >= 0
      ? position.coords.accuracy : undefined
    const previousAccuracy = previous?.accuracy
    if (previous && accuracy !== undefined && previousAccuracy !== undefined
      && accuracy > Math.max(50, previousAccuracy * 1.5)
      && moved <= accuracy + previousAccuracy
      && position.timestamp - previousLocationTimeRef.current < 60_000) return true
    const sensorHeading = position.coords.heading
    const heading = sensorHeading !== null && Number.isFinite(sensorHeading)
      ? sensorHeading
      : moved >= 4 && previous ? bearingDegrees(previous, next) : previous?.heading ?? 0
    const location = { ...next, heading, timestamp: position.timestamp, ...(accuracy === undefined ? {} : { accuracy }) }
    previousLocationRef.current = location
    previousLocationTimeRef.current = position.timestamp
    setUserLocation(location)
    if (moved > 0) {
      distanceSinceMovementTickRef.current += moved
      if (distanceSinceMovementTickRef.current >= 35) {
        distanceSinceMovementTickRef.current %= 35
        setLocationMovementTick(tick => tick + 1)
      }
    }
    setLocationError(null)
    return true
  }
  const selectedStop = selection?.routeId === route.id ? selection.index : null
  const hoveredStop = hover?.routeId === route.id ? hover.index : null
  const destinationIndex = selectedStop ?? route.stops.length - 1
  const destinationStop = route.stops[destinationIndex]
  const hasDestination = selectedStop !== null || customDestination !== null
  const destinationStation = customDestination ?? getTouristStation(destinationStop.stationId)
  const destinationLabel = customDestination ? text('Selected map point', '지도에서 선택한 위치')
    : selectedStop !== null ? text(destinationStop.place, destinationStop.placeKo) : text('Choose destination', '도착지 선택')
  const originStation = originStopIndex === null ? null : getTouristStation(route.stops[originStopIndex]?.stationId ?? route.stops[0].stationId)
  const fallbackOriginStation = getTouristStation(route.stops[0].stationId)
  const routeOrigin: LonLat = originStation ? [originStation.lng, originStation.lat]
    : userLocation ? [userLocation.lng, userLocation.lat] : [fallbackOriginStation.lng, fallbackOriginStation.lat]
  const locationLat = userLocation?.lat ?? null
  const locationLng = userLocation?.lng ?? null
  const locationKey = locationLat === null || locationLng === null ? null : `${locationLat.toFixed(6)}:${locationLng.toFixed(6)}`
  const mapCenterKey = `${mapCenter.lat.toFixed(5)}:${mapCenter.lng.toFixed(5)}`
  const reportMapCenter = useCallback((center: Coordinates) => {
    if (!Number.isFinite(center.lat) || !Number.isFinite(center.lng)) return
    const nextKey = `${center.lat.toFixed(5)}:${center.lng.toFixed(5)}`
    setMapCenter(current => `${current.lat.toFixed(5)}:${current.lng.toFixed(5)}` === nextKey ? current : center)
  }, [])
  const destinationKey = customDestination ? `point-${customDestination.lat.toFixed(5)}:${customDestination.lng.toFixed(5)}` : selectedStop === null ? 'course' : destinationIndex
  const timerDestinationRef = useRef<string | null>(null)
  useEffect(() => {
    const key = hasDestination ? `${route.id}:${destinationKey}` : null
    if (key && timerDestinationRef.current !== key) {
      if (bikeUseMode === 'ttareungi') onDestinationSelected()
      // 휴대폰에서는 지도를 먼저 보고, 원형 버튼을 눌러 목록을 열게 한다.
      if (window.matchMedia('(max-width: 700px)').matches) {
        setDirectionsPanelVisible(false)
        setMobileSheetExpanded(false)
      }
    }
    timerDestinationRef.current = key
  }, [hasDestination, destinationKey, route.id, bikeUseMode, onDestinationSelected])
  // 사진에서 경로 끝에 도달한 안내는 현재 목적지마다 한 번만 표시한다.
  const roadviewTripKey = hasDestination ? `${route.id}:${destinationKey}` : null
  const [roadviewCelebrationKey, setRoadviewCelebrationKey] = useState<string | null>(null)
  const roadviewArrivedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!roadviewTripKey) { roadviewArrivedRef.current = null; setRoadviewCelebrationKey(null) }
  }, [roadviewTripKey])
  const celebrateRoadviewArrival = useCallback((explicit = false) => {
    // 자동 도착은 한 번만 안내하고, 사용자가 도착 버튼을 누른 경우 다시 보여 준다.
    if (!roadviewTripKey || (!explicit && roadviewArrivedRef.current === roadviewTripKey)) return
    roadviewArrivedRef.current = roadviewTripKey
    setRoadviewCelebrationKey(roadviewTripKey)
  }, [roadviewTripKey])
  // 실제 이동 도착은 정확도와 관측 시각을 가진 GPS 훅으로 따로 확인한다.
  const arrival = useDestinationArrival({
    destinationKey: hasDestination ? `${route.id}:${destinationKey}` : null,
    destination: destinationStation,
    location: userLocation,
    enabled: trackingLocation,
  })
  const dismissArrival = useCallback(() => { arrival.dismiss(); setRoadviewCelebrationKey(null) }, [arrival.dismiss])
  // 실시간 검색을 기다리는 동안 미리 저장된 가까운 대여소를 먼저 보여 준다.
  const mapNearbySnapshot = useMemo(() => nearestSnapshotStations(mapCenter, 1_000, MAP_NEARBY_RADIUS_METERS), [mapCenter])
  const snapshotNearby = useMemo(() => locationLat === null || locationLng === null ? []
    : nearestSnapshotStations({ lat: locationLat, lng: locationLng }, 1000, MAP_NEARBY_RADIUS_METERS), [locationLat, locationLng])
  const activeNearbyBikes = nearbyBikes?.key === locationKey ? nearbyBikes : null
  const activeViewportBikes = viewportBikes?.key === mapCenterKey ? viewportBikes : null
  const nearbyStations = useMemo(() => {
    const stationsById = new Map(snapshotNearby.map(station => [station.id, station]))
    if (activeNearbyBikes?.status === 'live') {
      for (const liveStation of activeNearbyBikes.stations) {
        const normalizedName = liveStation.name.normalize('NFKC').replace(/\s+/g, '').toLocaleLowerCase()
        const snapshotMatch = [...stationsById.values()].find(station => station.id === liveStation.id
          || station.name.normalize('NFKC').replace(/\s+/g, '').toLocaleLowerCase() === normalizedName)
        if (snapshotMatch) stationsById.delete(snapshotMatch.id)
        stationsById.set(liveStation.id, { ...snapshotMatch, ...liveStation })
      }
    }
    return [...stationsById.values()].sort((first, second) => first.distanceMeters - second.distanceMeters)
      .map(station => ({ ...station, name: localizeBikeStationName(station.name, locale) }))
  }, [activeNearbyBikes, locale, snapshotNearby])
  const pickupStationData = bikeUseMode === 'personal' ? null : nearbyStations.find(station => station.id === selectedBikeStationId && (station.available === null || station.available > 0))
    ?? nearbyStations.find(station => station.available === null || station.available > 0)
    ?? (activeNearbyBikes?.status === 'live' ? null : nearbyStations[0] ?? null)
  const pickupStation = pickupStationData ? { ...pickupStationData, name: localizeBikeStationName(pickupStationData.name, locale) } : null
  const routeWaypoints = useMemo<LonLat[]>(() => {
    if (!hasDestination) return []
    const origin: LonLat = originStopIndex === null && pickupStation ? [pickupStation.lng, pickupStation.lat] : routeOrigin
    const waypoints: LonLat[] = [origin]
    if (viaStopIndex !== null && viaStopIndex !== originStopIndex && viaStopIndex !== destinationIndex && selectedStop !== null) {
      const via = getTouristStation(route.stops[viaStopIndex].stationId)
      waypoints.push([via.lng, via.lat])
    }
    waypoints.push([destinationStation.lng, destinationStation.lat])
    return waypoints
  }, [destinationIndex, destinationStation.lat, destinationStation.lng, hasDestination, originStopIndex, pickupStation?.id, pickupStation?.lat, pickupStation?.lng, route.stops, routeOrigin[0], routeOrigin[1], selectedStop, viaStopIndex])
  const routeGuidanceKey = `${route.id}:${originStopIndex ?? `loc-${locationKey ?? 'na'}:${pickupStation?.id ?? 'no-bike'}`}:${destinationKey}:${selectedStop !== null ? viaStopIndex ?? 'none' : 'none'}`
  const approachKey = hasDestination && originStopIndex === null && pickupStation ? `${route.id}:${destinationKey}:${pickupStation.id}` : null
  const walkingKey = hasDestination && originStopIndex === null && locationKey && pickupStation ? `${locationKey}:${pickupStation.id}` : null
  const activeApproachRoute = approachRoute?.key === approachKey ? approachRoute : null
  const approachPath = activeApproachRoute && !activeApproachRoute.estimated ? activeApproachRoute.points : null
  const activeWalkingRoute = walkingRoute?.key === walkingKey ? walkingRoute : null
  const walkingPath = activeWalkingRoute && !activeWalkingRoute.estimated ? activeWalkingRoute.points : null
  const approachDistance = activeApproachRoute?.distanceMeters ?? (pickupStation
    ? distanceMeters(pickupStation, { lat: destinationStation.lat, lng: destinationStation.lng }) * 1.3 : null)
  const walkingDistance = activeWalkingRoute?.distanceMeters ?? (pickupStation && userLocation
    ? distanceMeters(userLocation, pickupStation) * 1.25 : null)
  const selectStop = useCallback((index: number | null) => {
    closeRoadview()
    setCustomDestination(null)
    setDestinationPicking(false)
    setSelection(index === null ? null : { routeId: route.id, index })
    onDestinationStopChange(index)
    if (index !== null) onOriginStopChange(null)
    setMapLayers(current => ({ ...current, course: index !== null }))
  }, [closeRoadview, onDestinationStopChange, onOriginStopChange, route.id])
  useEffect(() => {
    lastSyncedDestinationIndexRef.current = destinationStopIndex
    if (destinationStopIndex !== null) setCustomDestination(null)
    setSelection(destinationStopIndex === null ? null : { routeId: route.id, index: destinationStopIndex })
    setMapLayers(current => ({ ...current, course: destinationStopIndex !== null }))
    if (destinationStopIndex !== null && destinationStopIndex === viaStopIndex) onViaStopChange(null)
  }, [destinationStopIndex, onViaStopChange, route.id, viaStopIndex])
  const hoverStop = useCallback((index: number | null) => {
    setHover(index === null ? null : { routeId: route.id, index })
  }, [route.id])
  const points = useMemo<LatLngExpression[]>(() => route.stops.map(stop => {
    const station = getTouristStation(stop.stationId)
    return [station.lat, station.lng]
  }), [route])
  const activeRouteOptions = routeOptions?.key === routeGuidanceKey ? routeOptions.routes : []
  const selectedRouteOption = activeRouteOptions[0]
  const routeGeometry = selectedRouteOption ? { key: routeGuidanceKey, points: selectedRouteOption.route.geometry, distanceMeters: selectedRouteOption.route.distanceMeters ?? pathDistance(selectedRouteOption.route.geometry), instructions: selectedRouteOption.route.instructions } : null
  const routedPath = routeGeometry?.points ?? null
  // 대여소까지 걷는 구간과 자전거 경로 뒤에 정확히 선택한 목적지 좌표를 잇는다.
  // 도보와 자전거 길을 연결해 로드뷰에서 따라갈 하나의 길로 만든다.
  const roadviewRoutePath = useMemo(() => {
    if (!hasDestination || !routedPath) return null
    return [...(walkingPath ?? []), ...routedPath, [destinationStation.lng, destinationStation.lat] as LonLat]
  }, [destinationStation.lat, destinationStation.lng, hasDestination, routedPath, walkingPath])
  const activePathKey = routedPath && selectedRouteOption ? `${routeGuidanceKey}:${activeRouteOptions.indexOf(selectedRouteOption)}` : null
  const routeInstructions = routeGeometry?.instructions ?? []
  const roadviewDirections = useMemo(() => [
    ...(walkingPath?.length && pickupStation ? [{ point: walkingPath[0], label: text('Walk to the bike station', '대여소까지 도보'), arrow: '🚶', distanceMeters: pathDistance(walkingPath), maneuver: 'depart' }] : []),
    ...routeInstructions.map(instruction => ({
      point: instruction.maneuver === 'arrive' ? [destinationStation.lng, destinationStation.lat] as LonLat : instruction.point,
      label: instructionLabel(instruction, locale), arrow: instructionArrow(instruction),
      distanceMeters: instruction.distanceMeters, maneuver: instruction.maneuver,
    })),
  ], [routeGeometry?.instructions, walkingPath, pickupStation?.id, locale, destinationStation.lat, destinationStation.lng])
  const activeElevation = elevationState?.key === activePathKey ? elevationState : null
  const originalAmenities = useMemo(() => (amenitiesState?.routeId === route.id ? amenitiesState.places : EMPTY_ROUTE_AMENITIES)
    .filter(amenity => amenity.kind !== 'pump' && amenity.kind !== 'water'), [amenitiesState?.places, amenitiesState?.routeId, route.id])
  const courseBikeStations = courseBikeStationsState?.routeId === route.id ? courseBikeStationsState.stations : []
  const activeRoadConditions = roadConditions.key === activePathKey ? roadConditions : null

  const nearbySignals = useNearbySignals(discoveryCategory === 'signals', mapCenter)
  // 신호등 자료 중 현재 지도 중심에서 500m 안의 점만 남긴다.
  const routeSignals = useMemo(() => nearbySignals.places.filter(place => distanceMeters(mapCenter, place) <= MAP_NEARBY_RADIUS_METERS), [nearbySignals.places, mapCenter])
  const routeGrades = activeRoadConditions?.grades ?? []

  // 대여소·신호등·CCTV는 별도 자료를 사용한다. 음식점 같은 장소만 장소 검색으로 보낸다.
  const placeCategory = discoveryCategory && !['signals', 'cctv'].includes(discoveryCategory) ? discoveryCategory as NearbyPlaceCategory : null
  const nearbyPlaces = useNearbyPlaces(placeCategory, mapCenter)
  const popupPlace = placePopupPoint ? nearbyPlaces.places.find(place => Math.abs(place.lng - placePopupPoint[0]) + Math.abs(place.lat - placePopupPoint[1]) < .0001) : null
  // 선택한 맛집 또는 카페를 지도 표시 형식으로 바꾼다. 다른 버튼이 선택되면 빈 목록을 보낸다.
  const routeRestaurants = useMemo<RouteRestaurant[]>(() => placeCategory === 'food' || placeCategory === 'cafe'
    ? nearbyPlaces.places.map(place => ({ id: place.id, name: place.name, lat: place.lat, lng: place.lng, kind: placeCategory === 'cafe' ? 'cafe' : 'restaurant' }))
    : EMPTY_ROUTE_RESTAURANTS, [nearbyPlaces.places, placeCategory])
  // 편의점·화장실·명소도 선택한 한 종류의 검색 결과만 지도에 보낸다.
  const routeAmenities = useMemo<RouteAmenity[]>(() => placeCategory && ['convenience', 'toilet', 'visit'].includes(placeCategory)
    ? nearbyPlaces.places.map(place => ({ id: place.id, name: place.name, lat: place.lat, lng: place.lng, kind: placeCategory as RouteAmenity['kind'], distanceMeters: place.distanceMeters }))
    : EMPTY_ROUTE_AMENITIES, [nearbyPlaces.places, placeCategory])
  const showCourse = mapLayers.course
  const showRidingRoute = (showCourse || hasDestination) && Boolean(routedPath?.length)
  const showRestaurants = discoveryCategory === 'food' || discoveryCategory === 'cafe'
  const showCctv = discoveryCategory === 'cctv'
  const showRoadInfo = discoveryCategory === 'signals'
  const showRiders = mapLayers.riders
  const showAmenities = discoveryCategory !== null && ['convenience', 'toilet', 'visit'].includes(discoveryCategory)
  // 대여소는 지도 기본 정보다. 맛집이나 CCTV를 선택해도 항상 함께 표시한다.
  const showBikeStations = true
  // 기본 대여소 자료와 실시간 잔여 수를 합친다. 같은 대여소는 한 번만 표시한다.
  const mapBikeStations = useMemo(() => {
    const byId = new Map(courseBikeStations.map(station => [station.id, station]))
    const liveStations = activeViewportBikes?.stations ?? activeNearbyBikes?.stations ?? []
    for (const station of mapNearbySnapshot) {
      const liveStation = liveStations.find(candidate => candidate.id === station.id)
      byId.set(station.id, liveStation ? { ...station, ...liveStation, distanceMeters: station.distanceMeters } : station)
    }
    for (const station of liveStations) {
      if (distanceMeters(mapCenter, station) <= MAP_NEARBY_RADIUS_METERS) byId.set(station.id, station)
    }
    return [...byId.values()]
      .filter(station => distanceMeters(mapCenter, station) <= MAP_NEARBY_RADIUS_METERS)
      .sort((first, second) => distanceMeters(mapCenter, first) - distanceMeters(mapCenter, second))
  }, [activeNearbyBikes, activeViewportBikes, courseBikeStations, mapCenter, mapNearbySnapshot])
  const routeConditions = routeSignals
  const signalCountLabel = !routedPath || activeRoadConditions?.signalsStatus === 'loading' ? '…'
    : activeRoadConditions?.signalsStatus === 'ready' ? String(routeSignals.length) : '—'
  const uphillCountLabel = !routedPath || activeRoadConditions?.gradesStatus === 'loading' ? '…'
    : activeRoadConditions?.gradesStatus === 'ready' ? String(routeGrades.filter(item => item.kind === 'uphill').length) : '—'
  const downhillCountLabel = !routedPath || activeRoadConditions?.gradesStatus === 'loading' ? '…'
    : activeRoadConditions?.gradesStatus === 'ready' ? String(routeGrades.filter(item => item.kind === 'downhill').length) : '—'
  const routeDistance = routeGeometry?.key === routeGuidanceKey
    ? routeGeometry.distanceMeters
    : pathDistance(routeWaypoints) * 1.3
  const routeDistanceEstimated = routeGeometry?.key !== routeGuidanceKey || (originStopIndex === null && !userLocation)
  const journeyOrigin = originStopIndex !== null ? text(route.stops[originStopIndex]?.place ?? route.stops[0].place, route.stops[originStopIndex]?.placeKo ?? route.stops[0].placeKo)
    : userLocation ? text('My location', '내 위치') : text(route.stops[0].place, route.stops[0].placeKo)
  const journeyDistance = routeDistance
  const routeDurationSeconds = selectedRouteOption?.route.durationSeconds
  const journeyMinutes = routeDurationSeconds && routeDurationSeconds > 0
    ? Math.max(1, Math.round(routeDurationSeconds / 60)) : bikeMinutes(routeDistance)
  const journeyTimeDescription = routeDurationSeconds
    ? text('Fastest bicycle route estimate · riding time only', '최단시간 자전거 경로 기준 · 주행 시간만')
    : text('At 12 km/h · riding only, without sightseeing stops', '시속 12km 기준 · 관광·신호 대기 제외')
  const routeProgressMeters = userLocation && routedPath ? nearestRouteProgress(userLocation, routedPath) : 0
  const remainingRouteMeters = Math.max(0, (routedPath?.length ? pathDistance(routedPath) : routeDistance) - routeProgressMeters)
  const remainingJourneyMinutes = routeDurationSeconds && routedPath?.length
    ? Math.max(1, Math.round(routeDurationSeconds * remainingRouteMeters / Math.max(pathDistance(routedPath), 1) / 60))
    : bikeMinutes(remainingRouteMeters)
  let nextInstructionOffset = 0
  const nextInstruction = routeInstructions.map(instruction => {
    const step = { instruction, offsetMeters: nextInstructionOffset }
    nextInstructionOffset += instruction.distanceMeters
    return step
  }).find(step => step.offsetMeters + 10 >= routeProgressMeters)
  const navigationCue = !hasDestination ? null : routeInstructions.length
    ? <div className="tour-route-next-guidance" role="status" aria-live="polite">
        <span>{text('NEXT DIRECTION', '다음 이동 방향')}</span>
        <strong>{instructionLabel(nextInstruction?.instruction ?? routeInstructions.at(-1)!, locale)}</strong>
        <small>{distanceLabel(Math.max(0, (nextInstruction?.offsetMeters ?? routeDistance) - routeProgressMeters))} {text('to next turn', '뒤 다음 안내')} · {distanceLabel(remainingRouteMeters)} {text('remaining', '남음')}</small>
      </div>
    : <div className="tour-route-next-guidance" role="status" aria-live="polite">
        <span>{text('NEXT DIRECTION', '다음 이동 방향')}</span>
        <strong>{routeGuidanceStatus === 'loading' ? text('Loading bicycle directions…', '자전거 길 안내를 불러오는 중…') : text('Turn-by-turn directions unavailable', '상세 방향 안내를 사용할 수 없어요')}</strong>
        <small>≈ {distanceLabel(remainingRouteMeters)} {text('remaining · estimated', '남음 · 예상 거리')}</small>
      </div>
  // 시각은 밀리초이므로 1000으로 나누어 초로 바꾼다. 시간이 끝나면 0 아래로 내려가지 않는다.
  const rentalSecondsRemaining = rentalDeadline === null ? null : Math.max(0, Math.ceil((rentalDeadline - rentalNow) / 1000))
  const elevationPoints = activeElevation?.points ?? EMPTY_ROUTE_ELEVATION
  const elevationMinimum = elevationPoints.length ? Math.min(...elevationPoints.map(point => point.elevationMeters)) : 0
  const elevationMaximum = elevationPoints.length ? Math.max(...elevationPoints.map(point => point.elevationMeters)) : 0
  const elevationProfileLine = elevationPoints.map((point, index) => `${(index / Math.max(1, elevationPoints.length - 1) * 320).toFixed(1)},${(76 - (point.elevationMeters - elevationMinimum) / Math.max(1, elevationMaximum - elevationMinimum) * 58).toFixed(1)}`).join(' ')
  const totalAscent = elevationPoints.slice(1).reduce((total, point, index) => total + Math.max(0, point.elevationMeters - elevationPoints[index].elevationMeters), 0)
  const displayRoutePath = routedPath ?? routeWaypoints
  const coloredSegments = useMemo(() => routedPath ? coloredRouteSegments(routedPath, elevationPoints) : [], [routedPath, elevationPoints])
  const displayStopIndexes = useMemo(() => customDestination ? EMPTY_STOP_INDEXES : selectedStop === null ? route.stops.map((_, index) => index)
    : [...new Set([originStopIndex ?? (userLocation ? null : 0), viaStopIndex, selectedStop].filter((index): index is number => index !== null))],
  [customDestination, originStopIndex, route.stops, selectedStop, userLocation, viaStopIndex])
  const activeStopIndexes = showCourse ? displayStopIndexes : EMPTY_STOP_INDEXES
  const linePoints = useMemo<LatLngExpression[]>(() => displayRoutePath.map(([lng, lat]) => [lat, lng] as LatLngExpression), [displayRoutePath])
  const approachPoints = useMemo<LatLngExpression[]>(() => approachPath?.map(([lng, lat]) => [lat, lng] as LatLngExpression) ?? [], [approachPath])
  const walkingPoints = useMemo<LatLngExpression[]>(() => walkingPath?.map(([lng, lat]) => [lat, lng] as LatLngExpression) ?? [], [walkingPath])
  const cctvData = usePublicCctvData(showCctv)
  // CCTV는 실제 내 위치에서 20m 안만 표시한다. GPS가 없으면 다른 위치로 대신 검색하지 않는다.
  const cctvCameras = useMemo(() => showCctv && userLocation
    ? nearbyPublicCameras(cctvData.cameras, userLocation, CCTV_NEARBY_RADIUS_METERS)
    : [], [cctvData.cameras, userLocation, showCctv])
  const fallbackCctvClusters = useMemo(() => showCctv
    ? clusterPublicCameras(cctvCameras, getTouristStation(route.stops[0].stationId), 48_000, 2_000)
    : [], [cctvCameras, route.stops, showCctv])
  const solar = getSolarPosition(shadowDate || todayInSeoul(), shadowMinutes, SEOUL_REFERENCE.lat, SEOUL_REFERENCE.lng)
  const nightSkyActive = skyMode === 'night' || (skyMode === 'auto' && solar.elevation < -4)
  const activeSeason = seasonOptions.find(item => item.id === displaySeason) ?? seasonOptions[0]
  const seasonGuide = seasonGuides[displaySeason]
  const categoryRoutes = routes.filter(candidate => candidate.category === category)
    .sort((first, second) => userLocation ? nearestStopDistance(first, userLocation) - nearestStopDistance(second, userLocation) : 0)
  const routeChoices = flatOnly ? routes.filter(candidate => candidate.mostlyFlat)
    .sort((first, second) => userLocation ? nearestStopDistance(first, userLocation) - nearestStopDistance(second, userLocation) : 0) : categoryRoutes
  const durationRoutes = durationFilter === null ? routeChoices : routeChoices.filter(candidate => {
    const minutes = estimatedRouteMinutes(candidate)
    return durationFilter === 30 ? minutes <= 40 : minutes > 40 && minutes <= 75
  })
  const visibleRoutes = durationRoutes.filter(candidate => `${candidate.title} ${candidate.titleKo} ${candidate.area} ${candidate.areaKo}`
    .toLocaleLowerCase().includes(routeSearch.trim().toLocaleLowerCase()))
  const locateNearestRoute = (chooseNearest = true, focusOnSuccess = false) => {
    if (!navigator.geolocation) {
      setLocationError('unavailable')
      if (focusOnSuccess) finishInitialMapSequence(1_800)
      return
    }
    setLocating(true)
    setLocationError(null)
    navigator.geolocation.getCurrentPosition(position => {
      if (!publishLocation(position)) {
        setLocating(false)
        if (focusOnSuccess) finishInitialMapSequence(1_800)
        return
      }
      const location = previousLocationRef.current ?? { lat: position.coords.latitude, lng: position.coords.longitude }
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
      if (focusOnSuccess) {
        setLocationFocusRequest(request => request + 1)
        finishInitialMapSequence(2_300)
      }
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
      if (focusOnSuccess) finishInitialMapSequence(1_800)
    }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 })
  }
  useEffect(() => {
    if (initialLocationRequestedRef.current) return
    initialLocationRequestedRef.current = true
    locateNearestRoute(false, true)
  }, [])
  const chooseCustomDestination = useCallback((point: Coordinates) => {
    if (!isInsideSeoul(point.lat, point.lng)) {
      setDestinationError(true)
      return
    }
    setDestinationError(false)
    closeRoadview()
    setCustomDestination(point)
    setSelection(null)
    setDestinationPicking(false)
    onDestinationStopChange(null)
    onOriginStopChange(null)
    onViaStopChange(null)
    setMapLayers(current => ({ ...current, course: true }))
    if (!userLocation) locateNearestRoute(false)
  }, [closeRoadview, locale, onDestinationStopChange, onOriginStopChange, onViaStopChange, userLocation])
  useEffect(() => {
    if (!searchedDestination || handledSearchSerialRef.current === searchedDestination.serial) return
    handledSearchSerialRef.current = searchedDestination.serial
    chooseCustomDestination(searchedDestination)
  }, [chooseCustomDestination, searchedDestination])
  const navigateRouteFromLocation = (routeId: string) => {
    setMapLayers(current => ({ ...current, course: true }))
    if (originStopIndex === null && !userLocation) locateNearestRoute(false)
    onRouteSelect(routeId)
  }
  const changeBikeUseMode = (mode: BikeUseMode) => {
    setBikeUseMode(mode)
    if (mode === 'personal') {
      setRentalDeadline(null)
      setRentalReminderStatus('idle')
      setTransferRecommendation(null)
    }
  }
  // 1시간 또는 2시간을 누르면 현재 시각에 이용시간을 더하고 바로 카운트다운을 시작한다.
  const startRentalTimer = (minutes: 60 | 120) => {
    // 이미 같은 시간을 사용 중이면 실수로 다시 눌러도 남은 시간을 처음으로 돌리지 않는다.
    if (rentalDeadline !== null && rentalDeadline > Date.now() && rentalLimitMinutes === minutes) return
    setRentalLimitMinutes(minutes)
    try { localStorage.setItem('seoul-bike-rental-minutes', String(minutes)) } catch { /* 화면에서는 계속 선택할 수 있다. */ }
    rentalNoticeRef.current = { fiveMinutes: false, expired: false }
    const now = Date.now()
    setRentalNow(now)
    // 1분은 60,000밀리초다. 현재 시각에 선택한 분 수를 더해 종료 시각을 정한다.
    setRentalDeadline(now + minutes * 60_000)
    setRentalReminderStatus('idle')
  }
  const chooseDestination = (index: number | null) => {
    setDestinationError(false)
    setCustomDestination(null)
    setDestinationPicking(false)
    setMapLayers(current => ({ ...current, course: index !== null }))
    selectStop(index)
    if (index !== null) onOriginStopChange(null)
    if (viaStopIndex === index) onViaStopChange(null)
    if (index !== null && originStopIndex === null && !userLocation) locateNearestRoute(false)
  }
  const rotateMap = (direction: RotationRequest['direction']) => setRotationRequest(current => ({ direction, serial: (current?.serial ?? 0) + 1 }))
  const chooseMapView = (nextView: 'city' | 'satellite' | 'map' | 'google' | 'kakao') => {
    setRotationRequest(null)
    if (nextView !== 'kakao') closeRoadview()
    setView(locale !== 'ko' && (nextView === 'google' || (nextView === 'kakao' && !roadviewEnabled)) ? 'map' : nextView)
  }
  const chooseKakaoMapType = (nextType: 'roadmap' | 'skyview') => {
    setKakaoMapType(nextType)
    setActiveMapTool(null)
    chooseMapView(locale !== 'ko' ? (nextType === 'roadmap' ? 'map' : 'satellite') : 'kakao')
  }
  const toggleRoadview = () => {
    if (roadviewEnabled) { closeRoadview(); return }
    if (!hasKakaoMapsKey) return
    onRoadviewOpen()
    const target = view === 'kakao' ? mapCenter
      : userLocation ?? customDestination ?? { lat: fallbackOriginStation.lat, lng: fallbackOriginStation.lng }
    setRoadviewTarget(target)
    setRoadviewPosition(target)
    setRoadviewEnabled(true)
    setView('kakao')
    setRotationRequest(null)
    setDestinationPicking(false)
    setDestinationError(false)
    setActiveMapTool(null)
    setSidebarOpen(false)
    setMapMenuOpen(false)
    setMobileSheetExpanded(false)
  }
  // 하나의 추가 표시를 선택한다. 같은 버튼을 다시 누르면 추가 표시만 끈다.
  const selectDiscoveryCategory = (category: DiscoveryCategory) => {
    // 종류별 true/false를 따로 두지 않고 하나만 기억하면 여러 종류가 동시에 켜지지 않는다.
    setDiscoveryCategory(current => current === category ? null : category)
    setMapLayers(current => ({ ...current, riders: false }))
    setFocusedPlacePoint(null)
    setPlacePopupAnchor(null)
    setActiveMapTool(null)
    setMapMenuOpen(false)
    if (category === 'cctv' && discoveryCategory !== 'cctv') {
      if (userLocation) setLocationFocusRequest(request => request + 1)
      else if (!locating) locateNearestRoute(false, true)
    }
  }
  const toggleMapLayer = (layer: MapLayerKey) => {
    const category = layer === 'restaurants' ? 'food' : layer === 'cctv' ? 'cctv' : layer === 'roadInfo' ? 'signals' : null
    if (category) selectDiscoveryCategory(category)
    else setMapLayers(current => ({ ...current, [layer]: !current[layer] }))
  }
  useLayoutEffect(() => {
    closeRoadview()
    setSelection(null)
    setHover(null)
    setCustomDestination(null)
    setDestinationPicking(false)
  }, [closeRoadview, route.id])
  useEffect(() => {
    try { localStorage.setItem('seoul-bike-map-layers-v3', JSON.stringify(mapLayers)) } catch { /* Map controls remain available without storage. */ }
  }, [mapLayers])
  useEffect(() => {
    try { localStorage.setItem('seoul-bike-use-mode', bikeUseMode) } catch { /* Preference is optional. */ }
  }, [bikeUseMode])
  useEffect(() => {
    try {
      if (rentalDeadline === null) localStorage.removeItem('seoul-bike-rental-deadline')
      else localStorage.setItem('seoul-bike-rental-deadline', String(rentalDeadline))
    } catch { /* The in-page timer still works if storage is blocked. */ }
  }, [rentalDeadline])
  useEffect(() => {
    if (!trackingLocation || !navigator.geolocation) return
    const watchId = navigator.geolocation.watchPosition(position => {
      publishLocation(position)
    }, error => {
      setLocationError(error.code === 1 ? 'denied' : error.code === 3 ? 'timeout' : 'unavailable')
      if (error.code === 1) { setTrackingLocation(false); setUserLocation(null) }
    }, { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 })
    return () => navigator.geolocation.clearWatch(watchId)
  }, [hasDestination, trackingLocation])
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
    setFocusedPlacePoint(null)
  }, [route.id])
  useEffect(() => {
    if (route.season) setDisplaySeason(route.season)
  }, [route.season])
  useEffect(() => {
    if (!hasDestination || routeWaypoints.length < 2) {
      setRouteOptions(null)
      setRouteGuidanceStatus('idle')
      return
    }
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 30000)
    setRouteGuidanceStatus('loading')
    void fetchBikePaths(routeWaypoints, controller.signal).catch(async () => [await fetchBikePath(routeWaypoints, controller.signal)])
      .then(results => {
        if (controller.signal.aborted) return
        setRouteOptions({ key: routeGuidanceKey, routes: results.map(route => ({ route, signalCount: null })) })
        setRouteGuidanceStatus('ready')
        void Promise.allSettled(results.map(result => fetchRouteSignals(result.geometry, controller.signal))).then(signalResults => {
          if (controller.signal.aborted) return
          setRouteOptions({ key: routeGuidanceKey, routes: results.map((route, index) => ({ route, signalCount: signalResults[index].status === 'fulfilled' ? signalResults[index].value.length : null })) })
        })
      })
      .catch(() => { if (!controller.signal.aborted) { setRouteOptions(null); setRouteGuidanceStatus('unavailable') } })
      .finally(() => window.clearTimeout(timeout))
    return () => { window.clearTimeout(timeout); controller.abort() }
  }, [hasDestination, routeGuidanceKey, routeWaypoints])
  useEffect(() => {
    if (!routedPath || routedPath.length < 2) { setAmenitiesState(null); setCourseBikeStationsState(null); return }
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 14_000)
    let active = true
    setAmenitiesState({ routeId: route.id, places: [], status: 'loading' })
    void Promise.allSettled([fetchRouteAmenities(routedPath, controller.signal), fetchSeoulToiletsAlongRoute(routedPath, controller.signal)]).then(results => {
      const [osm, seoul] = results
      const places = [
        ...(osm.status === 'fulfilled' ? osm.value : []),
        ...(seoul.status === 'fulfilled' ? seoul.value : []),
      ].filter((place, index, all) => all.findIndex(other => other.kind === place.kind && other.lat === place.lat && other.lng === place.lng) === index)
      if (active && places.length) setAmenitiesState({ routeId: route.id, places, status: 'ready' })
      else if (active && osm.status === 'rejected' && seoul.status === 'rejected') setAmenitiesState(current => current?.routeId === route.id ? { ...current, status: 'unavailable' } : current)
      else if (active) setAmenitiesState({ routeId: route.id, places, status: 'ready' })
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
    setElevationState({ key: activePathKey ?? '', points: [], status: 'loading' })
    void fetchRouteElevationProfile(routedPath, controller.signal).then(points => {
      if (active) setElevationState({ key: activePathKey ?? '', points, status: 'ready' })
    }).catch(() => {
      if (active) setElevationState(current => current?.key === activePathKey ? { ...current, status: 'unavailable' } : current)
    }).finally(() => window.clearTimeout(timeout))
    return () => { active = false; window.clearTimeout(timeout); controller.abort() }
  }, [activePathKey, routedPath])
  useEffect(() => {
    if (bikeUseMode === 'personal' || !routedPath || routedPath.length < 2) { setCourseBikeStationsState(null); return }
    const controller = new AbortController()
    let active = true
    const anchorCount = Math.max(2, Math.ceil(routeDistance / 750) + 1)
    const anchors = Array.from({ length: anchorCount }, (_, index) => coordinateAtDistance(routedPath, routeDistance * index / (anchorCount - 1)))
    setCourseBikeStationsState({ routeId: route.id, stations: [], updatedAt: null, status: 'loading' })
    const refresh = () => {
      void Promise.allSettled(anchors.map(([lng, lat]) => fetchNearbyBikeStations({ lat, lng }, controller.signal, 500))).then(results => {
        if (!active) return
        const successful = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])
        if (!successful.length) {
          const snapshotStations = anchors.flatMap(([lng, lat]) => nearestSnapshotStations({ lat, lng }, 1000, 500))
          const byId = new Map(snapshotStations.map(station => [station.id, station]))
          const stations = [...byId.values()].sort((a, b) => a.distanceMeters - b.distanceMeters)
          setCourseBikeStationsState({ routeId: route.id, stations, updatedAt: null, status: 'unavailable' })
          return
        }
        const byId = new Map<string, NearbyBikeStation>()
        for (const result of successful) for (const station of result.stations) {
          const previous = byId.get(station.id)
          if (!previous || station.distanceMeters < previous.distanceMeters) byId.set(station.id, station)
        }
        const stations = [...byId.values()].sort((a, b) => a.distanceMeters - b.distanceMeters)
        const updatedAt = successful.map(result => result.updatedAt).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null
        setCourseBikeStationsState({ routeId: route.id, stations, updatedAt, status: 'live' })
      })
    }
    refresh()
    const interval = window.setInterval(refresh, 90_000)
    return () => { active = false; window.clearInterval(interval); controller.abort() }
  }, [bikeUseMode, route.id, routeDistance, routedPath])
  useEffect(() => {
    if (!routedPath || routedPath.length < 2) {
      setRoadConditions({ key: activePathKey ?? '', signals: [], grades: [], signalsStatus: 'idle', gradesStatus: 'idle' })
      return
    }
    const signalsController = new AbortController()
    const gradesController = new AbortController()
    const signalsTimeout = window.setTimeout(() => signalsController.abort(), 11000)
    const gradesTimeout = window.setTimeout(() => gradesController.abort(), 9000)
    let active = true
    setRoadConditions({ key: activePathKey ?? '', signals: [], grades: [], signalsStatus: 'loading', gradesStatus: 'loading' })
    void fetchRouteSignals(routedPath, signalsController.signal).then(signals => {
      if (active) setRoadConditions(current => current.key === activePathKey ? { ...current, signals, signalsStatus: 'ready' } : current)
    }).catch(() => {
      if (active) setRoadConditions(current => current.key === activePathKey ? { ...current, signalsStatus: 'unavailable' } : current)
    }).finally(() => window.clearTimeout(signalsTimeout))
    void fetchRouteGrades(routedPath, gradesController.signal).then(grades => {
      if (active) setRoadConditions(current => current.key === activePathKey ? { ...current, grades, gradesStatus: 'ready' } : current)
    }).catch(() => {
      if (active) setRoadConditions(current => current.key === activePathKey ? { ...current, gradesStatus: 'unavailable' } : current)
    }).finally(() => window.clearTimeout(gradesTimeout))
    return () => {
      active = false
      window.clearTimeout(signalsTimeout)
      window.clearTimeout(gradesTimeout)
      signalsController.abort()
      gradesController.abort()
    }
  }, [activePathKey, routedPath])

  useEffect(() => {
    if (!locationKey || locationLat === null || locationLng === null) {
      setNearbyBikes(null)
      return
    }
    const controller = new AbortController()
    let active = true
    const location = { lat: locationLat, lng: locationLng }
    setNearbyBikes({ key: locationKey, stations: nearestSnapshotStations(location, 1_000, 1_000), updatedAt: null, status: 'loading' })
    const refresh = () => {
      void fetchNearbyBikeStations(location, controller.signal, MAP_NEARBY_RADIUS_METERS).then(result => {
        if (active) setNearbyBikes({ key: locationKey, stations: result.stations, updatedAt: result.updatedAt, status: 'live' })
      }).catch(() => {
        if (active) setNearbyBikes(current => current?.key === locationKey ? { ...current, status: 'unavailable' } : current)
      })
    }
    refresh()
    const interval = window.setInterval(refresh, 30_000)
    return () => { active = false; window.clearInterval(interval); controller.abort() }
  }, [locationKey, locationLat, locationLng])
  useEffect(() => {
    if (userLocation && distanceMeters(mapCenter, userLocation) <= 30) {
      setViewportBikes(null)
      return
    }
    const controller = new AbortController()
    let active = true
    setViewportBikes({ key: mapCenterKey, stations: mapNearbySnapshot, updatedAt: null, status: 'loading' })
    const refresh = () => {
      void fetchNearbyBikeStations(mapCenter, controller.signal, MAP_NEARBY_RADIUS_METERS).then(result => {
        if (active) setViewportBikes({ key: mapCenterKey, stations: result.stations, updatedAt: result.updatedAt, status: 'live' })
      }).catch(() => {
        if (active) setViewportBikes(current => current?.key === mapCenterKey ? { ...current, status: 'unavailable' } : current)
      })
    }
    refresh()
    const interval = window.setInterval(refresh, 30_000)
    return () => { active = false; window.clearInterval(interval); controller.abort() }
  }, [locationKey, mapCenter, mapCenterKey, mapNearbySnapshot, userLocation])
  useEffect(() => {
    if (rentalDeadline === null) return
    const interval = window.setInterval(() => setRentalNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [rentalDeadline])
  useEffect(() => {
    if (rentalDeadline === null || rentalSecondsRemaining === null) return
    const sendNotification = (title: string, body: string) => {
      if ('Notification' in window && Notification.permission === 'granted') {
        try { new Notification(title, { body, tag: 'ttareungi-return-reminder' }) } catch { /* Keep the in-page alert as a fallback. */ }
      } else {
        setRentalReminderStatus('permission_denied')
        try { navigator.vibrate?.([180, 90, 180]) } catch { /* Vibration is optional. */ }
      }
    }
    if (rentalSecondsRemaining === 0 && !rentalNoticeRef.current.expired) {
      rentalNoticeRef.current.expired = true
      setRentalReminderStatus('expired')
      sendNotification(text('Ttareungi rental time is up', '따릉이 이용 시간이 끝났어요'), text('Return the bike or rent again before continuing.', '자전거를 반납하거나 다시 대여해 주세요.'))
    } else if (rentalSecondsRemaining <= 300 && !rentalNoticeRef.current.fiveMinutes) {
      rentalNoticeRef.current.fiveMinutes = true
      setRentalReminderStatus('five_minutes')
      sendNotification(text('Five minutes left on your Ttareungi pass', '따릉이 이용 시간이 5분 남았어요'), text('Check the nearest return station along your route.', '경로 주변 반납 대여소를 확인하세요.'))
    }
  }, [rentalDeadline, rentalSecondsRemaining, text])
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
    const destinations = selectedStop === null && customDestination === null
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
    const timeout = window.setTimeout(() => controller.abort(), 25000)
    void fetchBikePath(waypoints, controller.signal)
      .then(result => {
        if (!controller.signal.aborted) setApproachRoute({ key: approachKey, points: result.geometry, estimated: false, loading: false, distanceMeters: result.distanceMeters })
      })
      .catch(() => {
        if (!controller.signal.aborted) setApproachRoute({ key: approachKey, points: [origin, destination], estimated: true, loading: false })
      })
      .finally(() => window.clearTimeout(timeout))
    return () => { window.clearTimeout(timeout); controller.abort() }
  }, [approachKey, customDestination, destinationStation.lat, destinationStation.lng, locationLat, locationLng, route.stops, selectedStop])
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
  const locationIcon = useMemo(() => divIcon({
    className: 'tour-leaflet-location-icon',
    html: `<span class="tour-journey-pin tour-journey-pin--start"><span>${siteText(locale, 'Start', '출발')}</span></span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  }), [locale])
  const exactDestination: LonLat | null = hasDestination ? [destinationStation.lng, destinationStation.lat] : null
  const arrivalMarker = routeArrivalMarker(displayRoutePath, exactDestination)
  const arrivalConnector = routeArrivalConnector(displayRoutePath, exactDestination)
  const destinationIcon = useMemo(() => divIcon({ className: 'tour-leaflet-destination-icon', html: `<span class="tour-journey-pin tour-journey-pin--destination"><span>${siteText(locale, 'End', '도착')}</span></span>`, iconSize: [46, 54], iconAnchor: [23, 54] }), [locale])
  const map = <MapContainer className={`tour-explorer-map${destinationPicking ? ' tour-explorer-map--destination-picking' : ''}`} center={points[0]} zoom={13} zoomControl={false} minZoom={9.5} maxZoom={18} scrollWheelZoom maxBounds={latLngBounds(SEOUL_BIKE_MAP_BOUNDS_LATLNG)} maxBoundsViscosity={1}>
    <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' />
    <Polygon positions={SEOUL_MASK_LATLNG} pathOptions={{ stroke: false, fillColor: SEOUL_OUTSIDE_DIM_COLOR, fillOpacity: SEOUL_OUTSIDE_DIM_OPACITY, fillRule: 'evenodd' }} interactive={false} />
    <Polygon positions={SEOUL_BOUNDARY_LATLNG} pathOptions={{ stroke: false, fillColor: SEOUL_AREA_COLOR, fillOpacity: SEOUL_AREA_OPACITY }} interactive={false} />
    <Polyline positions={SEOUL_BOUNDARY_LATLNG} pathOptions={{ color: SEOUL_BOUNDARY_COLOR, weight: SEOUL_BOUNDARY_WIDTH, opacity: 1, dashArray: '10 7', lineCap: 'round', lineJoin: 'round' }} interactive={false} />
    <FocusMap points={points} linePoints={linePoints} approachPoints={approachPoints} walkingPoints={walkingPoints} selectedStop={selectedStop} hasDestination={hasDestination} userLocation={userLocation} locationFocusRequest={locationFocusRequest} />
    <MapCenterReporter onChange={reportMapCenter} />
    <DestinationPickerMapEvents enabled={destinationPicking} onPick={chooseCustomDestination} />
    {showRidingRoute && <Polyline positions={linePoints} pathOptions={{ color: '#294c3a', weight: 9, opacity: .95 }} />}
    {showRidingRoute && coloredSegments.map((segment, index) => <Polyline key={`slope-${index}`} positions={segment.path.map(([lng, lat]) => [lat, lng] as LatLngExpression)} pathOptions={{ color: segment.color, weight: 5, opacity: 1 }} />)}
    {showRidingRoute && linePoints.length > 1 && <Polyline positions={linePoints} pathOptions={{ color: '#294c3a', weight: 2.5, opacity: .92, dashArray: '2 8', lineCap: 'round', interactive: false }} />}
    {showRidingRoute && !routedPath && approachPoints.length > 1 && <Polyline positions={approachPoints} pathOptions={{ color: '#294c3a', weight: 9, opacity: .95 }} />}
    {showRidingRoute && !routedPath && approachPoints.length > 1 && <Polyline positions={approachPoints} pathOptions={{ color: '#fff', weight: 5, opacity: 1 }} />}
    {arrivalConnector && <Polyline positions={arrivalConnector.map(([lng, lat]) => [lat, lng] as LatLngExpression)} pathOptions={{ color: '#fff', weight: 7, opacity: .98, lineCap: 'round', interactive: false }} />}
    {arrivalConnector && <Polyline positions={arrivalConnector.map(([lng, lat]) => [lat, lng] as LatLngExpression)} pathOptions={{ color: '#e33d3d', weight: 3, opacity: 1, dashArray: '4 5', lineCap: 'round', interactive: false }} />}
    {walkingPoints.length > 1 && <Polyline positions={walkingPoints} pathOptions={{ color: '#fff', weight: 8, opacity: .95 }} />}
    {walkingPoints.length > 1 && <Polyline positions={walkingPoints} pathOptions={{ color: '#546a78', weight: 4, opacity: 1, dashArray: '6 6' }} />}
    {showBikeStations && <BikeStationMarkers stations={mapBikeStations} locale={locale} />}
    {showAmenities && routeAmenities.map(amenity => <Marker key={amenity.id} position={[amenity.lat, amenity.lng]}
      eventHandlers={{ click: event => openFoodGuideAt([amenity.lng, amenity.lat], event.target.getElement()) }}
      icon={divIcon({ className: `tour-amenity-icon tour-amenity-icon--${amenity.kind}`, html: `<span>${AMENITY_DISPLAY[amenity.kind].icon}</span><b>${siteText(locale, AMENITY_DISPLAY[amenity.kind].shortEn, AMENITY_DISPLAY[amenity.kind].shortKo)}</b>`, iconSize: [86, 34], iconAnchor: [43, 17] })}>
      <Tooltip>{amenityTitle(amenity, locale)} · {distanceLabel(amenity.distanceMeters)}</Tooltip>
    </Marker>)}
    {userLocation && <Marker position={[userLocation.lat, userLocation.lng]} icon={locationIcon} zIndexOffset={1000}>
      <Tooltip direction="top">{text('You are here', '내 위치')}{userLocation.accuracy !== undefined ? ` · ±${Math.round(userLocation.accuracy)} m` : ''}</Tooltip>
    </Marker>}
    {hasDestination && arrivalMarker && <Marker position={[arrivalMarker.point[1], arrivalMarker.point[0]]}
      icon={divIcon({ className: 'tour-leaflet-route-end-icon', html: `<svg class="tour-route-end-arrow" viewBox="0 0 20 20" style="--route-bearing:${arrivalMarker.bearing}deg" aria-hidden="true"><path d="M10 1 L19 19 L10 14.5 L1 19 Z" /></svg>`, iconSize: [20, 20], iconAnchor: [10, 1] })}
      zIndexOffset={1120} interactive={false} />}
    {(customDestination || selectedStop !== null) && <Marker position={customDestination ? [customDestination.lat, customDestination.lng] : points[selectedStop!]} icon={destinationIcon} zIndexOffset={1100} />}
    {pickupStation && <CircleMarker center={[pickupStation.lat, pickupStation.lng]} radius={11}
      pathOptions={{ color: '#fff', weight: 3, fillColor: '#137e72', fillOpacity: 1 }}>
      <Tooltip direction="top" permanent>{text('Pick up a bike', '자전거 대여')} · {pickupStation.available === null ? '—' : `${pickupStation.available}${text(' bikes', '대')}`}</Tooltip>
    </CircleMarker>}
    {showRoadInfo && routeConditions.map(condition => <CircleMarker key={condition.id} center={[condition.lat, condition.lng]}
      radius={condition.kind === 'signal' ? 7 : 6} pathOptions={{ color: '#fff', weight: 2,
        fillColor: condition.kind === 'signal' ? '#e3aa45' : condition.kind === 'uphill' ? '#c85c43' : '#428cba', fillOpacity: 1 }}>
      <Tooltip direction="top" permanent={condition.kind !== 'signal'} className={condition.kind === 'signal' ? undefined : `tour-grade-tooltip tour-grade-tooltip--${condition.kind}`}>
        {condition.kind === 'signal' ? text('Signal', '신호등') : `${condition.kind === 'uphill' ? '↗' : '↘'} ${condition.grade}%`}
      </Tooltip>
    </CircleMarker>)}
    {showRestaurants && routeRestaurants.map(place => <CircleMarker key={`place-${place.id}`} center={[place.lat, place.lng]} radius={8}
      bubblingMouseEvents={false} eventHandlers={{ click: event => openFoodGuideAt([place.lng, place.lat], event.target.getElement()), mouseover: event => openFoodGuideAt([place.lng, place.lat], event.target.getElement(), true) }}
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
    {showCourse && route.stops.map((stop, index) => displayStopIndexes.includes(index) && <CircleMarker key={stop.stationId} center={points[index]} radius={selectedStop === index || originStopIndex === index || viaStopIndex === index ? 13 : 9}
      eventHandlers={{ click: () => chooseDestination(index), mouseover: () => hoverStop(index) }} pathOptions={{ color: '#fff', weight: 3, fillColor: selectedStop === index ? '#d99628' : viaStopIndex === index ? '#7657bd' : originStopIndex === index || (originStopIndex === null && !userLocation && index === 0) ? '#168653' : '#08765b', fillOpacity: 1 }}>
      <Tooltip direction="top" permanent>{index + 1}. {text(stop.place, stop.placeKo)}</Tooltip>
    </CircleMarker>)}
  </MapContainer>

  const walkingToPickup = bikeUseMode === 'ttareungi' && pickupStation && userLocation && distanceMeters(userLocation, pickupStation) > 30
  const roadSign = hasDestination && directionsPanelVisible ? <div className="tour-road-sign-dock">
    <aside id="tour-road-sign" className="tour-road-sign" aria-label={text('Bicycle directions', '자전거 길 안내')}>
    <div className="tour-road-sign-current" role="status" aria-live="polite">
      <span className="tour-road-sign-arrow" aria-hidden="true">{walkingToPickup ? '🚶' : instructionArrow(nextInstruction?.instruction)}</span>
      <span><small>{walkingToPickup ? text('WALK TO BIKE', '먼저 대여소까지 도보') : text('NEXT DIRECTION', '다음 이동 방향')}</small><strong>{walkingToPickup ? localizeBikeStationName(pickupStation.name, locale) : routeInstructions.length ? instructionLabel(nextInstruction?.instruction ?? routeInstructions.at(-1)!, locale) : routeGuidanceStatus === 'loading' ? text('Loading bicycle directions…', '자전거 길 안내를 불러오는 중…') : text('Follow the highlighted route', '표시된 경로를 따라 이동하세요')}</strong><em>{walkingToPickup ? `${distanceLabel(walkingDistance ?? distanceMeters(userLocation, pickupStation))} ${text('to the bike station', '후 대여소 도착')}` : `${distanceLabel(Math.max(0, (nextInstruction?.offsetMeters ?? routeDistance) - routeProgressMeters))} ${text('to next turn', '후 다음 안내')}`}</em></span>
    </div>
    {routeInstructions.length > 0 && <div className="tour-road-sign-directions">
      <h3>{text('Full directions', '전체 길 안내')}</h3>
      <ol id="tour-road-sign-list">{routeInstructions.map((instruction, index) => <li key={`${instruction.point.join(',')}-${index}`}><span>{instructionLabel(instruction, locale)}</span><small>{distanceLabel(instruction.distanceMeters)}{instruction.roadName ? ` · ${instruction.roadName}` : ''}</small></li>)}</ol>
    </div>}
    </aside>
  </div> : null

  // 길 안내·경로 고도·코스 선택 내용을 메뉴 또는 모바일 표시 위치에 연결한다.
  const itineraryPanel = (
    <aside id="tour-route-sidebar" className="tour-itinerary" aria-label={text('Routes and nearby bikes', '코스와 가까운 따릉이')} hidden={!sidebarOpen}>
      <div className="tour-sidebar-topline"><strong>{text('Plan your ride', '라이딩 계획')}</strong><button type="button" onClick={() => setSidebarOpen(false)} aria-label={text('Close route panel', '코스 패널 닫기')}>×</button></div>
      <div className="tour-sidebar-heading">
        <span className="tour-card-kicker">{text('EXPLORE SEOUL BY BIKE', '따릉이로 서울 둘러보기')}</span>
        <h1>{text(route.title, route.titleKo)}</h1>
        <div><span>◷ {text(route.suggestedTime, route.suggestedTimeKo)}</span><span>{route.stops.length} {text('stops', '곳 경유')}</span></div>
        <div className="tour-bike-time" role="status"><strong>{routeDistanceEstimated ? '≈ ' : ''}{distanceLabel(routeDistance)} · {text(`about ${journeyMinutes} min by bike`, `따릉이 약 ${journeyMinutes}분`)}</strong><small>{journeyTimeDescription}{routeDistanceEstimated ? text(' · distance estimate', ' · 거리 추정치') : ''}</small></div>
      </div>
      <aside className="tour-elevation-card" aria-label={text('Route elevation profile', '코스 고도 그래프')}>
        <div className="tour-elevation-heading"><div><small>{text('ROUTE ELEVATION', '코스 고도')}</small><strong>{activeElevation?.status === 'loading' ? text('Loading profile…', '고도 정보를 불러오는 중…') : activeElevation?.status === 'unavailable' ? text('Profile unavailable', '고도 정보 없음') : text(`Total climb ${Math.round(totalAscent)} m`, `누적 오르막 ${Math.round(totalAscent)} m`)}</strong></div><span>{elevationPoints.length ? `${Math.round(elevationMinimum)}–${Math.round(elevationMaximum)} m` : ''}</span></div>
        {elevationProfileLine && <svg viewBox="0 0 320 84" preserveAspectRatio="none" role="img" aria-label={text('Elevation changes over the route', '전체 경로의 고도 변화')}><path d={`M ${elevationProfileLine.replaceAll(' ', ' L ')} L 320 82 L 0 82 Z`} className="tour-elevation-fill" /><polyline points={elevationProfileLine} className="tour-elevation-line" /></svg>}
      </aside>
      <section className="tour-nearby-stations" aria-live="polite">
        <div className="tour-itinerary-heading"><h3>{text('Nearby Ttareungi', '내 근처 따릉이')}</h3><span>{activeNearbyBikes?.status === 'live' ? text('LIVE', '실시간') : activeNearbyBikes?.status === 'unavailable' ? text('OFFLINE', '연결 대기') : text('LOCATION', '위치')}</span></div>
        {!userLocation ? <p>{text('Tap My location to find rental stations within 500 m.', '내 위치를 누르면 500m 이내 대여소를 모두 보여드려요.')}</p>
          : nearbyStations.length === 0 ? <p>{text('No rental station was found within 500 m.', '500m 이내에서 대여소를 찾지 못했습니다.')}</p>
            : <div className="tour-nearby-list">{nearbyStations.map(station => <button key={station.id} type="button" disabled={station.available === 0} aria-pressed={pickupStation?.id === station.id} onClick={() => {
              setSelectedBikeStationId(station.id)
              try { localStorage.setItem('seoul-bike-selected-pickup-station', station.id) } catch { /* Selection still works in memory. */ }
            }}>
              <span><strong>{localizeBikeStationName(station.name, locale)}</strong><small>#{station.id} · {distanceLabel(station.distanceMeters)}</small></span>
              <b>{station.available === null ? text('N/A', '확인 불가') : station.available}<small>{station.available === null ? '' : text('bikes', '대')}</small></b>
            </button>)}</div>}
        {userLocation && <p className="tour-nearby-status">{activeNearbyBikes?.status === 'loading' ? text('Checking live bike counts…', '남은 자전거 수 확인 중…')
          : activeNearbyBikes?.status === 'live' ? text(`Updated ${new Date(activeNearbyBikes.updatedAt ?? '').toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })} · availability may change`, `최근 조회 ${new Date(activeNearbyBikes.updatedAt ?? '').toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} · 재고는 바뀔 수 있어요`)
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
          <li><span>{customDestination ? text(`Ride to ${destinationLabel}`, `${destinationLabel}(으)로 이동`) : text(`Ride to ${destinationStop.place}`, `${destinationStop.placeKo}(으)로 이동`)}</span><strong>{approachDistance === null ? '—' : `${activeApproachRoute?.estimated ? '≈ ' : ''}${distanceLabel(approachDistance)} · ${bikeMinutes(approachDistance)}${text(' min', '분')}`}</strong></li>
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
        <button type="button" className="tour-nearby-button" onClick={() => locateNearestRoute(true, true)} disabled={locating}>
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
            <label><input type="checkbox" checked={showRestaurants} onChange={() => toggleMapLayer('restaurants')} /><span>{text('Food within 500 m', '주변 500m 식당')}</span><small>{nearbyPlaces.status === 'loading' ? '…' : routeRestaurants.length || ''}</small></label>
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
        {showRestaurants && <p className="tour-cctv-status" role="status">
          {nearbyPlaces.status === 'loading' ? text('Finding nearby food…', '주변 식당을 찾는 중…')
            : nearbyPlaces.status === 'error' ? text('Food search is temporarily unavailable.', '식당 검색을 잠시 사용할 수 없어요.')
              : text(`${nearbyPlaces.places.length} food places within 500 m.`, `주변 500m 식당 ${nearbyPlaces.places.length}곳을 표시합니다.`)}
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
        <div className="tour-duration-filters" role="group" aria-label={text('Choose by ride time', '주행 시간으로 코스 선택')}>
          <button type="button" aria-pressed={durationFilter === 30} onClick={() => setDurationFilter(current => current === 30 ? null : 30)}>{text('About 30 min', '30분 가볍게')}</button>
          <button type="button" aria-pressed={durationFilter === 60} onClick={() => setDurationFilter(current => current === 60 ? null : 60)}>{text('About 1 hour', '1시간 둘러보기')}</button>
        </div>
        {durationFilter !== null && <p className="tour-duration-note">{text('Estimated riding time from route stops; breaks and traffic can change the total.', '경유지 사이 거리로 계산한 예상 주행 시간입니다. 휴식과 교통 상황에 따라 달라질 수 있어요.')}</p>}
        <div className="tour-finder-categories" role="group" aria-label={text('Route categories', '코스 종류')}>
          {(Object.keys(categoryNames) as TourCategory[]).map(key => <button key={key} type="button" aria-pressed={!flatOnly && category === key}
            onClick={() => { setFlatOnly(false); setRouteSearch(''); const next = routes.find(candidate => candidate.category === key); if (next) navigateRouteFromLocation(next.id) }}>
            {text(...categoryNames[key])}</button>)}
        </div>
        <div className="tour-finder-routes" role="group" aria-label={text(flatOnly ? 'Mostly flat route choices' : 'Choose a route', flatOnly ? '평탄한 코스 선택' : '코스 선택')}>
          {visibleRoutes.map(candidate => <button key={candidate.id} type="button" aria-pressed={candidate.id === route.id} onClick={() => navigateRouteFromLocation(candidate.id)}>
            <strong>{text(candidate.title, candidate.titleKo)}</strong>
            <small>{text(candidate.mostlyFlat ? 'Mostly flat · ' : '', candidate.mostlyFlat ? '대체로 평탄 · ' : '')}{userLocation ? `${distanceLabel(nearestStopDistance(candidate, userLocation))} · ` : ''}{text(candidate.suggestedTime, candidate.suggestedTimeKo)}</small>
          </button>)}
          {visibleRoutes.length === 0 && <p className="tour-no-routes">{durationFilter !== null
            ? text('No route in this selection is close to that ride time. Try another time or category.', '이 코스 종류에는 해당 시간대에 맞는 경로가 없어요. 시간이나 코스 종류를 바꿔보세요.')
            : text('No routes match this search.', '검색 결과가 없습니다.')}</p>}
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
              <span><strong>{text(stop.place, stop.placeKo)}</strong><span className="tour-stop-detail">{text(stop.detail, stop.detailKo)}</span><small>{text('Bike station', '대여소')} #{station.id} · {localizeBikeStationName(station.name, locale)}</small><span className="tour-stop-action">{text('View this stop', '이 위치 보기')} ↗</span></span>
            </button>
          </li>
        })}
      </ol>
      <a className="tour-resource-link" href="#tour-checks">{text('Next: check before riding', '다음: 출발 전 확인하기')} <span aria-hidden="true">↓</span></a>
      <div className="tour-route-source">{text('Route reference: ', '코스 참고: ')}
        <a href={route.source} target="_blank" rel="noopener noreferrer">{text("Visit Seoul's official travel guide ↗", '서울 공식 관광 안내 ↗')}</a>
        <p>{text('Station locations: Seoul Open Data, June 2026 snapshot. Check live availability in the official app.', '대여소 위치: 서울 열린데이터광장 2026년 6월 자료. 실시간 대여 가능 여부는 공식 앱에서 확인하세요.')}</p></div>
    </aside>
  )

  const destinationTools = <div className="tour-map-destination-tools">
    <button type="button" className="tour-map-menu-button" aria-expanded={mapMenuOpen} aria-controls="tour-map-control-rail" aria-label={text('Menu', '메뉴')} onClick={() => {
      closeRoadview()
      const open = !mapMenuOpen
      setMapMenuOpen(open)
      if (!open) setSidebarOpen(false)
      setActiveMapTool(null)
    }}><span className="tour-journey-menu-bars" aria-hidden="true"><i /><i /><i /></span><small>{text('Menu', '메뉴')}</small></button>
    <div className="tour-height-legend" aria-label={text('Route elevation: rose low, red high', '길 높낮이: 낮으면 연한 빨강, 높으면 진한 빨강')}>
      <span>{text('Elevation', '길 높낮이')}</span><i aria-hidden="true" /><small>{text('low > high', '낮음 > 높음')}</small>
    </div>
    <button type="button" aria-pressed={destinationPicking} onClick={() => { closeRoadview(); setDestinationError(false); if (destinationPicking) setDestinationPicking(false); else { setMapLayers(current => ({ ...current, course: false })); setDestinationPicking(true); setSidebarOpen(false); setMapMenuOpen(false) } }}>{destinationPicking ? text('Cancel map selection', '도착지 선택 취소') : text('Choose any point on map', '지도에서 원하는 도착지 선택')}</button>
    {customDestination && <button type="button" className="tour-map-clear-destination" onClick={() => { setCustomDestination(null); setDestinationPicking(false); setDestinationError(false); onDestinationStopChange(null) }}>{text('Clear destination', '도착지 해제')}</button>}
    {destinationError && <span className="tour-destination-error" role="alert">{text('Choose a point inside Seoul.', '서울 안의 위치를 선택해 주세요.')}</span>}
  </div>

  return <div className={`tour-explorer-grid${sidebarOpen && !mapMenuOpen ? ' tour-explorer-grid--sidebar-open' : ' tour-explorer-grid--sidebar-closed'}${mapMenuOpen ? ' tour-explorer-grid--menu-open' : ''}${destinationPicking ? ' tour-explorer-grid--destination-picking' : ''}`}>
    <section className="tour-earth-preview" ref={preview} aria-label={text('Explore this route', '코스 지도 살펴보기')}>
      <div className={`tour-ride-toolbar${hasKakaoMapsKey ? ' tour-ride-toolbar--kakao' : ''}`}>
        <div><span className="tour-card-kicker">{text('01 ROUTE · 02 MAP · 03 RIDE', '01 코스 · 02 지도 · 03 출발')}</span>
          <strong aria-live="polite">{customDestination ? destinationLabel : selectedStop === null ? text('Entire route', '전체 코스') : text(route.stops[selectedStop].place, route.stops[selectedStop].placeKo)}</strong></div>
      </div>
      <div className="tour-route-summary" aria-label={text('Selected route overview', '선택한 경로 안내')}>
        <div className="tour-route-summary-stops"><span>{journeyOrigin}</span><i aria-hidden="true">→</i><strong>{destinationLabel}</strong></div>
        <div className="tour-route-summary-metrics"><span><small>{text('DISTANCE', '거리')}</small><strong>{routeDistanceEstimated ? '≈ ' : ''}{distanceLabel(journeyDistance)}</strong></span>
          <span><small>{text('ESTIMATED TIME', '예상 시간')}</small><strong>{text(`About ${journeyMinutes} min`, `약 ${journeyMinutes}분`)}</strong></span>
          {pickupStation && <span className="tour-route-summary-bikes"><small>{text('BIKES NEARBY', '대여 가능')}</small><strong>{pickupStation.available === null ? '—' : `${pickupStation.available}${text(' bikes', '대')}`}</strong></span>}
        </div>
        {navigationCue}
      </div>

      <div className="tour-map-quick-guide" aria-label={text('How to start', '빠른 이용 안내')}>
        <span><b>1</b>{text('Choose a route', '코스를 골라요')}</span><i aria-hidden="true">›</i>
        <span><b>2</b>{text('Check the map', '지도를 살펴봐요')}</span><i aria-hidden="true">›</i>
        <span><b>3</b>{text('Find a bike nearby', '내 주변 자전거를 찾아요')}</span>
      </div>
      <MapDiscoveryBar locale={locale} selected={discoveryCategory} onSelect={selectDiscoveryCategory} controls={destinationTools}
        showDirectionsToggle={hasDestination} directionsVisible={directionsPanelVisible} onToggleDirections={toggleDirectionsPanel}
        cctvLocationStatus={userLocation ? 'ready' : locating ? 'locating' : 'unavailable'}
        status={discoveryCategory === 'signals' ? nearbySignals.status : discoveryCategory === 'cctv' ? (cctvData.loading ? 'loading' : cctvData.error ? 'error' : 'ready') : nearbyPlaces.status}
        count={discoveryCategory === 'cctv' ? cctvCameras.length : discoveryCategory === 'signals' ? routeSignals.length : nearbyPlaces.places.length}
        places={nearbyPlaces.places} focusedPoint={placePopupAnchor ? null : focusedPlacePoint} onFocus={setFocusedPlacePoint} region={nearbyPlaces.region} />
      <div className={`tour-map-stage tour-map-stage--${mapWeather}${destinationPicking ? ' tour-map-stage--destination-picking' : ''}${roadviewEnabled ? ' tour-map-stage--roadview' : ''}${activeMapTool ? ' tour-map-stage--tool-open' : ''}${customDestination ? ' tour-map-stage--custom-destination' : ''}${hasDestination && !directionsPanelVisible ? ' tour-map-stage--directions-hidden' : ''}`} onMouseLeave={() => hoverStop(null)}>
        {bikeUseMode === 'ttareungi' && rentalWidgetTarget && createPortal(<div className="tour-rental-guidance-stack">{rentalTimerOpen && <section id="tour-rental-timer-panel" className="tour-rental-header-widget" aria-label={text('Rental return reminder', '반납 시간 알림')}>
          <div className="tour-rental-map-copy"><h3>{text('Choose your pass time', '이용시간 선택')}</h3><p>{text('Choose a pass to start counting down.', '시간을 선택하면 바로 카운트다운을 시작해요.')}</p></div>
          <div className="tour-rental-pass-options" role="group" aria-label={text('Ttareungi pass duration', '따릉이 이용시간')}>
            <button type="button" aria-pressed={rentalDeadline !== null && rentalLimitMinutes === 60} onClick={() => startRentalTimer(60)}>{text('1 hour', '1시간')}</button>
            <button type="button" aria-pressed={rentalDeadline !== null && rentalLimitMinutes === 120} onClick={() => startRentalTimer(120)}>{text('2 hours', '2시간')}</button>
          </div>
          <div className={`tour-rental-clock-row${rentalDeadline !== null ? ' is-running' : ''}${rentalSecondsRemaining !== null && rentalSecondsRemaining <= 900 ? ' is-due-soon' : ''}`}>
            <div className="tour-rental-digital-panel" role="timer" aria-live="off" aria-label={`${text('Time remaining', '남은 시간')} ${String(Math.floor((rentalSecondsRemaining ?? rentalLimitMinutes * 60) / 3600)).padStart(2, '0')}:${String(Math.floor((rentalSecondsRemaining ?? rentalLimitMinutes * 60) % 3600 / 60)).padStart(2, '0')}:${String((rentalSecondsRemaining ?? rentalLimitMinutes * 60) % 60).padStart(2, '0')}`}>
              <RentalDigitalDisplay seconds={rentalSecondsRemaining ?? rentalLimitMinutes * 60} />
            </div>
            <span className="tour-rental-timer-status"><i aria-hidden="true" />{rentalDeadline === null ? text('READY', '대기') : text('RUNNING', '작동 중')}</span>
          </div>
          {rentalDeadline !== null && <button type="button" className="tour-rental-stop-button" onClick={() => { setRentalDeadline(null); setRentalReminderStatus('idle') }}>{text('Stop', '종료')}</button>}
          {rentalReminderStatus === 'permission_denied' && rentalDeadline !== null && <span className="tour-rental-permission-note" role="status">{text('Browser alerts are off; the timer will stay visible here.', '브라우저 알림이 꺼져 있어요. 화면에서 남은 시간을 확인해 주세요.')}</span>}
        </section>}{roadSign}</div>, rentalWidgetTarget)}
        {destinationPicking && <div className="tour-destination-picking-frame" role="status"><span>{text('Tap anywhere inside Seoul to set your destination', '서울 안의 원하는 위치를 눌러 도착지를 정하세요')}</span></div>}
        {(bikeUseMode !== 'ttareungi' || !rentalWidgetTarget) && roadSign}
        {hasKakaoMapsKey && <nav className="tour-map-view-dock" aria-label={text('Map view and type', '지도 화면과 종류')}>
          <div role="group" aria-label={text('3D view', '3D 보기')}>
            <button type="button" aria-pressed={view === 'city' || view === 'google'} onClick={() => { setActiveMapTool(null); chooseMapView('city') }}>3D</button>
          </div>
          <div role="group" aria-label={text('Map type', '지도 종류')}>
            <button type="button" aria-pressed={view === 'map' || (view === 'kakao' && kakaoMapType === 'roadmap')} onClick={() => chooseKakaoMapType('roadmap')}>{text('Map', '지도')}</button>
            <button type="button" aria-pressed={view === 'satellite' || (view === 'kakao' && kakaoMapType === 'skyview')} onClick={() => chooseKakaoMapType('skyview')}>{text('Sky view', '스카이뷰')}</button>
          </div>
          <button type="button" className="tour-roadview-toggle" aria-pressed={roadviewEnabled} aria-controls="tour-roadview-panel" onClick={toggleRoadview}><span aria-hidden="true">▣</span>{text('Roadview', '로드뷰')}</button>
        </nav>}
    {view === 'city' && <Suspense fallback={<div className="tour-maplibre-3d tour-map-starting">{map}<p className="tour-map-loading-label" role="status">{text('Preparing the 3D city view…', '3D 도시 지도를 준비하고 있어요…')}</p></div>}>
          <MapLibreRoute3D onMapCenterChange={reportMapCenter} key={view} viewMode="city" route={route} routePath={displayRoutePath} elevationProfile={elevationPoints} activeStopIndexes={activeStopIndexes} originStopIndex={originStopIndex} viaStopIndex={viaStopIndex} accessPath={approachPath} accessEstimated={activeApproachRoute?.estimated ?? false} walkPath={walkingPath} pickupStation={pickupStation} amenities={routeAmenities} showAmenities={showAmenities} bikeStations={mapBikeStations} showBikeStations={showBikeStations} season={displaySeason} weather={mapWeather} nightSky={nightSkyActive} routeConditions={routeConditions} restaurants={routeRestaurants} showCourse={showRidingRoute} hasDestination={hasDestination} showRestaurants={showRestaurants} showRoadInfo={showRoadInfo} showRiders={showRiders} cctvCameras={cctvCameras} showCctv={showCctv} showShadows={showShadows} locationFocusRequest={locationFocusRequest} rotationRequest={rotationRequest} onFoodGuideOpen={openFoodGuideAt} locale={locale} userLocation={userLocation} selectedStop={selectedStop} onSelectStop={selectStop} destinationPicking={destinationPicking} customDestination={customDestination} onPickDestination={chooseCustomDestination} onHoverStop={hoverStop} shadowAzimuth={solar.shadowAzimuth} sunElevation={solar.elevation} fallback={map} />
        </Suspense>}
        {view === 'google' && hasGoogleMapsKey && <GoogleRoute3D route={route} routePath={displayRoutePath} elevationProfile={elevationPoints} activeStopIndexes={activeStopIndexes} originStopIndex={originStopIndex} viaStopIndex={viaStopIndex} accessPath={approachPath} routeConditions={routeConditions} restaurants={routeRestaurants} amenities={routeAmenities} showAmenities={showAmenities} showCourse={showRidingRoute} showRestaurants={showRestaurants} showRoadInfo={showRoadInfo} showRiders={showRiders} showCctv={showCctv} cctvCameras={cctvCameras} locationFocusRequest={locationFocusRequest} rotationRequest={rotationRequest} locale={locale} userLocation={userLocation} selectedStop={selectedStop} onSelectStop={selectStop} onHoverStop={hoverStop} onFoodGuideOpen={openFoodGuideAt} fallback={map} />}
        {view === 'kakao' && hasKakaoMapsKey && <KakaoRouteMap route={route} routePath={displayRoutePath} elevationProfile={elevationPoints} activeStopIndexes={activeStopIndexes} originStopIndex={originStopIndex} viaStopIndex={viaStopIndex} accessPath={approachPath} accessEstimated={activeApproachRoute?.estimated ?? false} walkPath={walkingPath} amenities={routeAmenities} showAmenities={showAmenities} bikeStations={mapBikeStations} showBikeStations={showBikeStations} onMapCenterChange={reportMapCenter} showRiders={showRiders} routeConditions={routeConditions} restaurants={routeRestaurants} showCourse={showRidingRoute} hasDestination={hasDestination} showRestaurants={showRestaurants} showRoadInfo={showRoadInfo} showCctv={showCctv} cctvCameras={cctvCameras} locationFocusRequest={locationFocusRequest} locale={locale} userLocation={userLocation} selectedStop={selectedStop} kakaoMapType={kakaoMapType} roadviewEnabled={roadviewEnabled} roadviewPosition={roadviewPosition} onSelectRoadview={selectRoadview} onSelectStop={selectStop} destinationPicking={destinationPicking} customDestination={customDestination} onPickDestination={chooseCustomDestination} onHoverStop={hoverStop} onFoodGuideOpen={openFoodGuideAt} fallback={map} />}
        {roadviewEnabled && view === 'kakao' && roadviewTarget && <KakaoRoadviewPanel target={roadviewTarget} locale={locale} onClose={closeRoadview} onPositionChange={reportRoadviewPosition} routePath={roadviewRoutePath} terrainPath={routedPath} elevationProfile={elevationPoints} directions={roadviewDirections} destination={hasDestination ? destinationStation : null} onDestinationArrival={celebrateRoadviewArrival} />}
        {roadviewEnabled && <div className="tour-roadview-map-hint" role="status"><span>{text('Click a highlighted road to view the street', '표시된 도로를 누르면 거리 사진을 볼 수 있어요')}</span><button type="button" onClick={closeRoadview}>{text('Exit Roadview', '로드뷰 종료')}</button></div>}
        {(view === 'satellite' || view === 'map') && <Suspense fallback={<div className="tour-maplibre-3d tour-map-starting">{map}</div>}>
          <MapLibreRoute3D onMapCenterChange={reportMapCenter} key={view} viewMode={view} route={route} routePath={displayRoutePath} elevationProfile={elevationPoints} activeStopIndexes={activeStopIndexes} originStopIndex={originStopIndex} viaStopIndex={viaStopIndex} accessPath={approachPath} accessEstimated={activeApproachRoute?.estimated ?? false} walkPath={walkingPath} pickupStation={pickupStation} amenities={routeAmenities} showAmenities={showAmenities} bikeStations={mapBikeStations} showBikeStations={showBikeStations} season={displaySeason} weather={mapWeather} nightSky={nightSkyActive} routeConditions={routeConditions} restaurants={routeRestaurants} showCourse={showRidingRoute} hasDestination={hasDestination} showRestaurants={showRestaurants} showRoadInfo={showRoadInfo} showRiders={showRiders} cctvCameras={cctvCameras} showCctv={showCctv} showShadows={showShadows} locationFocusRequest={locationFocusRequest} rotationRequest={rotationRequest} onFoodGuideOpen={openFoodGuideAt} locale={locale} userLocation={userLocation} selectedStop={selectedStop} onSelectStop={selectStop} destinationPicking={destinationPicking} customDestination={customDestination} onPickDestination={chooseCustomDestination} onHoverStop={hoverStop} shadowAzimuth={solar.shadowAzimuth} sunElevation={solar.elevation} fallback={map} />
        </Suspense>}
        <section id="tour-mobile-route-sheet" ref={mobileSheetRef} hidden={hasDestination && !directionsPanelVisible} className={`tour-mobile-route-sheet${mobileSheetExpanded ? ' is-expanded' : ''}${hasDestination ? ' is-navigating' : ''}`} aria-label={text("Selected bike route", "\uC120\uD0DD\uD55C \uC790\uC804\uAC70 \uCF54\uC2A4")}>
          <button type="button" className="tour-mobile-sheet-handle" aria-controls="tour-mobile-route-sheet" aria-expanded={mobileSheetExpanded} aria-label={mobileSheetExpanded ? text('Collapse directions', '길 안내 접기') : text('Show all directions', '전체 길 안내 보기')} onClick={() => setMobileSheetExpanded(expanded => !expanded)}><i /></button>
          {hasDestination ? <>
            <div className="tour-mobile-nav-summary" role="status" aria-live="polite">
              <span className="tour-mobile-nav-arrow" aria-hidden="true">{walkingToPickup ? '🚶' : instructionArrow(nextInstruction?.instruction)}</span>
              <span><small>{walkingToPickup ? text('Walk to the rental station', '먼저 대여소까지 도보') : text('Bicycle directions', '자전거 길 안내')}</small><strong>{walkingToPickup ? localizeBikeStationName(pickupStation.name, locale) : routeInstructions.length ? instructionLabel(nextInstruction?.instruction ?? routeInstructions.at(-1)!, locale) : routeGuidanceStatus === 'loading' ? text('Finding a safer bicycle route…', '안전한 자전거 경로를 찾는 중…') : text('Follow the highlighted route', '표시된 경로를 따라 이동하세요')}</strong><em>{walkingToPickup ? distanceLabel(walkingDistance ?? distanceMeters(userLocation, pickupStation)) : `${distanceLabel(remainingRouteMeters)} ${text('remaining', '남음')}`}</em></span>
            </div>
            <div className="tour-mobile-nav-stats"><strong>{text(`About ${remainingJourneyMinutes} min`, `약 ${remainingJourneyMinutes}분`)}</strong><span>{distanceLabel(remainingRouteMeters)} · {destinationLabel}</span></div>
            {mobileSheetExpanded && <div className="tour-mobile-nav-details"><h3>{text('Full bicycle directions', '전체 자전거 길 안내')}</h3>{routeInstructions.length ? <ol>{routeInstructions.map((instruction, index) => <li key={`${instruction.point.join(',')}-${index}`}><span aria-hidden="true">{instructionArrow(instruction)}</span><div><strong>{instructionLabel(instruction, locale)}</strong><small>{distanceLabel(instruction.distanceMeters)}{instruction.roadName ? ` · ${instruction.roadName}` : ''}</small></div></li>)}</ol> : <p>{text('Route details will appear when the route loads.', '경로를 불러오면 상세 안내가 표시됩니다.')}</p>}</div>}
          </> : <>
            <div className="tour-mobile-sheet-title"><span><small>{text("BIKE ROUTE", "\uC790\uC804\uAC70 \uCF54\uC2A4")}</small><strong>{text(route.title, route.titleKo)}</strong></span><button type="button" onClick={() => { setActiveMapTool("routes"); setSidebarOpen(true) }}>{text("Routes", "\uCF54\uC2A4")}</button></div>
            <div className="tour-mobile-sheet-metrics"><span><b>{distanceLabel(journeyDistance)}</b><small>{text("Distance", "\uAC70\uB9AC")}</small></span><span><b>{text(`About ${journeyMinutes} min`, `\uC57D ${journeyMinutes}\uBD84`)}</b><small>{text("By bike", "\uC790\uC804\uAC70")}</small></span><span><b>{route.stops.length}</b><small>{text("Stops", "\uACBD\uC720\uC9C0")}</small></span></div>
          </>}
          <button type="button" className="tour-mobile-destination" aria-pressed={destinationPicking} onClick={() => { closeRoadview(); setDestinationError(false); setMapLayers(current => ({ ...current, course: false })); setDestinationPicking(true); setActiveMapTool(null); setSidebarOpen(false); setMapMenuOpen(false) }}>
            {destinationPicking ? text("Tap your destination on the map", "지도에서 도착지를 눌러 주세요") : customDestination ? text("Change destination on map", "지도에서 도착지 바꾸기") : text("Choose any destination on map", "지도에서 원하는 도착지 선택")}
          </button>
          {mobileSheetExpanded && <label className="tour-mobile-bike-mode">{text('Bike mode', '자전거 이용 모드')}
            <select value={bikeUseMode} onChange={event => changeBikeUseMode(event.currentTarget.value as BikeUseMode)}>
              <option value="ttareungi">{text('Ttareungi', '따릉이')}</option><option value="personal">{text('My bicycle', '내 자전거')}</option>
            </select>
          </label>}
          <div className="tour-mobile-sheet-actions"><button type="button" onClick={() => { selectDiscoveryCategory('toilet') }}><span aria-hidden="true">&#x1F6BB;</span>{text("Find a toilet", "\uD654\uC7A5\uC2E4 \uCC3E\uAE30")}</button><button type="button" onClick={() => navigateRouteFromLocation(route.id)} disabled={locating || (selectedStop === null && customDestination === null)}><span aria-hidden="true">&#x1F6B2;</span>{locating ? text("Finding location...", "\uC704\uCE58 \uD655\uC778 \uC911...") : originStopIndex === null ? text("Go from my location", "\uB0B4 \uC704\uCE58\uC5D0\uC11C \uCD9C\uBC1C") : text("Start from selected place", "\uC120\uD0DD\uD55C \uC7A5\uC18C\uC5D0\uC11C \uCD9C\uBC1C")}</button></div>
        </section>
        {hasDestination && !roadviewEnabled && <button type="button" className="tour-mobile-directions-toggle"
          aria-controls="tour-mobile-route-sheet" aria-expanded={directionsPanelVisible}
          aria-label={directionsPanelVisible ? text('Hide directions list', '길 안내 목록 닫기') : text('Show directions list', '길 안내 목록 열기')}
          title={directionsPanelVisible ? text('Hide directions list', '길 안내 목록 닫기') : text('Show directions list', '길 안내 목록 열기')}
          onClick={toggleDirectionsPanel}>
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {directionsPanelVisible ? <path d="m6 9 6 6 6-6" /> : <><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" /></>}
          </svg>
        </button>}
        <aside id="tour-map-control-rail" className="tour-map-control-rail" aria-label={text('Menu', '메뉴')}>
          <section className="tour-map-rail-group">
            <div className="tour-map-menu-actions">
              <button type="button" className="tour-map-settings-button" aria-expanded={activeMapTool === 'settings'}
                onClick={() => { setMapMenuOpen(false); setActiveMapTool('settings') }}>
                <span aria-hidden="true">⚙</span>{text('Settings', '설정')}
              </button>
              <button type="button" className="tour-map-rail-sidebar-toggle tour-riding-plan-toggle" aria-expanded={activeMapTool === 'ridePlan'}
                onClick={() => { setMapMenuOpen(false); setSidebarOpen(false); setActiveMapTool('ridePlan') }}>
                <span aria-hidden="true">🚴</span>{text('Ride plan', '라이딩 계획')}
              </button>
            </div>
            <div className="tour-menu-plan-slot" ref={setMenuPlanTarget} />
          </section>
        </aside>
        <button type="button" className="tour-map-locate" onClick={() => { setActiveMapTool(null); locateNearestRoute(false, true) }} disabled={locating} aria-label={text("Show my current location", "\uB0B4 \uD604\uC7AC \uC704\uCE58 \uD45C\uC2DC")}>
          <span aria-hidden="true">&#x25CE;</span>{locating ? text("Locating...", "\uC704\uCE58 \uD655\uC778 \uC911...") : text("My location", "\uB0B4 \uC704\uCE58")}
        </button>
        {activeMapTool && <aside id="tour-map-side-panel" className="tour-map-side-panel" aria-label={text('Map tools panel', '지도 도구 패널')}>
          <header className="tour-map-side-panel-header">
            <div><small>{text('MAP TOOLS', '지도 도구')}</small><strong>{activeMapTool === 'ridePlan' ? text('Ride plan', '라이딩 계획') : activeMapTool === 'routes' ? text('Routes and stops', '코스와 경유지')
              : activeMapTool === 'course' ? text('Route display', '코스 표시')
                : activeMapTool === 'food' ? text('Food along the way', '경로 주변 식당')
                    : activeMapTool === 'cctv' ? text('Public CCTV', '공공 CCTV')
                      : activeMapTool === 'settings' ? text('Map settings', '지도 설정')
                        : activeMapTool === 'location' ? text('Nearby bikes', '내 주변 따릉이')
                          : activeMapTool === '3d' ? text('3D city view', '3D 도시 보기')
                            : activeMapTool === 'facilities' ? text('Rider facilities', '라이더 편의시설') : text('Map view', '지도 보기')}</strong></div>
            <button type="button" onClick={() => setActiveMapTool(null)} aria-label={text('Close map panel', '지도 패널 닫기')}>×</button>
          </header>
          <div className="tour-map-side-panel-body">
            {(activeMapTool === 'routes' || activeMapTool === 'ridePlan') && <>
              <div className="tour-map-panel-feature"><small>{text('SELECTED ROUTE', '선택한 코스')}</small><strong>{text(route.title, route.titleKo)}</strong>
                <span>{distanceLabel(routeDistance)} · {text(`about ${journeyMinutes} min by bike`, `따릉이 약 ${journeyMinutes}분`)}</span></div>
              {bikeUseMode === 'ttareungi' && <section className="tour-course-bike-stations"><h3>{text('Live bikes along this course', '코스 주변 실시간 대여소')}</h3>
                <p>{courseBikeStationsState?.status === 'loading' ? text('Checking nearby stations…', '주변 대여소를 확인 중입니다…') : courseBikeStationsState?.status === 'unavailable' ? text('Live station counts are temporarily unavailable.', '실시간 대여소 정보를 가져올 수 없습니다.') : text(`${courseBikeStations.length} stations near this route`, `경로 주변 ${courseBikeStations.length}곳`)}</p>
                {courseBikeStations.length > 0 && <ul>{courseBikeStations.map(station => <li key={station.id}><span><strong>{localizeBikeStationName(station.name, locale)}</strong><small>{distanceLabel(station.distanceMeters)} {text('from route', '경로 근처')}</small></span><b className={station.available === 0 ? 'is-empty' : ''}>{station.available ?? '—'}<small>{text('bikes', '대')}</small></b></li>)}</ul>}
              </section>}
              <section className="tour-destination-list"><h3>{text('Choose a destination on the map', '지도에서 도착지를 선택하세요')}</h3><p>{text('Tap anywhere in Seoul to get bicycle directions from your location.', '서울 지도에서 원하는 곳을 누르면 내 위치부터 자전거 길을 안내합니다.')}</p>
                <button type="button" className="tour-destination-map-button" aria-pressed={destinationPicking} onClick={() => { closeRoadview(); setDestinationError(false); setMapLayers(current => ({ ...current, course: false })); setDestinationPicking(true); setActiveMapTool(null); setSidebarOpen(false); setMapMenuOpen(false) }}>{destinationPicking ? text('Tap a point on the map', '지도에서 원하는 곳을 눌러 주세요') : text('Pick a point on map', '지도에서 위치 찍기')}</button>
              </section>
              <button type="button" className="tour-map-panel-action tour-map-panel-action--quiet" onClick={() => { setActiveMapTool(null); setSidebarOpen(true) }}>{text('Browse all courses', '전체 코스 둘러보기')} ↗</button>
              <section className="tour-turn-guide"><h3>{text('Turn-by-turn guide', '구간별 길 안내')}</h3>
                {!hasDestination ? <p>{text('Choose any destination on the map to start directions from your location.', '지도에서 원하는 도착지를 선택하면 내 위치에서 길 안내를 시작합니다.')}</p>
                  : !routeInstructions.length ? <p>{routeGuidanceStatus === 'loading' ? text('Loading bicycle directions…', '자전거 경로 안내를 불러오는 중입니다…') : routeGuidanceStatus === 'unavailable' ? text('Could not load turn-by-turn directions. Check your connection and try again.', '상세 경로 안내를 불러오지 못했습니다. 연결을 확인하고 다시 시도해 주세요.') : text('Detailed bicycle directions are unavailable for this route.', '이 코스는 상세 자전거 길 안내를 제공하지 않습니다.')}</p>
                    : <ol>{routeInstructions.slice(0, 18).map((instruction, index) => <li key={`${instruction.point.join(',')}-${index}`}><span>{instructionLabel(instruction, locale)}</span><small>{distanceLabel(instruction.distanceMeters)}{instruction.roadName ? ` · ${instruction.roadName}` : ''}</small></li>)}</ol>}
              </section>
            </>}
            {activeMapTool === 'course' && <>
              <p>{text('Show the selected route and the path from your location.', '선택한 코스와 내 위치에서 출발하는 경로를 지도에 표시합니다.')}</p>
              <button type="button" className="tour-map-panel-action" aria-pressed={showCourse} onClick={() => toggleMapLayer('course')}>{showCourse ? text('Hide route', '코스 숨기기') : text('Show route', '코스 표시')}</button>
            </>}


            {activeMapTool === 'settings' && <>
              <section className="tour-map-panel-section"><h3>{text('Bike mode', '자전거 이용 모드')}</h3>
                <div className="tour-bike-mode-picker" role="group" aria-label={text('Choose a bike mode', '자전거 이용 모드 선택')}>
                  <button type="button" aria-pressed={bikeUseMode === 'ttareungi'} onClick={() => changeBikeUseMode('ttareungi')}>{text('Ttareungi', '따릉이')}</button>
                  <button type="button" aria-pressed={bikeUseMode === 'personal'} onClick={() => changeBikeUseMode('personal')}>{text('My bicycle', '내 자전거')}</button>
                </div>
                <p className="tour-map-panel-note">{text('Nearby rental stations and live bike counts are shown on the map. Rental reminders are available in Ttareungi mode.', '주변 따릉이 대여소와 실시간 잔여 대수를 지도에 표시합니다. 대여 알림은 따릉이 모드에서 사용할 수 있습니다.')}</p>
              </section>
              <section className="tour-map-panel-section"><h3>{text('Seasonal scenery', '계절 풍경')}</h3>
                <div className="tour-season-picker" role="group" aria-label={text('Seasonal map scenery', '계절별 지도 풍경')}>
                  {seasonOptions.map(option => <button key={option.id} type="button" aria-pressed={displaySeason === option.id}
                    className={`tour-season-tab tour-season-tab--${option.id}`} onClick={() => chooseSeason(option.id)}>{text(option.en, option.ko)}</button>)}
                </div><p className="tour-map-panel-note">{text(activeSeason.sceneryEn, activeSeason.sceneryKo)}</p>
              </section>
              <section className="tour-map-panel-section"><h3>{text('3D sky', '3D 하늘')}</h3>
                <div className="tour-sky-mode-picker" role="group" aria-label={text('Sky lighting', '하늘 조명')}>
                  {([['auto', 'Auto', '자동'], ['day', 'Day', '낮'], ['night', 'Night', '밤']] as const).map(([id, en, ko]) =>
                    <button key={id} type="button" aria-pressed={skyMode === id} onClick={() => { setSkyMode(id); if (view !== 'city') chooseMapView('city') }}>{text(en, ko)}</button>)}
                </div><p className="tour-map-panel-note">{text('The night sky follows Seoul time in Auto mode; seasons use different dusk and night colors.', '자동은 서울 시간에 맞춰 밤하늘을 보여주며 계절마다 노을과 밤 색이 달라집니다.')}</p>
              </section>
              <section className="tour-map-panel-section"><h3>{text('Weather', '날씨 표현')}</h3>
                <div className="tour-weather-setting"><div role="group" aria-label={text('Choose weather appearance', '날씨 표현 선택')}>
                  {([['sunny', '☀️', 'Sun', '햇볕'], ['cloudy', '☁️', 'Cloudy', '흐림'], ['rainy', '🌧️', 'Rain', '비']] as const).map(([id, icon, en, ko]) =>
                    <button key={id} type="button" aria-pressed={mapWeather === id} onClick={() => setMapWeather(id)}><span aria-hidden="true">{icon}</span>{text(en, ko)}</button>)}
                </div></div>
              </section>
              <section className="tour-map-panel-section tour-map-panel-section--actions"><h3>{text('On the map', '지도에 표시')}</h3>
                <label className="tour-map-panel-check"><input type="checkbox" checked={discoveryCategory === 'convenience'} onChange={() => selectDiscoveryCategory('convenience')} /><span>{text('Convenience stores', '편의점')}</span><small>{nearbyPlaces.status === 'loading' ? '…' : routeAmenities.length}</small></label>
                <button type="button" className="tour-map-panel-action" aria-pressed={showShadows} onClick={() => setShowShadows(value => !value)}>{text('Building shadows', '건물 그림자')} · {showShadows ? text('On', '켜짐') : text('Off', '꺼짐')}</button>
              </section>
            </>}
            {activeMapTool === 'location' && <>
              <p>{bikeUseMode === 'personal'
                ? userLocation ? text('Your location is on the map. Rental information is hidden in My bicycle mode.', '내 자전거 모드입니다. 현재 위치를 표시하고 대여 정보는 숨겼어요.') : text('Allow location access to show your starting point. Rental information stays hidden.', '출발지를 표시하려면 위치 접근을 허용해 주세요. 대여 정보는 숨겨져 있어요.')
                : userLocation ? text('Your current location is on the map.', '현재 위치를 지도에 표시했습니다.') : text('Allow location access to find the nearest rental station.', '가까운 대여소를 찾으려면 위치 접근을 허용해 주세요.')}</p>
              <button type="button" className="tour-map-panel-action" onClick={() => locateNearestRoute(false, true)} disabled={locating}>{locating ? text('Finding your location…', '위치 확인 중…') : text('Find bikes near me', '내 주변 대여소 찾기')}</button>
              {bikeUseMode === 'ttareungi' && pickupStation && <div className="tour-map-panel-feature"><small>{text('NEAREST RENTAL STATION', '가까운 대여소')}</small><strong>{localizeBikeStationName(pickupStation.name, locale)}</strong><span>{pickupStation.available === null ? text('Live count unavailable', '실시간 잔여 수 확인 불가') : text(`${pickupStation.available} bikes available`, `${pickupStation.available}대 대여 가능`)}</span></div>}
              {bikeUseMode === 'ttareungi' && rentalDeadline !== null && <div className="tour-transfer-recommendation" role="status"><small>{text('SUGGESTED RE-RENTAL STOP', '추천 재대여 대여소')}</small>{transferRecommendation?.status === 'loading' ? <strong>{text('Checking live bike availability…', '실시간 잔여 자전거 확인 중…')}</strong> : transferRecommendation?.station ? <><strong>{localizeBikeStationName(transferRecommendation.station.name, locale)}</strong><span>{transferRecommendation.station.available === null ? text('Live bike count unavailable', '실시간 잔여 대수 확인 불가') : `${transferRecommendation.station.available}${text(' bikes available', '대 대여 가능')}`} · {distanceLabel(transferRecommendation.station.distanceMeters)} {text('from route', '경로 지점')}</span></> : <strong>{text('No available station was found near the route point.', '경로 근처에 대여 가능한 대여소를 찾지 못했습니다.')}</strong>}{rentalSecondsRemaining === 0 && <b>{text('Rental time is up. Return the bike or rent again.', '이용 시간이 끝났어요. 자전거를 반납하거나 다시 대여해 주세요.')}</b>}{rentalSecondsRemaining !== null && rentalSecondsRemaining > 0 && rentalSecondsRemaining <= 900 && <b>{text('Rental time is nearly up. Return and rent again here.', '대여 시간이 얼마 남지 않았어요. 이곳에 반납 후 다시 대여하세요.')}</b>}</div>}
            </>}
            {activeMapTool === '3d' && <>
              <p>{text('Explore the route with raised buildings and the 3D camera controls.', '건물 입체 표현과 카메라 조작으로 코스를 살펴보세요.')}</p>
              <div className="tour-map-view-options"><button type="button" aria-pressed={view === 'city'} onClick={() => chooseMapView('city')}>{text('City', '\uB3C4\uC2DC')}</button>
                <button type="button" aria-pressed={view === 'satellite'} onClick={() => chooseMapView('satellite')}>{text('Satellite', '위성')}</button></div>
            </>}
          </div>
        </aside>}
        {bikeUseMode === 'ttareungi' && pickupStation && <div className="tour-bike-stock-overlay" role="status" aria-live="polite">
          <span aria-hidden="true">🚲</span><div><strong>{pickupStation.available !== null
            ? text(`${pickupStation.available} bikes available`, `${pickupStation.available}대 대여 가능`)
            : activeNearbyBikes?.status === 'unavailable' ? text('Live count unavailable', '실시간 잔여 대수 확인 불가') : text('Checking bikes', '잔여 수 확인 중')}</strong><small>{localizeBikeStationName(pickupStation.name, locale)}</small></div>
        </div>}

        {view !== 'kakao' && <div className={`tour-map-rotate-controls${view === 'city' || view === 'google' ? ' tour-map-rotate-controls--tilt' : ''}${hasDestination ? ' tour-map-rotate-controls--directions' : ''}`} role="group" aria-label={text('Map camera controls', '지도 방향 조작')}>
          <button type="button" className="tour-map-arrow--up" onClick={() => rotateMap('up')} aria-label={view === 'city' || view === 'google' ? text('Tilt the camera up', '카메라 시점을 올리기') : text('Move map north', '지도를 북쪽으로 이동')} title={view === 'city' ? text('Look up to the sky', '하늘 보기') : undefined}>↑</button>
          <button type="button" className="tour-map-arrow--left" onClick={() => rotateMap('left')} aria-label={text('Rotate map to the left', '지도를 왼쪽으로 회전')}>←</button>
          <button type="button" className="tour-map-arrow--right" onClick={() => rotateMap('right')} aria-label={text('Rotate map to the right', '지도를 오른쪽으로 회전')}>→</button>
          <button type="button" className="tour-map-arrow--down" onClick={() => rotateMap('down')} aria-label={view === 'city' || view === 'google' ? text('Tilt the camera down', '카메라 시점을 내리기') : text('Move map south', '지도를 남쪽으로 이동')}>↓</button>
        </div>}
        {popupPlace && placePopupAnchor && <PlaceReviewPopup key={popupPlace.id} place={userLocation ? { ...popupPlace, distanceMeters: distanceMeters(userLocation, popupPlace) } : popupPlace} region={nearbyPlaces.region} locale={locale} anchor={placePopupAnchor} onClose={closePlacePopup}
          onNavigate={() => { chooseCustomDestination(popupPlace); closePlacePopup() }} />}
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

    {mapMenuOpen && menuPlanTarget ? createPortal(itineraryPanel, menuPlanTarget) : itineraryPanel}
    {(arrival.open || (roadviewTripKey !== null && roadviewCelebrationKey === roadviewTripKey)) && <DestinationArrival locale={locale} onClose={dismissArrival} />}
  </div>
}


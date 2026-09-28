import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet'
import { latLngBounds, type LatLngExpression } from 'leaflet'
import { getTouristStation, type TourCategory, type TouristRoute } from '../data/touristRoutes'
import { GoogleRoute3D } from './GoogleRoute3D'
import { hasGoogleMapsKey } from '../services/googleMaps3d'
import { downloadEarthRoute, googleEarthUrl } from '../utils/googleEarth'
import { findSceneryPhoto, type SceneryPhoto } from '../services/sceneryPhotos'
import { getSolarPosition, todayInSeoul } from '../utils/solarPosition'
import { fetchBikeRoute, type LonLat } from '../services/bikeRoute'

const MapLibreRoute3D = lazy(() => import('./MapLibreRoute3D').then(module => ({ default: module.MapLibreRoute3D })))
const SEOUL_REFERENCE = { lat: 37.5665, lng: 126.978 }
type Coordinates = { lat: number; lng: number }
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

function FocusMap({ points, linePoints, selectedStop }: { points: LatLngExpression[]; linePoints: LatLngExpression[]; selectedStop: number | null }) {
  const map = useMap()
  useEffect(() => {
    if (selectedStop === null) map.fitBounds(latLngBounds(linePoints), { padding: [45, 45], maxZoom: 14, animate: false })
    else map.setView(points[selectedStop], 15, { animate: false })
  }, [map, points, linePoints, selectedStop])
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
  const [view, setView] = useState<'city' | 'google' | 'map'>('city')
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null)
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState<'denied' | 'unavailable' | 'timeout' | null>(null)
  const [nearestResult, setNearestResult] = useState<{ routeId: string; distance: number } | null>(null)
  const [routeGeometry, setRouteGeometry] = useState<{ routeId: string; points: LonLat[] } | null>(null)
  const pendingNearest = useRef<{ routeId: string; index: number } | null>(null)
  const preview = useRef<HTMLElement>(null)
  const text = (en: string, ko: string) => locale === 'en' ? en : ko
  const selectedStop = selection?.routeId === route.id ? selection.index : null
  const hoveredStop = hover?.routeId === route.id ? hover.index : null
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
  const linePoints = useMemo<LatLngExpression[]>(() => routedPath
    ? routedPath.map(([lng, lat]) => [lat, lng] as LatLngExpression)
    : points, [routedPath, points])
  const solar = getSolarPosition(shadowDate || todayInSeoul(), shadowMinutes, SEOUL_REFERENCE.lat, SEOUL_REFERENCE.lng)
  const categoryRoutes = routes.filter(candidate => candidate.category === category)
    .sort((first, second) => userLocation ? nearestStopDistance(first, userLocation) - nearestStopDistance(second, userLocation) : 0)
  const locateNearestRoute = () => {
    if (!navigator.geolocation) {
      setLocationError('unavailable')
      return
    }
    setLocating(true)
    setLocationError(null)
    navigator.geolocation.getCurrentPosition(position => {
      const location = { lat: position.coords.latitude, lng: position.coords.longitude }
      let closest: { route: TouristRoute; index: number; distance: number } | null = null
      for (const candidate of routes) {
        candidate.stops.forEach((stop, index) => {
          const station = getTouristStation(stop.stationId)
          const distance = distanceMeters(location, station)
          if (closest === null || distance < closest.distance) closest = { route: candidate, index, distance }
        })
      }
      setLocating(false)
      setUserLocation(location)
      if (closest === null) return
      const nearest: { route: TouristRoute; index: number; distance: number } = closest
      setNearestResult({ routeId: nearest.route.id, distance: nearest.distance })
      if (nearest.route.id === route.id) setSelection({ routeId: route.id, index: nearest.index })
      else {
        pendingNearest.current = { routeId: nearest.route.id, index: nearest.index }
        onRouteSelect(nearest.route.id)
      }
    }, error => {
      setLocating(false)
      setLocationError(error.code === 1 ? 'denied' : error.code === 3 ? 'timeout' : 'unavailable')
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 120000 })
  }
  useLayoutEffect(() => {
    const pending = pendingNearest.current
    setSelection(pending?.routeId === route.id ? pending : null)
    if (pending?.routeId === route.id) pendingNearest.current = null
    setHover(null)
  }, [route.id])
  useEffect(() => {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 12000)
    void fetchBikeRoute(route, controller.signal)
      .then(result => { if (!controller.signal.aborted) setRouteGeometry({ routeId: route.id, points: result.geometry }) })
      .catch(() => { if (!controller.signal.aborted) setRouteGeometry(null) })
      .finally(() => window.clearTimeout(timeout))
    return () => { window.clearTimeout(timeout); controller.abort() }
  }, [route])
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
  const map = <MapContainer className="tour-explorer-map" center={points[0]} zoom={13} scrollWheelZoom={false}>
    <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' />
    <FocusMap points={points} linePoints={linePoints} selectedStop={selectedStop} />
    <Polyline positions={linePoints} pathOptions={{ color: '#f5f5ed', weight: 9, opacity: .96 }} />
    <Polyline positions={linePoints} pathOptions={{ color: '#08765b', weight: 5, opacity: 1 }} />
    {userLocation && <CircleMarker center={[userLocation.lat, userLocation.lng]} radius={9}
      pathOptions={{ color: '#fff', weight: 3, fillColor: '#246fe5', fillOpacity: 1 }}>
      <Tooltip direction="top">{text('You are here', '내 위치')}</Tooltip>
    </CircleMarker>}
    {route.stops.map((stop, index) => <CircleMarker key={stop.stationId} center={points[index]} radius={selectedStop === index ? 13 : 9}
      eventHandlers={{ click: () => selectStop(index), mouseover: () => hoverStop(index) }} pathOptions={{ color: '#fff', weight: 3, fillColor: selectedStop === index ? '#d99628' : '#08765b', fillOpacity: 1 }}>
      <Tooltip direction="top" permanent>{index + 1}. {text(stop.place, stop.placeKo)}</Tooltip>
    </CircleMarker>)}
  </MapContainer>

  return <div className="tour-explorer-grid">
    <section className="tour-earth-preview" ref={preview} aria-label={text('Explore this route', '코스 지도 살펴보기')}>
      <div className="tour-ride-toolbar">
        <div><span className="tour-card-kicker">{text('EXPLORE YOUR STOPS', '경유지를 눌러 둘러보세요')}</span>
          <strong aria-live="polite">{selectedStop === null ? text('Entire route', '전체 코스') : text(route.stops[selectedStop].place, route.stops[selectedStop].placeKo)}</strong></div>
        <div className="tour-view-switch" role="group" aria-label={text('Map view', '지도 보기')}>
          <button type="button" aria-pressed={view === 'city'} onClick={() => setView('city')}>{text('3D aerial', '위성 3D')}</button>
          {hasGoogleMapsKey && <button type="button" aria-pressed={view === 'google'} onClick={() => setView('google')}>Google 3D</button>}
          <button type="button" aria-pressed={view === 'map'} onClick={() => setView('map')}>{text('2D map', '2D 지도')}</button>
        </div>
      </div>
      <div className="tour-map-stage" onMouseLeave={() => hoverStop(null)}>
        {view === 'city' && <Suspense fallback={<div className="tour-maplibre-3d tour-map-starting">{map}<p className="tour-map-loading-label" role="status">{text('Preparing the 3D city view…', '3D 도시 지도를 준비하고 있어요…')}</p></div>}>
          <MapLibreRoute3D viewMode="city" route={route} routePath={routedPath} locale={locale} userLocation={userLocation} selectedStop={selectedStop} onSelectStop={selectStop} onHoverStop={hoverStop} shadowAzimuth={solar.shadowAzimuth} sunElevation={solar.elevation} fallback={map} />
        </Suspense>}
        {view === 'google' && hasGoogleMapsKey && <GoogleRoute3D route={route} routePath={routedPath} locale={locale} userLocation={userLocation} selectedStop={selectedStop} onSelectStop={selectStop} onHoverStop={hoverStop} fallback={map} />}
        {view === 'map' && <Suspense fallback={<div className="tour-maplibre-3d tour-map-starting">{map}</div>}>
          <MapLibreRoute3D viewMode="map" route={route} routePath={routedPath} locale={locale} userLocation={userLocation} selectedStop={selectedStop} onSelectStop={selectStop} onHoverStop={hoverStop} shadowAzimuth={solar.shadowAzimuth} sunElevation={solar.elevation} fallback={map} />
        </Suspense>}
        {view !== 'google' && <div className="tour-shadow-legend" aria-label={text('Building shadow areas', '건물 그림자 영역')}><span />{text('Building shadows', '건물 그림자')}</div>}
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
      <p className="tour-map-note">{text('The 3D aerial view combines satellite imagery with OpenStreetMap building heights. Building detail varies by area. Google Earth opens in a new tab at the selected stop; import the KML to see all stops.', '위성 사진 위에 OpenStreetMap 건물 높이 데이터를 입체로 겹쳐 보여줍니다. 건물 표현은 지역별 지도 데이터에 따라 달라집니다. Google Earth는 선택한 경유지를 새 탭에서 열며, KML을 가져오면 전체 경유지를 볼 수 있습니다.')}</p>
      <p className="tour-map-note">{routedPath
        ? text('The line is a suggested bicycle route between stops. Check signs and path conditions before riding.', '표시된 선은 경유지 사이의 추천 자전거 경로입니다. 출발 전에 표지와 길 상태를 확인하세요.')
        : text('The line connects stops while bicycle routing loads or is unavailable. It is not turn-by-turn directions.', '자전거 경로를 불러오는 동안 또는 불러올 수 없을 때는 경유지를 선으로 연결합니다. 이 선은 길안내가 아닙니다.')}</p>
    </section>
    <aside className="tour-itinerary" aria-label={text('Route stops', '코스 경유지')}>
      <div className="tour-route-finder">
        <button type="button" className="tour-nearby-button" onClick={locateNearestRoute} disabled={locating}>
          <span aria-hidden="true">◎</span>{locating ? text('Finding nearby routes…', '가까운 코스를 찾는 중…') : text('Find routes near me', '내 위치로 가까운 코스 찾기')}
        </button>
        <p className="tour-location-result" role="status">
          {locationError === 'denied' ? text('Location access was blocked. Choose a route below.', '위치 권한이 차단됐어요. 아래에서 코스를 선택해 주세요.')
            : locationError === 'timeout' ? text('Location timed out. Please try again.', '위치를 찾는 시간이 초과됐어요. 다시 시도해 주세요.')
              : locationError === 'unavailable' ? text('Your location is unavailable. Choose a route below.', '현재 위치를 사용할 수 없어요. 아래에서 코스를 선택해 주세요.')
                : nearestResult ? text(`Nearest stop: ${distanceLabel(nearestResult.distance)} away`, `가장 가까운 경유지까지 ${distanceLabel(nearestResult.distance)}`)
                  : text('Use your location to highlight the closest course.', '현재 위치에서 가장 가까운 코스를 지도에 표시합니다.')}
        </p>
        <div className="tour-itinerary-heading"><h3>{text('Browse routes', '코스 구경하기')}</h3><span>{routes.length}{text(' routes', '개 코스')}</span></div>
        <div className="tour-finder-categories" role="group" aria-label={text('Route categories', '코스 종류')}>
          {(Object.keys(categoryNames) as TourCategory[]).map(key => <button key={key} type="button" aria-pressed={category === key}
            onClick={() => { const next = routes.find(candidate => candidate.category === key); if (next) onRouteSelect(next.id) }}>
            {text(...categoryNames[key])}</button>)}
        </div>
        <div className="tour-finder-routes" role="group" aria-label={text('Choose a route', '코스 선택')}>
          {categoryRoutes.map(candidate => <button key={candidate.id} type="button" aria-pressed={candidate.id === route.id} onClick={() => onRouteSelect(candidate.id)}>
            <strong>{text(candidate.title, candidate.titleKo)}</strong>
            <small>{userLocation ? `${distanceLabel(nearestStopDistance(candidate, userLocation))} · ` : ''}{text(candidate.suggestedTime, candidate.suggestedTimeKo)}</small>
          </button>)}
        </div>
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
    </aside>
  </div>
}

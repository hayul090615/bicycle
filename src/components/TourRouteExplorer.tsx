import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet'
import { latLngBounds, type LatLngExpression } from 'leaflet'
import { getTouristStation, type TouristRoute } from '../data/touristRoutes'
import { GoogleRoute3D } from './GoogleRoute3D'
import { hasGoogleMapsKey } from '../services/googleMaps3d'
import { downloadEarthRoute, googleEarthUrl } from '../utils/googleEarth'
import { findSceneryPhoto, type SceneryPhoto } from '../services/sceneryPhotos'
import { getSolarPosition, todayInSeoul } from '../utils/solarPosition'

const MapLibreRoute3D = lazy(() => import('./MapLibreRoute3D').then(module => ({ default: module.MapLibreRoute3D })))
const SEOUL_REFERENCE = { lat: 37.5665, lng: 126.978 }

function FocusMap({ points, selectedStop }: { points: LatLngExpression[]; selectedStop: number | null }) {
  const map = useMap()
  useEffect(() => {
    if (selectedStop === null) map.fitBounds(latLngBounds(points), { padding: [45, 45], maxZoom: 14, animate: false })
    else map.setView(points[selectedStop], 15, { animate: false })
  }, [map, points, selectedStop])
  return null
}

export function TourRouteExplorer({ route, locale, shadowDate, shadowMinutes }: {
  route: TouristRoute
  locale: 'en' | 'ko'
  shadowDate: string
  shadowMinutes: number
}) {
  const [selection, setSelection] = useState<{ routeId: string; index: number } | null>(null)
  const [hover, setHover] = useState<{ routeId: string; index: number } | null>(null)
  const [sceneryPhoto, setSceneryPhoto] = useState<SceneryPhoto | null>(null)
  const [photoLoading, setPhotoLoading] = useState(false)
  const [view, setView] = useState<'city' | 'google' | 'map'>('city')
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
  const solar = getSolarPosition(shadowDate || todayInSeoul(), shadowMinutes, SEOUL_REFERENCE.lat, SEOUL_REFERENCE.lng)
  useLayoutEffect(() => {
    setSelection(null)
    setHover(null)
  }, [route.id])
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
    <FocusMap points={points} selectedStop={selectedStop} />
    <Polyline positions={points} pathOptions={{ color: '#08765b', weight: 4, dashArray: '8 9' }} />
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
          <MapLibreRoute3D viewMode="city" route={route} locale={locale} selectedStop={selectedStop} onSelectStop={selectStop} onHoverStop={hoverStop} shadowAzimuth={solar.shadowAzimuth} sunElevation={solar.elevation} fallback={map} />
        </Suspense>}
        {view === 'google' && hasGoogleMapsKey && <GoogleRoute3D route={route} locale={locale} selectedStop={selectedStop} onSelectStop={selectStop} onHoverStop={hoverStop} fallback={map} />}
        {view === 'map' && <Suspense fallback={<div className="tour-maplibre-3d tour-map-starting">{map}</div>}>
          <MapLibreRoute3D viewMode="map" route={route} locale={locale} selectedStop={selectedStop} onSelectStop={selectStop} onHoverStop={hoverStop} shadowAzimuth={solar.shadowAzimuth} sunElevation={solar.elevation} fallback={map} />
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
      <p className="tour-map-note">{text('Lines connect stops only; they are not cycling directions. Check local cycling paths before riding.', '연결선은 경유지 순서를 보여주며 실제 자전거 길안내가 아닙니다. 출발 전에 자전거도로를 확인하세요.')}</p>
    </section>
    <aside className="tour-itinerary" aria-label={text('Route stops', '코스 경유지')}>
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

import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { CircleMarker, MapContainer, Polygon, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet'
import { latLngBounds, type LatLngExpression } from 'leaflet'
import { getTouristStation, type TouristRoute } from '../data/touristRoutes'
import { GoogleRoute3D } from './GoogleRoute3D'
import { hasGoogleMapsKey } from '../services/googleMaps3d'
import { downloadEarthRoute, googleEarthUrl } from '../utils/googleEarth'
import { findSceneryPhoto, type SceneryPhoto } from '../services/sceneryPhotos'
import { getSolarPosition, todayInSeoul } from '../utils/solarPosition'
import { getShadowPolygon } from '../utils/solarShadow'

const MapLibreRoute3D = lazy(() => import('./MapLibreRoute3D').then(module => ({ default: module.MapLibreRoute3D })))

function FocusMap({ points, selectedStop }: { points: LatLngExpression[]; selectedStop: number | null }) {
  const map = useMap()
  useEffect(() => {
    if (selectedStop === null) map.fitBounds(latLngBounds(points), { padding: [45, 45], maxZoom: 14, animate: false })
    else map.setView(points[selectedStop], 15, { animate: false })
  }, [map, points, selectedStop])
  return null
}

export function TourRouteExplorer({ route, locale, shadowDate, shadowMinutes, onShadowDateChange, onShadowMinutesChange }: {
  route: TouristRoute
  locale: 'en' | 'ko'
  shadowDate: string
  shadowMinutes: number
  onShadowDateChange: (value: string) => void
  onShadowMinutesChange: (value: number) => void
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
  const shadowStopIndex = selectedStop ?? 0
  const shadowStation = getTouristStation(route.stops[shadowStopIndex].stationId)
  const solar = getSolarPosition(shadowDate || todayInSeoul(), shadowMinutes, shadowStation.lat, shadowStation.lng)
  const shadowPolygon = useMemo(() => getShadowPolygon(shadowStation.lat, shadowStation.lng, solar.elevation, solar.shadowAzimuth),
    [shadowStation.lat, shadowStation.lng, solar.elevation, solar.shadowAzimuth])
  const shadowLength = solar.elevation > 0 ? Math.min(180, 12 / Math.tan(solar.elevation * Math.PI / 180)) : null
  const time = `${String(Math.floor(shadowMinutes / 60)).padStart(2, '0')}:${String(shadowMinutes % 60).padStart(2, '0')}`
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
    {shadowPolygon && <Polygon positions={shadowPolygon.map(([lng, lat]) => [lat, lng] as LatLngExpression)}
      pathOptions={{ color: '#d0bd83', weight: 1, opacity: .82, fillColor: '#28342e', fillOpacity: .45 }} />}
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
          <MapLibreRoute3D route={route} locale={locale} selectedStop={selectedStop} onSelectStop={selectStop} onHoverStop={hoverStop} shadowPolygon={shadowPolygon} fallback={map} />
        </Suspense>}
        {view === 'google' && hasGoogleMapsKey && <GoogleRoute3D route={route} locale={locale} selectedStop={selectedStop} onSelectStop={selectStop} onHoverStop={hoverStop} shadowPolygon={shadowPolygon} fallback={map} />}
        {view === 'map' && map}
        <aside className="tour-map-shadow-control" aria-label={text('Sun and shadow on the map', '지도 위 태양과 그림자 설정')}>
          <div className="tour-map-shadow-heading">
            <span className="tour-shadow-sun-mark" aria-hidden="true">☼</span>
            <div><span className="tour-scenery-kicker">{text('SHADOW ON MAP · 12 M OBJECT', '지도 위 그림자 · 높이 12m 기준')}</span>
              <strong>{solar.elevation > 0
                ? text(`${Math.round(solar.elevation)}° sun · ${Math.round(solar.shadowAzimuth)}° shadow direction`, `태양 고도 ${Math.round(solar.elevation)}° · 그림자 방향 ${Math.round(solar.shadowAzimuth)}°`)
                : text('After sunset · no ground shadow', '해 진 뒤 · 지표면 그림자 없음')}</strong></div>
          </div>
          <div className="tour-map-shadow-fields">
            <label>{text('Date', '날짜')}<input type="date" value={shadowDate} onChange={event => onShadowDateChange(event.target.value)} /></label>
            <label><span>{text('Seoul time', '서울 시각')} <b>{time} KST</b></span><input type="range" min="360" max="1200" step="30" value={shadowMinutes}
              aria-label={text('Time in Seoul', '서울 시각')} onChange={event => onShadowMinutesChange(Number(event.target.value))} /></label>
          </div>
          <p>{shadowLength !== null
            ? text(`Approx. ${shadowLength.toFixed(0)} m projection. Actual building and tree shade is not modeled.`, `예상 길이 약 ${shadowLength.toFixed(0)}m · 실제 건물·나무 형상은 반영하지 않습니다.`)
            : text('A ground shadow appears during daylight.', '낮 시간에 지표면 그림자를 표시합니다.')}</p>
        </aside>
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

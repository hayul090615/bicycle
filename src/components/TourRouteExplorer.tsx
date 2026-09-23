import { useEffect, useMemo, useRef, useState } from 'react'
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet'
import { latLngBounds, type LatLngExpression } from 'leaflet'
import { getTouristStation, type TouristRoute } from '../data/touristRoutes'
import { GoogleRoute3D } from './GoogleRoute3D'
import { hasGoogleMapsKey } from '../services/googleMaps3d'
import { downloadEarthRoute, googleEarthUrl } from '../utils/googleEarth'

function FocusMap({ points, selectedStop }: { points: LatLngExpression[]; selectedStop: number | null }) {
  const map = useMap()
  useEffect(() => {
    if (selectedStop === null) map.fitBounds(latLngBounds(points), { padding: [45, 45], maxZoom: 14, animate: false })
    else map.setView(points[selectedStop], 15, { animate: false })
  }, [map, points, selectedStop])
  return null
}

export function TourRouteExplorer({ route, locale }: { route: TouristRoute; locale: 'en' | 'ko' }) {
  const [selectedStop, setSelectedStop] = useState<number | null>(null)
  const [view, setView] = useState<'earth' | 'map'>('earth')
  const preview = useRef<HTMLElement>(null)
  const text = (en: string, ko: string) => locale === 'en' ? en : ko
  const points = useMemo<LatLngExpression[]>(() => route.stops.map(stop => {
    const station = getTouristStation(stop.stationId)
    return [station.lat, station.lng]
  }), [route])
  const map = <MapContainer className="tour-explorer-map" center={points[0]} zoom={13} scrollWheelZoom={false}>
    <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' />
    <FocusMap points={points} selectedStop={selectedStop} />
    <Polyline positions={points} pathOptions={{ color: '#08765b', weight: 4, dashArray: '8 9' }} />
    {route.stops.map((stop, index) => <CircleMarker key={stop.stationId} center={points[index]} radius={selectedStop === index ? 13 : 9}
      eventHandlers={{ click: () => setSelectedStop(index) }} pathOptions={{ color: '#fff', weight: 3, fillColor: selectedStop === index ? '#d99628' : '#08765b', fillOpacity: 1 }}>
      <Tooltip direction="top" permanent>{index + 1}. {text(stop.place, stop.placeKo)}</Tooltip>
    </CircleMarker>)}
  </MapContainer>

  return <div className="tour-explorer-grid">
    <section className="tour-earth-preview" ref={preview} aria-label={text('Explore this route', '코스 지도 살펴보기')}>
      <div className="tour-ride-toolbar">
        <div><span className="tour-card-kicker">{text('EXPLORE YOUR STOPS', '경유지를 눌러 둘러보세요')}</span>
          <strong aria-live="polite">{selectedStop === null ? text('Entire route', '전체 코스') : text(route.stops[selectedStop].place, route.stops[selectedStop].placeKo)}</strong></div>
        <div className="tour-view-switch" role="group" aria-label={text('Map view', '지도 보기')}>
          <button type="button" aria-pressed={view === 'earth'} onClick={() => setView('earth')}>Google 3D</button>
          <button type="button" aria-pressed={view === 'map'} onClick={() => setView('map')}>{text('2D map', '2D 지도')}</button>
        </div>
      </div>
      {view === 'earth' && !hasGoogleMapsKey && <p className="tour-earth-notice" role="status">{text('In-page 3D is not connected yet. This is the route map. Open Google Earth below to explore the selected stop.', '사이트 내 3D 연결 전이라 코스 지도를 표시합니다. 아래 Google Earth 버튼으로 선택한 경유지를 둘러보세요.')}</p>}
      {view === 'earth' && hasGoogleMapsKey
        ? <GoogleRoute3D route={route} locale={locale} selectedStop={selectedStop} onSelectStop={setSelectedStop} fallback={map} />
        : map}
      <div className="tour-earth-actions">
        <a className="button button--primary" href={googleEarthUrl(route, selectedStop ?? 0)} target="_blank" rel="noopener noreferrer">{text('Open in Google Earth ↗', 'Google Earth에서 보기 ↗')}</a>
        <button type="button" className="button button--ghost" onClick={() => downloadEarthRoute(route, locale)}>{text('Download route for Earth', 'Earth용 코스 받기')}</button>
        <button type="button" className="tour-show-all" onClick={() => setSelectedStop(null)}>{text('Show all stops', '전체 경유지 보기')}</button>
      </div>
      <p className="tour-map-note">{text('Google Earth opens in a new tab at the selected stop. Import the downloaded KML to see all stops. 3D building coverage varies by location.', 'Google Earth는 선택한 경유지 위치에서 새 탭으로 열립니다. 내려받은 KML을 가져오면 전체 경유지를 볼 수 있습니다. 3D 건물은 지역별 제공 범위에 따라 다릅니다.')}</p>
      <p className="tour-map-note">{text('Lines connect stops only; they are not cycling directions. Check local cycling paths before riding.', '연결선은 경유지 순서를 보여주며 실제 자전거 길안내가 아닙니다. 출발 전에 자전거도로를 확인하세요.')}</p>
    </section>
    <aside className="tour-itinerary" aria-label={text('Route stops', '코스 경유지')}>
      <div className="tour-itinerary-heading"><h3>{text('Your stops', '이 순서로 둘러보세요')}</h3><span>{route.stops.length}{text(' stops', '곳')}</span></div>
      <ol className="tour-connected-stops">
        {route.stops.map((stop, index) => {
          const station = getTouristStation(stop.stationId)
          return <li key={stop.stationId}>
            <button type="button" aria-pressed={selectedStop === index} onClick={() => {
              setSelectedStop(index)
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

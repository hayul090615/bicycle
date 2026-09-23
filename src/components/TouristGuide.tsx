import { useEffect, useMemo, useState } from 'react'
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet'
import { latLngBounds, type LatLngExpression } from 'leaflet'
import { getTouristStation, touristRoutes, type TouristRoute } from '../data/touristRoutes'
import { getSolarPosition, todayInSeoul } from '../utils/solarPosition'
import { BIKE_IMAGE_PATH } from './BikeMarker'

function FitTourMap({ points }: { points: LatLngExpression[] }) {
  const map = useMap()
  useEffect(() => { map.fitBounds(latLngBounds(points), { padding: [48, 48], maxZoom: 14 }) }, [map, points])
  return null
}

function TourMap({ route }: { route: TouristRoute }) {
  const points = useMemo(() => route.stops.map(({ stationId }) => {
    const station = getTouristStation(stationId)
    return [station.lat, station.lng] as LatLngExpression
  }), [route])

  return <div className="tour-map-wrap">
    <MapContainer className="tour-map" center={points[0]} zoom={13} scrollWheelZoom={false}>
      <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' />
      <FitTourMap points={points} />
      <Polyline positions={points} pathOptions={{ color: '#08765b', weight: 5, opacity: .85, dashArray: '9 8' }} />
      {route.stops.map((stop, index) => {
        const station = getTouristStation(stop.stationId)
        return <CircleMarker key={stop.stationId} center={[station.lat, station.lng]} radius={10}
          pathOptions={{ color: '#fff', weight: 3, fillColor: index === 0 ? '#f5ab35' : '#00a875', fillOpacity: 1 }}>
          <Tooltip direction="top" offset={[0, -8]}>{index + 1}. {stop.place}</Tooltip>
        </CircleMarker>
      })}
    </MapContainer>
    <p className="tour-map-note">Dotted lines connect stops only. Check a cycling map, local signs and road conditions before riding.</p>
  </div>
}

function ShadowPreview({ route }: { route: TouristRoute }) {
  const [date, setDate] = useState(todayInSeoul)
  const [minutes, setMinutes] = useState(15 * 60)
  const firstStation = getTouristStation(route.stops[0].stationId)
  const solar = getSolarPosition(date || todayInSeoul(), minutes, firstStation.lat, firstStation.lng)
  const daylight = solar.elevation > 0
  const shadowRadius = daylight ? Math.min(62, 18 + Math.min(solar.shadowLength ?? 0, 8) * 6) : 0
  const point = (bearing: number, distance: number) => ({
    x: 90 + Math.sin(bearing * Math.PI / 180) * distance,
    y: 90 - Math.cos(bearing * Math.PI / 180) * distance,
  })
  const sun = point(solar.azimuth, 61)
  const shadow = point(solar.shadowAzimuth, shadowRadius)
  const time = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

  return <section className="tour-info-card tour-shadow-card" aria-labelledby="tour-shadow-title">
    <div className="tour-card-kicker">PLAN FOR DAYLIGHT</div>
    <h2 id="tour-shadow-title">Sun & shadow preview</h2>
    <p>Choose a date and local time in Seoul. See where a vertical object would cast a shadow.</p>
    <div className="tour-shadow-controls">
      <label>Date in Seoul<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
      <label>Local time <strong>{time} KST</strong><input type="range" min="360" max="1200" step="30" value={minutes}
        onChange={(event) => setMinutes(Number(event.target.value))} /></label>
    </div>
    <div className="tour-shadow-result">
      <svg viewBox="0 0 180 180" className="tour-sun-dial" role="img" aria-label={daylight
        ? `Sun elevation ${Math.round(solar.elevation)} degrees; shadow points ${Math.round(solar.shadowAzimuth)} degrees from north`
        : 'Sun below the horizon'}>
        <circle cx="90" cy="90" r="72" className="tour-dial-base" />
        <text x="90" y="12" textAnchor="middle">N</text><text x="168" y="94" textAnchor="middle">E</text>
        <text x="90" y="176" textAnchor="middle">S</text><text x="12" y="94" textAnchor="middle">W</text>
        {daylight && <>
          <line x1="90" y1="90" x2={shadow.x} y2={shadow.y} className="tour-shadow-line" />
          <circle cx={sun.x} cy={sun.y} r="12" className="tour-sun-dot" />
        </>}
        <circle cx="90" cy="90" r="7" className="tour-dial-center" />
      </svg>
      <div className="tour-sun-numbers" aria-live="polite">
        <strong>{daylight ? `${Math.round(solar.elevation)}° sun elevation` : 'After dark'}</strong>
        <span>{daylight ? `${(solar.shadowLength ?? 0) > 10 ? 'Over 10' : (solar.shadowLength ?? 0).toFixed(1)} m shadow from a 1 m post` : 'No direct sunlight or cast shadow'}</span>
        <small>{daylight ? `Shadow points ${Math.round(solar.shadowAzimuth)}° clockwise from north.` : 'Use lights if riding after dark.'}</small>
      </div>
    </div>
    <p className="tour-fine-print">This is a sun-position estimate, not a street-shade map. Buildings, trees and weather are not included. Calculation: <a href="https://gml.noaa.gov/grad/solcalc/solareqns.PDF" target="_blank" rel="noopener noreferrer">NOAA solar equations</a>.</p>
  </section>
}

export function TouristGuide({ onBack }: { onBack: () => void }) {
  const [routeId, setRouteId] = useState(touristRoutes[0].id)
  const route = touristRoutes.find((candidate) => candidate.id === routeId) ?? touristRoutes[0]

  useEffect(() => {
    document.documentElement.lang = 'en'
    return () => { document.documentElement.lang = 'ko' }
  }, [])

  return <main className="tour-screen">
    <header className="tour-topbar">
      <div className="tour-brand"><img src={BIKE_IMAGE_PATH} alt="" /><span>SEOUL BIKE JOURNEYS<small>Explore Seoul with Ttareungi</small></span></div>
      <button type="button" className="tour-back" onClick={onBack}>← Korean typing game</button>
    </header>
    <div className="tour-content">
      <section className="tour-hero">
        <div><span className="tour-eyebrow">WELCOME TO SEOUL</span><h1>See the city<br /><em>one bike stop at a time.</em></h1>
          <p>English sightseeing ideas paired with real Ttareungi stations. Pick a route, preview the sun, then check the official bike app before you go.</p></div>
        <div className="tour-hero-badge"><span>3</span><small>CURATED<br />CITY RIDES</small></div>
      </section>

      <div className="tour-route-heading"><div><span className="tour-card-kicker">CHOOSE A JOURNEY</span><h2>Tourist bike routes</h2></div>
        <a href="https://english.seoul.go.kr/service/movement/seoul-public-bike/3-rent-return-bike/" target="_blank" rel="noopener noreferrer">How to rent Ttareungi ↗</a></div>
      <div className="tour-route-tabs" role="group" aria-label="Tourist bike routes">
        {touristRoutes.map((candidate, index) => <button key={candidate.id} type="button" aria-pressed={candidate.id === route.id}
          className={`tour-route-tab ${candidate.id === route.id ? 'is-selected' : ''}`} onClick={() => setRouteId(candidate.id)}>
          <span>0{index + 1} / {candidate.area}</span><strong>{candidate.title}</strong><small>{candidate.suggestedTime}</small>
        </button>)}
      </div>

      <div className="tour-main-grid">
        <section className="tour-route-panel" aria-label={`${route.title} itinerary`}>
          <div className="tour-panel-heading"><div><span className="tour-card-kicker">YOUR ROUTE</span><h2>{route.title}</h2><p>{route.summary}</p></div>
            <span className="tour-duration">◷ {route.suggestedTime}</span></div>
          <TourMap route={route} />
          <ol className="tour-stops">
            {route.stops.map((stop, index) => {
              const station = getTouristStation(stop.stationId)
              return <li key={stop.stationId}>
                <span className="tour-stop-number">{index + 1}</span>
                <div><strong>{stop.place}</strong><p>{stop.detail}</p><small>Ttareungi #{station.id} · {station.name}</small></div>
              </li>
            })}
          </ol>
          <div className="tour-route-source">Inspired by <a href={route.source} target="_blank" rel="noopener noreferrer">Visit Seoul's official travel guide ↗</a>. Station locations: Seoul Open Data, June 2026 snapshot. Check live availability in the official app.</div>
        </section>
        <div className="tour-side-column">
          <ShadowPreview route={route} />
          <section className="tour-info-card tour-safety-card" aria-labelledby="tour-safety-title">
            <div className="tour-card-kicker">RIDE INFORMED</div><h2 id="tour-safety-title">CCTV & riding rules</h2>
            <p>Use Seoul's official traffic map to view available road cameras. Camera feeds and conditions are managed by the city.</p>
            <a className="tour-resource-link" href="https://topis.seoul.go.kr/map/openCctvMap.do" target="_blank" rel="noopener noreferrer">Open live TOPIS CCTV map <span>↗</span></a>
            <a className="tour-resource-link" href="https://news.seoul.go.kr/traffic/archives/35252" target="_blank" rel="noopener noreferrer">Official bike-lane camera locations <span>↗</span></a>
            <p className="tour-fine-print">The published bike-lane enforcement cameras monitor vehicles entering reserved lanes; they are not a live cyclist enforcement feed. Follow signs, yield to pedestrians, and walk your bike where riding is restricted.</p>
            <a className="tour-resource-link" href="https://english.seoul.go.kr/wp-content/uploads/2020/01/guide-for-safe-travel-in-seoul-e.pdf" target="_blank" rel="noopener noreferrer">Seoul's English bike safety guide <span>↗</span></a>
          </section>
        </div>
      </div>
      <footer className="tour-footer">Before every ride, confirm station availability and return rules in the <a href="https://www.bikeseoul.com/" target="_blank" rel="noopener noreferrer">official Ttareungi service ↗</a>.</footer>
    </div>
  </main>
}

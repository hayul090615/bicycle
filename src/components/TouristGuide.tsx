import { useEffect, useMemo, useState } from 'react'
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet'
import { latLngBounds, type LatLngExpression } from 'leaflet'
import { getTouristStation, touristRoutes, type TourCategory, type TouristRoute } from '../data/touristRoutes'
import { getSolarPosition, todayInSeoul } from '../utils/solarPosition'
import { BIKE_IMAGE_PATH } from './BikeMarker'

function FitTourMap({ points }: { points: LatLngExpression[] }) {
  const map = useMap()
  useEffect(() => { map.fitBounds(latLngBounds(points), { padding: [48, 48], maxZoom: 14 }) }, [map, points])
  return null
}

type Locale = 'en' | 'ko'

const textFor = <T,>(locale: Locale, english: T, korean: T): T => locale === 'en' ? english : korean

function TourMap({ route, locale }: { route: TouristRoute; locale: Locale }) {
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
          <Tooltip direction="top" offset={[0, -8]}>{index + 1}. {textFor(locale, stop.place, stop.placeKo)}</Tooltip>
        </CircleMarker>
      })}
    </MapContainer>
    <p className="tour-map-note">{textFor(locale,
      'Dotted lines connect stops only. Check a cycling map, local signs and road conditions before riding.',
      '점선은 경유지를 연결한 참고 표시입니다. 출발 전 자전거 지도와 현장 표지, 도로 상황을 확인하세요.')}</p>
  </div>
}

function RideThrough3D({ route, locale }: { route: TouristRoute; locale: Locale }) {
  const [stopIndex, setStopIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [view, setView] = useState<'ride' | 'map'>('ride')
  const stop = route.stops[stopIndex]
  const station = getTouristStation(stop.stationId)

  useEffect(() => {
    setStopIndex(0)
    setPlaying(false)
  }, [route.id])
  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => {
      setStopIndex((index) => {
        if (index >= route.stops.length - 1) {
          setPlaying(false)
          return 0
        }
        return index + 1
      })
    }, 2800)
    return () => window.clearInterval(timer)
  }, [playing, route.stops.length])

  return <section className="tour-ride-preview" aria-label={textFor(locale, '3D ride-through preview', '3D 주행 미리보기')}>
    <div className="tour-ride-toolbar">
      <div><span className="tour-card-kicker">{textFor(locale, 'STREET-LEVEL VIEW', '거리 시점')}</span>
        <strong>{textFor(locale, 'Ride through this route', '자전거를 타고 코스를 달려보세요')}</strong></div>
      <div className="tour-view-switch" role="group" aria-label={textFor(locale, 'View mode', '보기 방식')}>
        <button type="button" aria-pressed={view === 'ride'} onClick={() => setView('ride')}>3D</button>
        <button type="button" aria-pressed={view === 'map'} onClick={() => setView('map')}>{textFor(locale, 'Map', '지도')}</button>
      </div>
    </div>
    {view === 'ride' ? <>
      <div className={`tour-ride-scene ${playing ? 'is-moving' : ''}`}>
        <div className="tour-ride-sky"><span className="tour-ride-sun" /><span className="tour-ride-cloud cloud-one" /><span className="tour-ride-cloud cloud-two" /></div>
        <div className="tour-ride-city" aria-hidden="true">
          <i className="ride-building building-one" /><i className="ride-building building-two" /><i className="ride-building building-three" />
          <i className="ride-tree tree-one">🌳</i><i className="ride-tree tree-two">🌳</i>
        </div>
        <div className="tour-ride-landmark"><span>📍</span><strong>{textFor(locale, stop.place, stop.placeKo)}</strong></div>
        <div className="tour-ride-path"><span className="ride-path-center" /><i className="ride-path-rail rail-left" /><i className="ride-path-rail rail-right" /></div>
        <div className="tour-ride-rider" aria-hidden="true"><span>🚴</span></div>
        <div className="tour-ride-hud"><span>3D RIDE</span><span>{stopIndex + 1} / {route.stops.length}</span></div>
      </div>
      <div className="tour-ride-controls">
        <button type="button" className="tour-ride-play" onClick={() => setPlaying(!playing)}>{playing ? 'Ⅱ' : '▶'} {textFor(locale, playing ? 'Pause ride' : 'Start ride', playing ? '일시정지' : '주행 시작')}</button>
        <input aria-label={textFor(locale, 'Ride progress', '주행 위치')} type="range" min="0" max={route.stops.length - 1} value={stopIndex} onChange={(event) => { setStopIndex(Number(event.target.value)); setPlaying(false) }} />
        <span>{textFor(locale, `${Math.round((stopIndex / Math.max(1, route.stops.length - 1)) * 100)}%`, `${Math.round((stopIndex / Math.max(1, route.stops.length - 1)) * 100)}%`)}</span>
      </div>
      <p className="tour-map-note">{textFor(locale, `Illustrated 3D-style preview at ${station.lat.toFixed(4)}, ${station.lng.toFixed(4)}. It is not recorded street footage or turn-by-turn navigation.`, `${station.lat.toFixed(4)}, ${station.lng.toFixed(4)} 위치를 바탕으로 만든 3D 스타일 일러스트입니다. 실제 촬영 영상이나 길안내는 아닙니다.`)}</p>
    </> : <TourMap route={route} locale={locale} />}
  </section>
}

function ShadowPreview({ route, locale }: { route: TouristRoute; locale: Locale }) {
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
    <div className="tour-card-kicker">{textFor(locale, 'PLAN FOR DAYLIGHT', '햇빛·그늘 미리보기')}</div>
    <h2 id="tour-shadow-title">{textFor(locale, 'Sun & shadow preview', '시간별 태양과 그림자')}</h2>
    <p>{textFor(locale, 'Choose a date and local time in Seoul. See where a vertical object would cast a shadow.', '서울 날짜와 시간을 선택하면 태양 방향과 수직 물체의 그림자를 보여줍니다.')}</p>
    <div className="tour-shadow-controls">
      <label>{textFor(locale, 'Date in Seoul', '서울 날짜')}<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
      <label>{textFor(locale, 'Local time', '현지 시각')} <strong>{time} KST</strong><input type="range" min="360" max="1200" step="30" value={minutes}
        onChange={(event) => setMinutes(Number(event.target.value))} /></label>
    </div>
    <div className="tour-shadow-result">
      <svg viewBox="0 0 180 180" className="tour-sun-dial" role="img" aria-label={daylight
        ? textFor(locale, `Sun elevation ${Math.round(solar.elevation)} degrees; shadow points ${Math.round(solar.shadowAzimuth)} degrees from north`, `태양 고도 ${Math.round(solar.elevation)}도, 그림자는 북쪽 기준 ${Math.round(solar.shadowAzimuth)}도 방향`)
        : textFor(locale, 'Sun below the horizon', '해가 지평선 아래에 있습니다')}>
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
        <strong>{daylight ? textFor(locale, `${Math.round(solar.elevation)}° sun elevation`, `태양 고도 ${Math.round(solar.elevation)}°`) : textFor(locale, 'After dark', '해 진 뒤')}</strong>
        <span>{daylight
          ? textFor(locale, `${(solar.shadowLength ?? 0) > 10 ? 'Over 10' : (solar.shadowLength ?? 0).toFixed(1)} m shadow from a 1 m post`, `높이 1m 물체의 그림자 ${(solar.shadowLength ?? 0) > 10 ? '10m 초과' : `${(solar.shadowLength ?? 0).toFixed(1)}m`}`)
          : textFor(locale, 'No direct sunlight or cast shadow', '직사광과 그림자가 없습니다')}</span>
        <small>{daylight
          ? textFor(locale, `Shadow points ${Math.round(solar.shadowAzimuth)}° clockwise from north.`, `그림자 방향: 북쪽에서 시계 방향 ${Math.round(solar.shadowAzimuth)}°`)
          : textFor(locale, 'Use lights if riding after dark.', '야간 주행 시 자전거 조명을 켜세요.')}</small>
      </div>
    </div>
    <p className="tour-fine-print">{textFor(locale,
      <>This is a sun-position estimate, not a street-shade map. Buildings, trees and weather are not included. Calculation: <a href="https://gml.noaa.gov/grad/solcalc/solareqns.PDF" target="_blank" rel="noopener noreferrer">NOAA solar equations</a>.</>,
      <>태양 위치로 계산한 추정치이며 실제 도로 그늘은 아닙니다. 건물·나무·날씨는 반영하지 않습니다. 계산식: <a href="https://gml.noaa.gov/grad/solcalc/solareqns.PDF" target="_blank" rel="noopener noreferrer">NOAA 태양 계산식</a>.</>)}</p>
  </section>
}

export function TouristGuide({ onBack }: { onBack: () => void }) {
  const [locale, setLocale] = useState<Locale>(() => new URLSearchParams(window.location.search).get('lang') === 'ko' ? 'ko' : 'en')
  const [category, setCategory] = useState<TourCategory>('sightseeing')
  const [routeId, setRouteId] = useState(touristRoutes.find((item) => item.category === 'sightseeing')!.id)
  const categoryRoutes = touristRoutes.filter((candidate) => candidate.category === category)
  const route = categoryRoutes.find((candidate) => candidate.id === routeId) ?? categoryRoutes[0]
  const categoryLabels: Record<TourCategory, [string, string]> = {
    sightseeing: ['Sightseeing', '관광 코스'],
    fitness: ['Workout rides', '운동 코스'],
    night: ['Night views', '야경 코스'],
    seasonal: ['By season', '계절별 코스'],
  }

  useEffect(() => {
    document.documentElement.lang = locale
    document.title = locale === 'en' ? 'Seoul Bike Journeys | Ttareungi' : '따릉이 서울 여행 코스'
    return () => { document.documentElement.lang = 'ko'; document.title = '서울 타자 라이딩' }
  }, [locale])

  const toggleLanguage = () => {
    const nextLocale = locale === 'en' ? 'ko' : 'en'
    const url = new URL(window.location.href)
    url.searchParams.set('lang', nextLocale)
    window.history.replaceState(null, '', url)
    setLocale(nextLocale)
  }

  return <main className="tour-screen">
    <header className="tour-topbar">
      <div className="tour-brand"><img src={BIKE_IMAGE_PATH} alt="" /><span>{textFor(locale, 'SEOUL BIKE JOURNEYS', '따릉이 서울 여행')}<small>{textFor(locale, 'Explore Seoul with Ttareungi', '따릉이로 서울을 둘러보세요')}</small></span></div>
      <div className="tour-header-actions">
        <button type="button" className="tour-language-button" onClick={toggleLanguage}>{textFor(locale, '한국어', 'English')}</button>
        <button type="button" className="tour-back" onClick={onBack}>{textFor(locale, 'Typing game', '타자 게임')} ↗</button>
      </div>
    </header>
    <div className="tour-content">
      <section className="tour-hero">
        <div><span className="tour-eyebrow">{textFor(locale, 'WELCOME TO SEOUL', '서울을 달려보세요')}</span>
          <h1>{textFor(locale, <>See the city<br /><em>one bike stop at a time.</em></>, <>따릉이 타고<br /><em>서울 구석구석</em></>)}</h1>
          <p>{textFor(locale,
            'Tourist, workout, night-view and seasonal rides paired with real Ttareungi stations. Choose a route, preview the sun, and check bike availability before you go.',
            '실제 따릉이 대여소를 잇는 관광·운동·야경·계절 코스를 골라보세요. 시간별 햇빛을 확인하고 출발 전 대여 가능 여부를 확인하세요.')}</p></div>
        <div className="tour-hero-badge"><span>{touristRoutes.length}</span><small>{textFor(locale, <>ROUTE<br />IDEAS</>, <>여행<br />코스</>)}</small></div>
      </section>

      <div className="tour-route-heading"><div><span className="tour-card-kicker">{textFor(locale, 'CHOOSE A JOURNEY', '원하는 코스를 선택하세요')}</span>
        <h2>{textFor(locale, 'Seoul bike routes', '서울 따릉이 코스')}</h2></div>
        <a href="https://english.seoul.go.kr/service/movement/seoul-public-bike/3-rent-return-bike/" target="_blank" rel="noopener noreferrer">{textFor(locale, 'How to rent Ttareungi ↗', '따릉이 대여 방법 ↗')}</a></div>
      <div className="tour-category-tabs" role="group" aria-label={textFor(locale, 'Route categories', '코스 종류')}>
        {(Object.keys(categoryLabels) as TourCategory[]).map((key) => <button key={key} type="button" aria-pressed={category === key}
          className={`tour-category-tab ${category === key ? 'is-selected' : ''}`} onClick={() => {
            setCategory(key)
            setRouteId(touristRoutes.find((candidate) => candidate.category === key)!.id)
          }}>{textFor(locale, categoryLabels[key][0], categoryLabels[key][1])}</button>)}
      </div>
      <div className="tour-route-tabs" role="group" aria-label={textFor(locale, 'Choose a route', '코스 선택')}>
        {categoryRoutes.map((candidate, index) => <button key={candidate.id} type="button" aria-pressed={candidate.id === route.id}
          className={`tour-route-tab ${candidate.id === route.id ? 'is-selected' : ''}`} onClick={() => setRouteId(candidate.id)}>
          <span>{textFor(locale, candidate.area, candidate.areaKo)}</span><strong>{textFor(locale, candidate.title, candidate.titleKo)}</strong>
          <small>{textFor(locale, candidate.distance ?? candidate.suggestedTime, candidate.distance ?? candidate.suggestedTimeKo)}</small>
        </button>)}
      </div>

      <div className="tour-main-grid">
        <section className="tour-route-panel" aria-label={textFor(locale, `${route.title} itinerary`, `${route.titleKo} 일정`)}>
          <div className="tour-panel-heading"><div><span className="tour-card-kicker">{textFor(locale, 'YOUR ROUTE', '선택한 코스')}</span>
            <h2>{textFor(locale, route.title, route.titleKo)}</h2><p>{textFor(locale, route.summary, route.summaryKo)}</p></div>
            <span className="tour-duration">◷ {textFor(locale, route.suggestedTime, route.suggestedTimeKo)}</span></div>
          <RideThrough3D route={route} locale={locale} />
          <ol className="tour-stops">
            {route.stops.map((stop, index) => {
              const station = getTouristStation(stop.stationId)
              return <li key={stop.stationId}>
                <span className="tour-stop-number">{index + 1}</span>
                <div><strong>{textFor(locale, stop.place, stop.placeKo)}</strong><p>{textFor(locale, stop.detail, stop.detailKo)}</p>
                  <small>{textFor(locale, 'Ttareungi station', '따릉이 대여소')} #{station.id} · {station.name}</small></div>
              </li>
            })}
          </ol>
          <div className="tour-route-source">{textFor(locale, <>Route reference: </>, <>코스 참고: </>)}
            <a href={route.source} target="_blank" rel="noopener noreferrer">{textFor(locale, "Visit Seoul's official travel guide ↗", '서울 공식 관광 안내 ↗')}</a>.
            {textFor(locale, ' Station locations: Seoul Open Data, June 2026 snapshot. Check live availability in the official app.', ' 대여소 위치: 서울 열린데이터광장 2026년 6월 자료. 실시간 대여 가능 여부는 공식 앱에서 확인하세요.')}</div>
        </section>
        <div className="tour-side-column">
          <ShadowPreview route={route} locale={locale} />
          <section className="tour-info-card tour-safety-card" aria-labelledby="tour-safety-title">
            <div className="tour-card-kicker">{textFor(locale, 'RIDE INFORMED', '안전하게 달리기')}</div>
            <h2 id="tour-safety-title">{textFor(locale, 'CCTV & riding rules', 'CCTV·자전거 안전 정보')}</h2>
            <p>{textFor(locale, "Open Seoul's official traffic map for available road-camera feeds. Camera feeds and conditions are managed by the city.", '서울시 공식 교통정보 지도에서 제공 중인 도로 CCTV를 확인할 수 있습니다. 영상과 운영 상태는 서울시가 관리합니다.')}</p>
            <a className="tour-resource-link" href="https://topis.seoul.go.kr/map/openCctvMap.do" target="_blank" rel="noopener noreferrer">{textFor(locale, 'Open live TOPIS CCTV map', '서울 TOPIS CCTV 지도')} <span>↗</span></a>
            <a className="tour-resource-link" href="https://news.seoul.go.kr/traffic/archives/35252" target="_blank" rel="noopener noreferrer">{textFor(locale, 'Official bike-lane camera locations', '자전거전용차로 단속 CCTV 위치')} <span>↗</span></a>
            <p className="tour-fine-print">{textFor(locale,
              'Published bike-lane enforcement cameras monitor vehicles entering reserved lanes; they are not a live cyclist enforcement feed. Follow signs, yield to pedestrians, and walk your bike where riding is restricted.',
              '공개된 자전거전용차로 단속 CCTV는 전용차로에 진입한 차량을 단속합니다. 자전거 이용자를 실시간 단속하는 영상은 아닙니다. 표지판을 따르고 보행자에게 양보하며, 주행 제한 구간에서는 자전거를 끌고 가세요.')}</p>
            <a className="tour-resource-link" href="https://english.seoul.go.kr/wp-content/uploads/2020/01/guide-for-safe-travel-in-seoul-e.pdf" target="_blank" rel="noopener noreferrer">{textFor(locale, "Seoul's English bike safety guide", '서울시 자전거 안전 안내')} <span>↗</span></a>
          </section>
        </div>
      </div>
      <footer className="tour-footer">{textFor(locale, 'Before every ride, confirm station availability and return rules in the ', '출발 전에 대여 가능 여부와 반납 규칙을 확인하세요: ')}
        <a href="https://www.bikeseoul.com/" target="_blank" rel="noopener noreferrer">{textFor(locale, 'official Ttareungi service ↗', '따릉이 공식 서비스 ↗')}</a>.</footer>
    </div>
  </main>
}

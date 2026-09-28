import { useEffect, useState } from 'react'
import { getTouristStation, touristRoutes, type TourCategory, type TouristRoute } from '../data/touristRoutes'
import { getSolarPosition, todayInSeoul } from '../utils/solarPosition'
import { BIKE_IMAGE_PATH } from './BikeMarker'
import { PublicCctvMap } from './PublicCctvMap'
import { SeoulRideIllustration } from './SeoulRideIllustration'
import { TourRouteExplorer } from './TourRouteExplorer'

type Locale = 'en' | 'ko'
const textFor = <T,>(locale: Locale, english: T, korean: T): T => locale === 'en' ? english : korean

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
  const initialRoute = touristRoutes.find(item => item.id === new URLSearchParams(window.location.search).get('route')) ?? touristRoutes[0]
  const [category, setCategory] = useState<TourCategory>(initialRoute.category)
  const [routeId, setRouteId] = useState(initialRoute.id)
  const categoryRoutes = touristRoutes.filter((candidate) => candidate.category === category)
  const route = categoryRoutes.find((candidate) => candidate.id === routeId) ?? categoryRoutes[0]
  const categoryCopy: Record<TourCategory, { label: [string, string]; title: [string, string]; description: [string, string] }> = {
    sightseeing: {
      label: ['Find somewhere new', '새로운 서울'],
      title: ['Find a side of Seoul you haven’t seen.', '익숙한 서울에서, 처음 만나는 장면을.'],
      description: ['Ride between riverside stations, then dock and explore each park or neighborhood on foot.', '강변 대여소 사이를 달리고, 공원과 동네는 자전거를 반납한 뒤 걸어서 둘러보세요.'],
    },
    fitness: {
      label: ['Go for a workout', '운동 코스'],
      title: ['Let the river set your pace.', '한강을 따라, 내 페이스로 더 멀리.'],
      description: ['Choose a shorter or longer riverside ride, set your own pace, and check return stations before setting off.', '짧거나 긴 강변 코스 중 골라 내 페이스로 달려보세요. 출발 전 반납 대여소를 확인하세요.'],
    },
    night: {
      label: ['Ride after dark', '야경 코스'],
      title: ['See the river after the city lights up.', '도시의 불빛이 켜진 뒤, 강변으로.'],
      description: ['Choose a shorter Yeouido ride or a longer riverside stretch. Start before sunset and stay on lit paths.', '여의도 짧은 코스와 긴 강변 코스 중 골라 해 지기 전 출발하고, 조명이 있는 길을 이용하세요.'],
    },
    seasonal: {
      label: ['Follow the seasons', '계절별 코스'],
      title: ['Come back and see what changed.', '계절이 바뀌면, 풍경도 달라지니까.'],
      description: ['Spring flowers, summer shade, autumn reeds, or a short winter ride. Bloom times and path conditions can change.', '봄꽃, 여름 그늘, 가을 갈대, 짧은 겨울 라이딩. 꽃 시기와 길 상태는 날마다 달라질 수 있어요.'],
    },
  }
  useEffect(() => {
    const url = new URL(window.location.href)
    url.searchParams.set('route', route.id)
    window.history.replaceState(null, '', url)
  }, [route.id])

  const chooseRoute = (id: string) => {
    setRouteId(id)
    window.requestAnimationFrame(() => {
      const detail = document.getElementById('tour-detail')
      detail?.focus({ preventScroll: true })
      detail?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
    })
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
        <div className="tour-hero-copy"><span className="tour-eyebrow">{textFor(locale, 'FOR THE SEOUL YOU HAVEN’T MET YET', '아직 만나지 못한 서울을 향해')}</span>
          <h1>{textFor(locale, <>One more turn.<br />A side of Seoul<br /><em>you haven’t seen yet.</em></>, <>한 번도 가보지 않은<br />서울의 다음 장면을<br /><em>따릉이로 만나보세요.</em></>)}</h1>
          <p>{textFor(locale,
            'Chase a longer workout, follow the city lights, or ride with the seasons. Pick a route and see where the next stop leads.',
            '운동하듯 길게, 불빛을 따라 저녁에, 계절이 바뀌는 강변으로. 코스를 고르고 다음 경유지의 풍경을 만나보세요.')}</p>
          <div className="tour-hero-actions"><a className="button button--primary" href="#tour-detail">{textFor(locale, 'Open the 3D city view', '3D 지도 바로 보기')} <span aria-hidden="true">↗</span></a>
            <a className="tour-hero-route-link" href="#tour-routes">{textFor(locale, 'Browse routes ↓', '코스 둘러보기 ↓')}</a>
            <span className="tour-hero-count">{textFor(locale, `${touristRoutes.length} routes · 4 ways to explore`, `${touristRoutes.length}개 코스 · 4가지 테마`)}</span></div>
        </div>
        <div className="tour-hero-art"><SeoulRideIllustration /><span className="tour-scene-label"><i />{textFor(locale, 'Your next view awaits', '다음 풍경을 만나러')}</span></div>
      </section>

      <nav className="tour-plan-nav" aria-label={textFor(locale, 'Plan your ride', '여행 준비 순서')}>
        <a href="#tour-routes"><span>01</span>{textFor(locale, 'Choose a route', '코스 고르기')}</a>
        <a href="#tour-detail"><span>02</span>{textFor(locale, 'Open the 3D map', '3D 지도 보기')}</a>
        <a href="#tour-checks"><span>03</span>{textFor(locale, 'Before you ride', '출발 전 확인')}</a>
      </nav>
      <div className="tour-route-heading" id="tour-routes" tabIndex={-1}><div><span className="tour-card-kicker">{textFor(locale, 'CHOOSE A JOURNEY', '원하는 코스를 선택하세요')}</span>
        <h2>{textFor(locale, 'Seoul bike routes', '서울 따릉이 코스')}</h2></div>
        <a href="https://english.seoul.go.kr/service/movement/seoul-public-bike/3-rent-return-bike/" target="_blank" rel="noopener noreferrer">{textFor(locale, 'How to rent Ttareungi ↗', '따릉이 대여 방법 ↗')}</a></div>
      <div className="tour-category-tabs" role="group" aria-label={textFor(locale, 'Route categories', '코스 종류')}>
        {(Object.keys(categoryCopy) as TourCategory[]).map((key) => <button key={key} type="button" aria-pressed={category === key}
          className={`tour-category-tab ${category === key ? 'is-selected' : ''}`} onClick={() => {
            setCategory(key)
            setRouteId(touristRoutes.find((candidate) => candidate.category === key)!.id)
          }}>{textFor(locale, categoryCopy[key].label[0], categoryCopy[key].label[1])}</button>)}
      </div>
      <section className="tour-category-intro" aria-live="polite" aria-atomic="true">
        <span className="tour-card-kicker">{textFor(locale, 'A DIFFERENT WAY TO SEE THE CITY', '서울을 새롭게 만나는 방법')}</span>
        <h3>{textFor(locale, categoryCopy[category].title[0], categoryCopy[category].title[1])}</h3>
        <p>{textFor(locale, categoryCopy[category].description[0], categoryCopy[category].description[1])}</p>
      </section>
      <div className={`tour-route-tabs tour-route-tabs--${category}`} role="group" aria-label={textFor(locale, 'Choose a route', '코스 선택')}>
        {categoryRoutes.map(candidate => <button key={candidate.id} type="button" aria-pressed={candidate.id === route.id}
          className={`tour-route-tab ${candidate.id === route.id ? 'is-selected' : ''}`} onClick={() => chooseRoute(candidate.id)}>
          <span>{textFor(locale, candidate.area, candidate.areaKo)}</span><strong>{textFor(locale, candidate.title, candidate.titleKo)}</strong>
          <small>{textFor(locale, candidate.distance ?? candidate.suggestedTime, candidate.distance ?? candidate.suggestedTimeKo)}</small>
          <span className="tour-route-discovery">{textFor(locale, candidate.discovery, candidate.discoveryKo)}</span>
          <span className="tour-route-open">{textFor(locale, `${candidate.stops.length} stops · Explore route ↓`, `${candidate.stops.length}개 경유지 · 코스 살펴보기 ↓`)}</span>
        </button>)}
      </div>

      <div className="tour-plan-content">
        <section className="tour-route-panel" id="tour-detail" tabIndex={-1} aria-label={textFor(locale, `${route.title} itinerary`, `${route.titleKo} 일정`)}>
          <div className="tour-panel-heading"><div><span className="tour-card-kicker">{textFor(locale, '02 · YOUR ROUTE', '02 · 선택한 코스')}</span>
            <h2>{textFor(locale, route.title, route.titleKo)}</h2><p>{textFor(locale, route.summary, route.summaryKo)}</p></div>
            <span className="tour-duration">◷ {textFor(locale, route.suggestedTime, route.suggestedTimeKo)}</span></div>
          <TourRouteExplorer key={route.id} route={route} locale={locale} />
          <div className="tour-route-source">{textFor(locale, <>Route reference: </>, <>코스 참고: </>)}
            <a href={route.source} target="_blank" rel="noopener noreferrer">{textFor(locale, "Visit Seoul's official travel guide ↗", '서울 공식 관광 안내 ↗')}</a>.
            {textFor(locale, ' Station locations: Seoul Open Data, June 2026 snapshot. Check live availability in the official app.', ' 대여소 위치: 서울 열린데이터광장 2026년 6월 자료. 실시간 대여 가능 여부는 공식 앱에서 확인하세요.')}</div>
        </section>
        <section className="tour-preflight" id="tour-checks" tabIndex={-1} aria-labelledby="tour-checks-title">
          <div className="tour-route-heading"><div><span className="tour-card-kicker">{textFor(locale, '03 · BEFORE YOU RIDE', '03 · 출발 전 확인')}</span>
            <h2 id="tour-checks-title">{textFor(locale, 'A little planning, a better ride.', '출발 전에 한 번 더 살펴보세요.')}</h2>
            <p className="tour-checks-route" aria-live="polite">{textFor(locale, route.title, route.titleKo)} · {textFor(locale, 'Daylight and cameras near the route start', '코스 출발점 기준 햇빛·주변 CCTV')}</p></div></div>
          <div className="tour-preflight-grid">
          <ShadowPreview route={route} locale={locale} />
          <PublicCctvMap route={route} locale={locale} />
          <section className="tour-info-card tour-safety-card" aria-labelledby="tour-safety-title">
            <div className="tour-card-kicker">{textFor(locale, 'RIDE INFORMED', '안전하게 달리기')}</div>
            <h2 id="tour-safety-title">{textFor(locale, 'Cycling safety', '자전거 안전 정보')}</h2>
            <p>{textFor(locale, 'Ride on marked bike paths, yield to pedestrians, and walk your bike where riding is restricted.', '자전거도로 표지를 따르고 보행자에게 양보하며, 주행 제한 구간에서는 자전거를 끌고 가세요.')}</p>
            <p className="tour-fine-print">{textFor(locale,
              'CCTV markers show public installation records. They do not confirm that a camera covers the bike path.',
              'CCTV 표시는 공개된 설치 위치를 나타냅니다. 자전거도로를 촬영하는지는 확인되지 않습니다.')}</p>
            <a className="tour-resource-link" href="https://english.seoul.go.kr/wp-content/uploads/2020/01/guide-for-safe-travel-in-seoul-e.pdf" target="_blank" rel="noopener noreferrer">{textFor(locale, "Seoul's English bike safety guide", '서울시 자전거 안전 안내')} <span>↗</span></a>
          </section>
          </div>
        </section>
      </div>
      <footer className="tour-footer">{textFor(locale, 'Before every ride, confirm station availability and return rules in the ', '출발 전에 대여 가능 여부와 반납 규칙을 확인하세요: ')}
        <a href="https://www.bikeseoul.com/" target="_blank" rel="noopener noreferrer">{textFor(locale, 'official Ttareungi service ↗', '따릉이 공식 서비스 ↗')}</a>.</footer>
    </div>
  </main>
}

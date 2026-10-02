import { useEffect, useState } from 'react'
import { getTouristStation, touristRoutes, type TourCategory, type TourSeason, type TouristRoute } from '../data/touristRoutes'
import { nowInSeoul } from '../utils/solarPosition'
import { BIKE_IMAGE_PATH } from './BikeMarker'
import { TourRouteExplorer } from './TourRouteExplorer'

type Locale = 'en' | 'ko'
const textFor = <T,>(locale: Locale, english: T, korean: T): T => locale === 'en' ? english : korean
const seasonNames: Record<TourSeason, [string, string]> = {
  spring: ['Spring', '봄'], summer: ['Summer', '여름'], autumn: ['Autumn', '가을'], winter: ['Winter', '겨울'],
}

export function TouristGuide({ onBack, darkMode, onToggleTheme }: { onBack: () => void; darkMode: boolean; onToggleTheme: () => void }) {
  const [locale, setLocale] = useState<Locale>(() => new URLSearchParams(window.location.search).get('lang') === 'en' ? 'en' : 'ko')
  const [seoulClock, setSeoulClock] = useState(nowInSeoul)
  const initialRoute = touristRoutes.find(item => item.id === new URLSearchParams(window.location.search).get('route')) ?? touristRoutes[0]
  const [category, setCategory] = useState<TourCategory>(initialRoute.category)
  const [routeId, setRouteId] = useState(initialRoute.id)
  const [originStopIndex, setOriginStopIndex] = useState<number | null>(null)
  const [destinationStopIndex, setDestinationStopIndex] = useState<number | null>(null)
  const [viaStopIndex, setViaStopIndex] = useState<number | null>(null)
  const [destinationPickRequest, setDestinationPickRequest] = useState(0)
  const [rentalWidgetTarget, setRentalWidgetTarget] = useState<HTMLDivElement | null>(null)
  const categoryRoutes = touristRoutes.filter((candidate) => candidate.category === category)
  const route = categoryRoutes.find((candidate) => candidate.id === routeId) ?? categoryRoutes[0]
  useEffect(() => {
    const timer = window.setInterval(() => setSeoulClock(nowInSeoul()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
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
    setOriginStopIndex(null)
    setDestinationStopIndex(null)
    setViaStopIndex(null)
  }, [route.id])

  const chooseRoute = (id: string) => {
    setRouteId(id)
    window.requestAnimationFrame(() => {
      const detail = document.getElementById('tour-detail')
      detail?.focus({ preventScroll: true })
      detail?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
    })
  }

  const chooseRouteFromMap = (id: string) => {
    const nextRoute = touristRoutes.find(candidate => candidate.id === id)
    if (!nextRoute) return
    setCategory(nextRoute.category)
    setRouteId(nextRoute.id)
  }

  useEffect(() => {
    document.documentElement.lang = locale
    document.title = locale === 'en' ? 'Ttareungi Seoul Journey' : '따릉이 서울 여행'
    return () => { document.documentElement.lang = 'ko'; document.title = '따릉이 서울 여행' }
  }, [locale])

  const toggleLanguage = () => {
    const nextLocale = locale === 'en' ? 'ko' : 'en'
    const url = new URL(window.location.href)
    url.searchParams.set('lang', nextLocale)
    window.history.replaceState(null, '', url)
    setLocale(nextLocale)
  }

  return <main className={`tour-screen${darkMode ? ' tour-screen--dark' : ''}`}>
    <header className="tour-topbar">
      <div className="tour-brand"><img src={BIKE_IMAGE_PATH} alt="" /><span>{textFor(locale, 'TTAREUNGI SEOUL JOURNEY', '따릉이 서울 여행')}<small>{textFor(locale, 'Find your bike route through Seoul', '서울에서 자전거 길을 찾아보세요')}</small></span></div>
      <div className="tour-journey-planner" aria-label={textFor(locale, 'Plan your bike journey', '자전거 경로 설정')}>
        <label><span>{textFor(locale, 'Start', '출발')}</span><select value={originStopIndex === null ? 'location' : String(originStopIndex)} onChange={event => { const next = event.currentTarget.value === 'location' ? null : Number(event.currentTarget.value); setOriginStopIndex(next); if (next === viaStopIndex) setViaStopIndex(null) }}>
          <option value="location">{textFor(locale, 'My location', '내 위치')}</option>{route.stops.map((stop, index) => <option key={`origin-${stop.stationId}`} value={index} disabled={index === destinationStopIndex}>{textFor(locale, stop.place, stop.placeKo)}</option>)}
        </select></label>
        <span className="tour-journey-arrow" aria-hidden="true">→</span>
        <button type="button" className="tour-journey-map-pick" onClick={() => { setDestinationStopIndex(null); setViaStopIndex(null); setOriginStopIndex(null); setDestinationPickRequest(request => request + 1) }}>
          <span>{textFor(locale, 'Destination', '도착지')}</span>
          <strong>{textFor(locale, 'Choose any point on map', '지도에서 원하는 곳 선택')}</strong>
        </button>
        <label className="tour-journey-via"><span>{textFor(locale, 'Via point', '중간지점 설정')}</span><select value={viaStopIndex ?? ''} onChange={event => setViaStopIndex(event.currentTarget.value === '' ? null : Number(event.currentTarget.value))}>
          <option value="">{textFor(locale, 'No stop', '경유지 없음')}</option>{route.stops.map((stop, index) => <option key={`via-${stop.stationId}`} value={index} disabled={index === originStopIndex || index === destinationStopIndex}>{textFor(locale, stop.place, stop.placeKo)}</option>)}
        </select></label>
      </div>
      <div className="tour-header-actions">
        <button type="button" className="tour-theme-button" aria-pressed={darkMode} onClick={onToggleTheme}>{darkMode ? textFor(locale, '☀ Light', '☀ 라이트') : textFor(locale, '☾ Dark', '☾ 다크')}</button>
        <button type="button" className="tour-language-button" onClick={toggleLanguage}>{textFor(locale, '한국어', 'English')}</button>
        <div className="tour-typing-action">
          <button type="button" className="tour-back" aria-label={textFor(locale, 'Open the typing game', '타자 게임 열기')} onClick={onBack}>{textFor(locale, 'Typing game', '타자 게임')} ↗</button>
          <div className="tour-rental-widget-slot" ref={setRentalWidgetTarget} />
        </div>
      </div>
    </header>
    <div className="tour-content">
      <section className="tour-route-panel tour-map-first-panel" id="tour-detail" tabIndex={-1} aria-label={textFor(locale, `${route.title} itinerary`, `${route.titleKo} 일정`)}>
        <TourRouteExplorer route={route} routes={touristRoutes} category={category} onRouteSelect={chooseRouteFromMap}
          originStopIndex={originStopIndex} destinationStopIndex={destinationStopIndex} viaStopIndex={viaStopIndex}
          onOriginStopChange={setOriginStopIndex} onDestinationStopChange={setDestinationStopIndex} onViaStopChange={setViaStopIndex}
          locale={locale} shadowDate={seoulClock.date} shadowMinutes={seoulClock.minutes} rentalWidgetTarget={rentalWidgetTarget} destinationPickRequest={destinationPickRequest} />
      </section>
      <details className="tour-more-details" id="tour-routes">
        <summary><span><small>{textFor(locale, 'MORE TO EXPLORE', '서울을 더 둘러보기')}</small><strong>{textFor(locale, 'Browse ride themes and seasonal routes', '계절별 풍경과 테마 코스 보기')}</strong></span><i aria-hidden="true">＋</i></summary>
        <div className="tour-more-content">
          <div className="tour-route-heading"><div><span className="tour-card-kicker">{textFor(locale, 'CHOOSE A JOURNEY', '원하는 코스를 선택하세요')}</span>
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
              {category === 'seasonal' && candidate.season && <span className={`tour-season-art tour-season-art--${candidate.season}`} aria-hidden="true">
                <i className="tour-season-sun" /><i className="tour-season-tree tour-season-tree--one" /><i className="tour-season-tree tour-season-tree--two" />
                <b>{textFor(locale, seasonNames[candidate.season][0], seasonNames[candidate.season][1])}</b>
              </span>}
              <span>{textFor(locale, candidate.area, candidate.areaKo)}</span><strong>{textFor(locale, candidate.title, candidate.titleKo)}</strong>
              <small>{textFor(locale, candidate.distance ?? candidate.suggestedTime, candidate.distance ?? candidate.suggestedTimeKo)}</small>
              <span className="tour-route-discovery">{textFor(locale, candidate.discovery, candidate.discoveryKo)}</span>
              <span className="tour-route-open">{textFor(locale, `${candidate.stops.length} stops · Explore route ↓`, `${candidate.stops.length}개 경유지 · 코스 살펴보기 ↓`)}</span>
            </button>)}
          </div>
        </div>
      </details>

      <details className="tour-safety-details" id="tour-checks">
        <summary><span><small>{textFor(locale, 'BEFORE YOU RIDE', '출발 전 확인')}</small><strong>{textFor(locale, 'A few checks for a safer ride', '안전한 라이딩을 위한 간단한 확인')}</strong></span><i aria-hidden="true">＋</i></summary>
        <div className="tour-safety-content">
          <p className="tour-checks-route">{textFor(locale, route.title, route.titleKo)} · {textFor(locale, 'Daylight and public cameras near the route start', '코스 출발점의 햇빛과 주변 CCTV 정보')}</p>
          <p>{textFor(locale, 'Ride on marked bike paths, yield to pedestrians, and walk your bike where riding is restricted.', '자전거도로 표지를 따르고 보행자에게 양보하며, 주행 제한 구간에서는 자전거를 끌고 가세요.')}</p>
          <p className="tour-fine-print">{textFor(locale,
            'CCTV markers show public installation records. They do not confirm that a camera covers the bike path.',
            'CCTV 표시는 공개된 설치 위치를 나타냅니다. 자전거도로를 촬영하는지는 확인되지 않습니다.')}</p>
          <a className="tour-resource-link" href="https://english.seoul.go.kr/wp-content/uploads/2020/01/guide-for-safe-travel-in-seoul-e.pdf" target="_blank" rel="noopener noreferrer">{textFor(locale, "Seoul's English bike safety guide", '서울시 자전거 안전 안내')} <span>↗</span></a>
        </div>
      </details>
      <footer className="tour-footer">{textFor(locale, 'Before every ride, confirm station availability and return rules in the ', '출발 전에 대여 가능 여부와 반납 규칙을 확인하세요: ')}
        <a href="https://www.bikeseoul.com/" target="_blank" rel="noopener noreferrer">{textFor(locale, 'official Ttareungi service ↗', '따릉이 공식 서비스 ↗')}</a>.</footer>
    </div>
  </main>
}

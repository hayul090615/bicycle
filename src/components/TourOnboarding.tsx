import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './TourOnboarding.css'

type Locale = 'en' | 'ko'

const TUTORIAL_STEPS = [
  {
    icon: '📍',
    title: ['Your location', '내 위치 확인'],
    description: ['The map opens on Seoul, then moves to your current location when location access is allowed.', '서울 전체 지도를 먼저 보여준 뒤, 위치 권한을 허용하면 내 위치로 이동해요.'],
    tip: ['You can recenter the map with the location button.', '위치 버튼을 누르면 언제든 내 위치로 돌아올 수 있어요.'],
  },
  {
    icon: '🔎',
    title: ['Find a place', '장소와 도착지 검색'],
    description: ['Search for a Seoul place in the top search box, or choose a destination directly on the map.', '위쪽 검색창에서 서울 장소를 찾거나, 지도에서 도착지를 직접 선택할 수 있어요.'],
    tip: ['The route updates after you choose a destination.', '도착지를 고르면 자전거 길 안내가 표시돼요.'],
  },
  {
    icon: '🗺️',
    title: ['Change the map', '지도 화면 바꾸기'],
    description: ['Use the map controls to switch between the map, satellite imagery, and 3D views.', '지도 왼쪽의 보기 버튼으로 지도·스카이뷰·3D 화면을 바꿔보세요.'],
    tip: ['Zoom with the wheel, trackpad, or pinch gesture.', '마우스 휠·트랙패드·두 손가락으로 지도를 확대하고 축소할 수 있어요.'],
  },
  {
    icon: '🚲',
    title: ['See nearby services', '주변 편의 정보'],
    description: ['Open the map menu to show Ttareungi stations, toilets, convenience stores, and other map details.', '지도 메뉴에서 따릉이 대여소와 화장실, 편의점 등 주변 정보를 켜고 끌 수 있어요.'],
    tip: ['Tap a station marker to check its available-bike information.', '대여소 표시를 누르면 이용 가능한 자전거 정보를 확인할 수 있어요.'],
  },
  {
    icon: '🧭',
    title: ['Follow your ride', '길 안내와 로드뷰'],
    description: ['Choose a route and destination to see bicycle directions. Open Roadview to look around the street.', '코스와 도착지를 선택하면 자전거 길 안내가 나와요. 로드뷰에서 주변 거리도 살펴보세요.'],
    tip: ['The timer helps you keep track of your rental time.', '타이머로 대여 시간을 확인할 수 있어요.'],
  },
] as const

const TUTORIAL_COOKIE = 'ttareungi_tutorial_seen_v1'
const AD_HIDDEN_COOKIE = 'ttareungi_ad_hidden_until_v1'
const YEAR_SECONDS = 365 * 24 * 60 * 60
const DAY_SECONDS = 24 * 60 * 60

function hasCookie(name: string) {
  try { return document.cookie.split(';').some(cookie => cookie.trim().startsWith(`${name}=`)) }
  catch { return false }
}

function writeCookie(name: string, maxAgeSeconds: number) {
  try {
    const secure = window.location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${name}=1; Max-Age=${maxAgeSeconds}; Path=/; SameSite=Lax${secure}`
  } catch { /* The guide still works if this browser blocks cookies. */ }
}

export function TourOnboarding({ locale, darkMode, mapSequenceReady }: {
  locale: Locale
  darkMode: boolean
  mapSequenceReady: boolean
}) {
  const ko = locale === 'ko'
  const [tutorialStep, setTutorialStep] = useState<number | null>(null)
  const [adOpen, setAdOpen] = useState(false)
  const [hideAdForDay, setHideAdForDay] = useState(false)
  const sequenceHandledRef = useRef(false)
  const step = tutorialStep === null ? null : TUTORIAL_STEPS[tutorialStep]

  useEffect(() => {
    if (!mapSequenceReady || sequenceHandledRef.current) return
    sequenceHandledRef.current = true
    if (hasCookie(TUTORIAL_COOKIE)) {
      if (!hasCookie(AD_HIDDEN_COOKIE)) setAdOpen(true)
      return
    }
    setTutorialStep(0)
  }, [mapSequenceReady])

  const finishTutorial = () => {
    writeCookie(TUTORIAL_COOKIE, YEAR_SECONDS)
    setTutorialStep(null)
    if (!hasCookie(AD_HIDDEN_COOKIE)) setAdOpen(true)
  }

  const closeAd = () => {
    if (hideAdForDay) writeCookie(AD_HIDDEN_COOKIE, DAY_SECONDS)
    setAdOpen(false)
  }

  const showRoutes = () => {
    setAdOpen(false)
    const details = document.getElementById('tour-routes') as HTMLDetailsElement | null
    if (details) details.open = true
    details?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' })
  }

  useEffect(() => {
    if (tutorialStep === null) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        finishTutorial()
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        setTutorialStep(current => current === null ? null : Math.max(0, current - 1))
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        setTutorialStep(current => current === null ? null : current === TUTORIAL_STEPS.length - 1 ? current : current + 1)
      }
    }
    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [tutorialStep])

  if (tutorialStep !== null && step) return createPortal(<div className={`tour-onboarding-overlay${darkMode ? ' tour-onboarding-overlay--dark' : ''}`}>
    <section className="tour-onboarding-card" role="dialog" aria-modal="true" aria-labelledby="tour-onboarding-title">
      <header className="tour-onboarding-header">
        <span>{ko ? '처음 오셨나요?' : 'NEW HERE?'}</span>
        <button type="button" className="tour-onboarding-close" onClick={finishTutorial} aria-label={ko ? '튜토리얼 닫기' : 'Close tutorial'} title={ko ? '튜토리얼 닫기' : 'Close tutorial'}>×</button>
      </header>
      <div className="tour-onboarding-content" aria-live="polite">
        <span className="tour-onboarding-icon" aria-hidden="true">{step.icon}</span>
        <p className="tour-onboarding-kicker">{ko ? `사용 안내 ${tutorialStep + 1} / ${TUTORIAL_STEPS.length}` : `GUIDE ${tutorialStep + 1} / ${TUTORIAL_STEPS.length}`}</p>
        <h2 id="tour-onboarding-title">{ko ? step.title[1] : step.title[0]}</h2>
        <p className="tour-onboarding-description">{ko ? step.description[1] : step.description[0]}</p>
        <p className="tour-onboarding-tip"><span aria-hidden="true">✦</span>{ko ? step.tip[1] : step.tip[0]}</p>
      </div>
      <footer className="tour-onboarding-footer">
        <div className="tour-onboarding-progress" aria-label={ko ? `${tutorialStep + 1}단계 중 ${TUTORIAL_STEPS.length}단계` : `Step ${tutorialStep + 1} of ${TUTORIAL_STEPS.length}`}>
          {TUTORIAL_STEPS.map((item, index) => <span key={item.title[0]} className={index === tutorialStep ? 'is-active' : ''} />)}
        </div>
        <div className="tour-onboarding-navigation">
          <button type="button" className="tour-onboarding-prev" onClick={() => setTutorialStep(current => current === null ? null : Math.max(0, current - 1))} disabled={tutorialStep === 0} aria-label={ko ? '이전 안내' : 'Previous tip'}>‹</button>
          <span>{tutorialStep + 1}<i> / </i>{TUTORIAL_STEPS.length}</span>
          <button type="button" className="tour-onboarding-next" onClick={() => tutorialStep === TUTORIAL_STEPS.length - 1 ? finishTutorial() : setTutorialStep(tutorialStep + 1)} aria-label={ko ? tutorialStep === TUTORIAL_STEPS.length - 1 ? '튜토리얼 완료' : '다음 안내' : tutorialStep === TUTORIAL_STEPS.length - 1 ? 'Finish tutorial' : 'Next tip'}>
            {tutorialStep === TUTORIAL_STEPS.length - 1 ? '✓' : '›'}
          </button>
        </div>
      </footer>
    </section>
  </div>, document.body)

  if (adOpen) return createPortal(<div className={`tour-onboarding-overlay tour-onboarding-overlay--ad${darkMode ? ' tour-onboarding-overlay--dark' : ''}`}>
    <section className="tour-ad-card" role="dialog" aria-modal="true" aria-labelledby="tour-ad-title">
      <div className="tour-ad-art" aria-hidden="true">
        <span className="tour-ad-label">{ko ? '추천' : 'FEATURED'}</span>
        <svg viewBox="0 0 520 188" preserveAspectRatio="xMidYMid slice">
          <path className="tour-ad-sky" d="M0 0h520v188H0z" />
          <circle className="tour-ad-sun" cx="404" cy="48" r="25" />
          <path className="tour-ad-hill" d="M0 124c81-48 139-37 207-10s101 27 159-4 98-27 154 1v77H0z" />
          <path className="tour-ad-river" d="M0 157c91-23 141 18 231-2s150-43 289-7v40H0z" />
          <path className="tour-ad-route" d="M23 132c66-8 83-36 143-35s54 41 116 40 76-37 125-37 64 16 92 9" />
          <circle className="tour-ad-route-dot" cx="23" cy="132" r="7" /><circle className="tour-ad-route-dot" cx="499" cy="109" r="7" />
          <g className="tour-ad-bike" transform="translate(274 85)">
            <circle cx="0" cy="37" r="17" /><circle cx="66" cy="37" r="17" />
            <path d="m0 37 20-34 21 34H0l16-25h38l12 25M37 3h12M20 3h9" />
            <circle cx="27" cy="-1" r="4" />
          </g>
        </svg>
        <div className="tour-ad-art-copy"><strong>{ko ? '오늘은 서울을 달려볼까요?' : 'Take the scenic way through Seoul.'}</strong><span>{ko ? '강변 풍경을 따라 나만의 코스를 찾아보세요.' : 'Find a route that follows the river and your own pace.'}</span></div>
      </div>
      <div className="tour-ad-copy">
        <span className="tour-ad-eyebrow">{ko ? '따릉이 서울 여행' : 'TTAREUNGI SEOUL JOURNEY'}</span>
        <h2 id="tour-ad-title">{ko ? '가까운 대여소부터 확인해 보세요' : 'Start with a bike nearby'}</h2>
        <p>{ko ? '내 주변 따릉이 대여소를 확인하고, 마음에 드는 서울 코스를 골라보세요.' : 'Check nearby Ttareungi stations, then pick a Seoul ride that suits your day.'}</p>
      </div>
      <footer className="tour-ad-footer">
        <label><input type="checkbox" checked={hideAdForDay} onChange={event => setHideAdForDay(event.target.checked)} /><span>{ko ? '24시간 동안 보지 않기' : "Don't show for 24 hours"}</span></label>
        <div>
          <button type="button" className="tour-ad-explore" onClick={showRoutes}>{ko ? '코스 둘러보기' : 'Explore routes'}</button>
          <button type="button" className="tour-ad-close" onClick={closeAd}>{ko ? '닫기' : 'Close'}</button>
        </div>
      </footer>
    </section>
  </div>, document.body)

  return null
}

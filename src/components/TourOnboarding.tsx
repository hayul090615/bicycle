/**
 * 첫 방문에는 튜토리얼 뒤 광고를 띄우고, 재방문에는 광고만 띄운다. 광고의 24시간 숨김 선택만 따로 확인한다.
 */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { claimTutorialPresentation, isReturningVisitor } from '../services/siteVisits'
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
    description: ['Bike stations are always shown. Use the category buttons above the map to show nearby restaurants, toilets, or convenience stores.', '대여소는 기본으로 보여요. 지도 위 가로 버튼에서 식당, 화장실, 편의점 등 주변 정보를 선택할 수 있어요.'],
    tip: ['Tap a station marker to check its available-bike information.', '대여소 표시를 누르면 이용 가능한 자전거 정보를 확인할 수 있어요.'],
  },
  {
    icon: '🧭',
    title: ['Follow your ride', '길 안내와 로드뷰'],
    description: ['Choose a route and destination to see bicycle directions. Open Roadview to look around the street.', '코스와 도착지를 선택하면 자전거 길 안내가 나와요. 로드뷰에서 주변 거리도 살펴보세요.'],
    tip: ['The timer helps you keep track of your rental time.', '타이머로 대여 시간을 확인할 수 있어요.'],
  },
] as const

// 광고 내용 세 개를 모아 두고, 사용자가 고른 번호의 광고를 보여 준다.
const DEMO_ADS = [
  {
    id: 'seoul-ride',
    theme: 'ride',
    headline: ['Take the scenic way through Seoul.', '오늘은 서울을 달려볼까요?'],
    caption: ['Find a route that follows the river and your own pace.', '강변 풍경을 따라 나만의 코스를 찾아보세요.'],
    eyebrow: ['TTAREUNGI SEOUL JOURNEY', '따릉이 서울 여행'],
    title: ['Start with a bike nearby', '가까운 대여소부터 확인해 보세요'],
    description: ['Check nearby Ttareungi stations, then pick a Seoul ride that suits your day.', '내 주변 따릉이 대여소를 확인하고, 마음에 드는 서울 코스를 골라보세요.'],
  },
  {
    id: 'riverside-picnic',
    theme: 'picnic',
    headline: ['A little picnic, a lovely ride.', '라이딩 끝에 작은 피크닉 어때요?'],
    caption: ['Take a break with a riverside view.', '한강 풍경과 함께 잠깐 쉬어가세요.'],
    eyebrow: ['RIVERSIDE PICNIC', '한강 피크닉'],
    title: ['Pack a picnic for your next ride', '돗자리 하나로 완성하는 한강 나들이'],
    description: ['Bring a picnic mat, water, and a light snack to enjoy after your ride.', '돗자리와 물, 간단한 간식을 챙겨보세요. 달린 뒤 여유로운 휴식까지 즐길 수 있어요.'],
  },
  {
    id: 'ready-to-ride',
    theme: 'gear',
    headline: ['Ready for a safer ride?', '오늘의 라이딩, 안전하게 준비해요'],
    caption: ['A helmet and lights make a good start.', '헬멧과 자전거 조명부터 챙겨보세요.'],
    eyebrow: ['READY TO RIDE', '라이딩 준비'],
    title: ['Small essentials for every ride', '가볍게 챙기는 나만의 라이딩 준비물'],
    description: ['Get your helmet, lights, and water ready before heading out on your next ride.', '출발 전 헬멧, 조명, 물을 확인해 보세요. 준비를 마쳤다면 서울 자전거길로 출발!'],
  },
] as const

const TUTORIAL_COOKIE = 'ttareungi_tutorial_seen_v1'
const AD_HIDDEN_COOKIE = 'ttareungi_ad_hidden_until_v1'
const YEAR_SECONDS = 365 * 24 * 60 * 60
const DAY_SECONDS = 24 * 60 * 60

/** 이름에 해당하는 안내 표시 기록이 쿠키에 있는지 확인한다. */
function hasCookie(name: string) {
  try { return document.cookie.split(';').some(cookie => cookie.trim().startsWith(`${name}=`)) }
  catch { return false }
}

/** 안내 표시 기록을 지정한 만료 시간으로 저장한다. */
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
  // useState는 화면에 필요한 값을 기억한다. set으로 시작하는 함수를 부르면 새 값으로 화면도 바뀐다.
  const [tutorialStep, setTutorialStep] = useState<number | null>(null)
  const [tutorialFinished, setTutorialFinished] = useState(false)
  const [adOpen, setAdOpen] = useState(false)
  const [adIndex, setAdIndex] = useState(0)
  const [hideAdForDay, setHideAdForDay] = useState(false)
  // useRef는 지도 객체나 이전 값을 기억하는 상자다. current를 바꿔도 화면을 다시 그리지는 않는다.
  const sequenceHandledRef = useRef(false)
  const adHandledRef = useRef(false)
  const step = tutorialStep === null ? null : TUTORIAL_STEPS[tutorialStep]
  const ad = DEMO_ADS[adIndex]
  const languageIndex = ko ? 1 : 0

  // 화면이 열리거나 대괄호 안의 값이 바뀌면 실행한다. return 안의 함수는 이전 작업을 정리할 때 실행된다.
  useEffect(() => {
    if (!mapSequenceReady || sequenceHandledRef.current) return
    let cancelled = false
    void isReturningVisitor().then(returning => {
      if (cancelled || sequenceHandledRef.current) return
      sequenceHandledRef.current = true
      if (returning || hasCookie(TUTORIAL_COOKIE) || !claimTutorialPresentation()) setTutorialFinished(true)
      else setTutorialStep(0)
    }).catch(() => {
      if (cancelled || sequenceHandledRef.current) return
      sequenceHandledRef.current = true
      setTutorialFinished(true)
    })
    return () => { cancelled = true }
  }, [mapSequenceReady])

  // 방문 기록은 튜토리얼에만 사용한다. 광고는 지도를 열 때마다 별도로 판단한다.
  useEffect(() => {
    if (!mapSequenceReady || !tutorialFinished || adHandledRef.current) return
    adHandledRef.current = true
    setAdOpen(!hasCookie(AD_HIDDEN_COOKIE))
  }, [mapSequenceReady, tutorialFinished])

  // 광고가 열려 있는 동안 세 장을 0.3초마다 순서대로 보여 준다.
  useEffect(() => {
    if (!adOpen) return
    const timer = window.setInterval(() => setAdIndex(current => (current + 1) % DEMO_ADS.length), 300)
    return () => window.clearInterval(timer)
  }, [adOpen])

  const finishTutorial = () => {
    writeCookie(TUTORIAL_COOKIE, YEAR_SECONDS)
    setTutorialStep(null)
    setTutorialFinished(true)
  }

  const closeAd = () => {
    if (hideAdForDay) writeCookie(AD_HIDDEN_COOKIE, DAY_SECONDS)
    setAdOpen(false)
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
        <div className="tour-onboarding-navigation">
          <button type="button" className="tour-onboarding-prev" onClick={() => setTutorialStep(current => current === null ? null : Math.max(0, current - 1))} disabled={tutorialStep === 0} aria-label={ko ? '이전 안내' : 'Previous tip'}>‹</button>
          <span>{tutorialStep + 1}<i> / </i>{TUTORIAL_STEPS.length}</span>
          <button type="button" className="tour-onboarding-next" onClick={() => tutorialStep === TUTORIAL_STEPS.length - 1 ? finishTutorial() : setTutorialStep(tutorialStep + 1)} aria-label={ko ? tutorialStep === TUTORIAL_STEPS.length - 1 ? '튜토리얼 완료' : '다음 안내' : tutorialStep === TUTORIAL_STEPS.length - 1 ? 'Finish tutorial' : 'Next tip'}>
            {tutorialStep === TUTORIAL_STEPS.length - 1 ? '✓' : '›'}
          </button>
        </div>
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
      </footer>
    </section>
  </div>, document.body)

  if (adOpen) return createPortal(<div className={`tour-onboarding-overlay tour-onboarding-overlay--ad${darkMode ? ' tour-onboarding-overlay--dark' : ''}`}>
    <section className="tour-ad-card" role="dialog" aria-modal="true" aria-labelledby="tour-ad-title">
      <div className={`tour-ad-art tour-ad-art--${ad.theme}`} aria-hidden="true">
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
        <div className="tour-ad-art-copy"><strong>{ad.headline[languageIndex]}</strong><span>{ad.caption[languageIndex]}</span></div>
      </div>
      <div className="tour-ad-copy" aria-live="polite" aria-atomic="true">
        <span className="tour-ad-eyebrow">{ad.eyebrow[languageIndex]}</span>
        <h2 id="tour-ad-title">{ad.title[languageIndex]}</h2>
        <p>{ad.description[languageIndex]}</p>
      </div>
      <div className="tour-ad-navigation" role="group" aria-label={ko ? '광고 선택' : 'Choose an advertisement'}>
        <button type="button" className="tour-ad-arrow" onClick={() => setAdIndex(current => (current + DEMO_ADS.length - 1) % DEMO_ADS.length)} aria-label={ko ? '이전 광고' : 'Previous advertisement'}>‹</button>
        <div className="tour-ad-pagination">
          <span>{adIndex + 1} / {DEMO_ADS.length}</span>
          <div className="tour-ad-dots">
            {DEMO_ADS.map((item, index) => <button type="button" key={item.id} className={index === adIndex ? 'is-active' : ''} onClick={() => setAdIndex(index)} aria-label={ko ? `${index + 1}번째 광고 보기` : `Show advertisement ${index + 1}`} aria-pressed={index === adIndex}><span /></button>)}
          </div>
        </div>
        <button type="button" className="tour-ad-arrow" onClick={() => setAdIndex(current => (current + 1) % DEMO_ADS.length)} aria-label={ko ? '다음 광고' : 'Next advertisement'}>›</button>
      </div>
      <footer className="tour-ad-footer">
        <label><input type="checkbox" checked={hideAdForDay} onChange={event => setHideAdForDay(event.target.checked)} /><span>{ko ? '24시간 동안 보지 않기' : "Don't show for 24 hours"}</span></label>
        <div>
          <button type="button" className="tour-ad-close" onClick={closeAd}>{ko ? '닫기' : 'Close'}</button>
        </div>
      </footer>
    </section>
  </div>, document.body)

  return null
}

/**
 * 사이트 전체 화면 전환과 시작 애니메이션을 관리한다. 지도·타자 게임·로그인 화면을 연결하고 게임 기록, 테마, 방문 기록을 유지한다.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { CourseMap } from './components/CourseMap'
import { Countdown } from './components/Countdown'
import { DistrictSelector } from './components/DistrictSelector'
import { GameHeader } from './components/GameHeader'
import { GameResult } from './components/GameResult'
import { TypingInput } from './components/TypingInput'
import { TouristGuide } from './components/TouristGuide'
import { TextPractice } from './components/TextPractice'
import { AuthPage, type AuthPageKind } from './components/AuthPage'
import { createDistrictCourse, districtCourses, type SeoulDistrict } from './data/districtCourses'
import { useTypingGame } from './hooks/useTypingGame'
import { useBikeStations } from './hooks/useBikeStations'
import type { DistrictCourse, GameResultData, LeaderboardEntry } from './types/game'
import { SEOUL_BOUNDARY } from './data/seoulBoundary'
import { savedSiteLocale } from './services/siteLocale'
import { registerSiteVisit } from './services/siteVisits'
import { GameGuide } from './components/GameGuide'

type AppScreen = 'select' | 'text' | 'game' | 'result' | 'tour' | AuthPageKind
/** URL에 지정된 화면을 읽어 최초 진입 화면을 결정한다. */
function screenFromUrl(): AppScreen {
  const params = new URLSearchParams(window.location.search)
  const page = params.get('page')
  if (page === 'login' || page === 'signup') return page
  if (page === 'typing') return 'select'
  if (page === 'learn') return 'game'
  return 'tour'
}
function learningDistrictFromUrl(): SeoulDistrict | null {
  const params = new URLSearchParams(window.location.search)
  if (params.get('page') !== 'learn') return null
  const district = params.get('district')
  return district && Object.hasOwn(districtCourses, district) ? district as SeoulDistrict : '강남구'
}
const HIGH_SCORE_KEY = 'seoul-typing-bike-high-score'
const PLAYED_STATIONS_KEY = 'seoul-typing-bike-played-stations-v1'
const GAME_THEME_KEY = 'seoul-typing-bike-light-mode'
const LEADERBOARD_KEY = 'seoul-typing-bike-leaderboard-v1'
type PlayedStations = Partial<Record<SeoulDistrict, string[]>>

const splashMapBounds = SEOUL_BOUNDARY.reduce((bounds, [lng, lat]) => ({
  minLng: Math.min(bounds.minLng, lng), maxLng: Math.max(bounds.maxLng, lng),
  minLat: Math.min(bounds.minLat, lat), maxLat: Math.max(bounds.maxLat, lat),
}), { minLng: Infinity, maxLng: -Infinity, minLat: Infinity, maxLat: -Infinity })
const splashMapWidth = 600
const splashMapHeight = 460
const splashMapPadding = 20
const splashLongitudeScale = Math.cos(((splashMapBounds.minLat + splashMapBounds.maxLat) / 2) * Math.PI / 180)
const splashMapScale = Math.min(
  (splashMapWidth - splashMapPadding * 2) / ((splashMapBounds.maxLng - splashMapBounds.minLng) * splashLongitudeScale),
  (splashMapHeight - splashMapPadding * 2) / (splashMapBounds.maxLat - splashMapBounds.minLat),
)
const splashMapOffsetX = (splashMapWidth - (splashMapBounds.maxLng - splashMapBounds.minLng) * splashLongitudeScale * splashMapScale) / 2
const splashMapOffsetY = (splashMapHeight - (splashMapBounds.maxLat - splashMapBounds.minLat) * splashMapScale) / 2
const SEOUL_SPLASH_PATH = SEOUL_BOUNDARY.map(([lng, lat], index) => {
  const x = splashMapOffsetX + (lng - splashMapBounds.minLng) * splashLongitudeScale * splashMapScale
  const y = splashMapHeight - splashMapOffsetY - (lat - splashMapBounds.minLat) * splashMapScale
  return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
}).join(' ') + ' Z'

/** 게임 상태 훅과 입력창·지도·점수 표시를 연결한다. */
function GameScreen({ course, playedStationIds, onHome, onResult, lightMode, onToggleTheme }: { course: DistrictCourse; playedStationIds: readonly string[]; onHome: () => void; onResult: (result: GameResultData) => void; lightMode: boolean; onToggleTheme: () => void }) {
  // useRef는 지도 객체나 이전 값을 기억하는 상자다. current를 바꿔도 화면을 다시 그리지는 않는다.
  const inputRef = useRef<HTMLInputElement>(null)
  const [guideOpen, setGuideOpen] = useState(true)
  const game = useTypingGame(course, onResult, guideOpen)
  const stationData = useBikeStations(course.district as SeoulDistrict)
  const overallProgress = ((game.stationIndex + game.segmentProgress) / (course.stations.length - 1)) * 100
  const upcomingStation = course.stations[game.stationIndex + 2]
  // 화면이 열리거나 대괄호 안의 값이 바뀌면 실행한다. return 안의 함수는 이전 작업을 정리할 때 실행된다.
  useLayoutEffect(() => {
    const updateVisualViewport = () => {
      const viewport = window.visualViewport
      document.documentElement.style.setProperty('--game-visual-height', `${viewport?.height ?? window.innerHeight}px`)
      document.documentElement.style.setProperty('--game-visual-top', `${viewport?.offsetTop ?? 0}px`)
    }
    updateVisualViewport()
    window.visualViewport?.addEventListener('resize', updateVisualViewport)
    window.visualViewport?.addEventListener('scroll', updateVisualViewport)
    window.addEventListener('resize', updateVisualViewport)
    return () => {
      window.visualViewport?.removeEventListener('resize', updateVisualViewport)
      window.visualViewport?.removeEventListener('scroll', updateVisualViewport)
      window.removeEventListener('resize', updateVisualViewport)
      document.documentElement.style.removeProperty('--game-visual-height')
      document.documentElement.style.removeProperty('--game-visual-top')
    }
  }, [])
  useEffect(() => { if (game.status === 'playing' && !guideOpen) inputRef.current?.focus() }, [game.status, game.stationIndex, guideOpen])
  const focusGame = (event: MouseEvent<HTMLElement>) => {
    if (!guideOpen && game.status === 'playing' && !(event.target as HTMLElement).closest('button, input')) inputRef.current?.focus()
  }
  // 아래 JSX는 화면에 보일 내용이다. 중괄호 안에는 위에서 계산한 값이나 버튼 동작을 넣는다.
  return <main className={`game-screen ${lightMode ? 'game-screen--light' : ''}`} onClick={focusGame}>
    <CourseMap course={course} stationIndex={game.stationIndex} segmentProgress={game.segmentProgress}
      isWrong={game.analysis.isWrong} errorPulse={game.errorPulse} arrivalPulse={game.arrivalPulse}
      dataStatus={stationData.status} lightMode={lightMode} allDistrictStations={stationData.stations} playedStationIds={playedStationIds} />
    <GameHeader district={course.district} elapsedSeconds={game.elapsedSeconds} score={game.score} accuracy={game.accuracy}
      combo={game.combo} onPause={game.togglePause} onHome={onHome} paused={game.status === 'paused'}
      progress={overallProgress} lightMode={lightMode} onToggleTheme={onToggleTheme} />
    <div className="game-hud">
      <div className="station-strip">
        <div className="hud-station-card hud-station-card--current">
          <span><i className="station-card-icon station-card-icon--current" aria-hidden="true">●</i>현재 대여소</span><strong>{game.currentStation.name}</strong>
        </div>
        <div className="game-typing-area">
          {game.nextStation && <TypingInput key={game.stationIndex} ref={inputRef} target={game.targetText} value={game.input} analysis={game.analysis}
            disabled={guideOpen || game.status !== 'playing'} timerStarted={game.hasStartedTyping} onValueChange={game.updateInput} onCompositionCommit={game.commitComposition}
            onSubmitAttempt={game.submitInput} />}
        </div>
        <div className="hud-station-card hud-station-card--next">
          <span><i className="station-card-icon station-card-icon--next" aria-hidden="true">➜</i>다음 대여소</span><strong>{upcomingStation?.name ?? '코스 도착'}</strong>
        </div>
      </div>
    </div>
    {guideOpen && <GameGuide onClose={() => setGuideOpen(false)} />}
    {!guideOpen && game.status === 'countdown' && <Countdown value={game.countdown} courseTitle={course.title} stationName={game.currentStation.name} />}
    {!guideOpen && game.status === 'paused' && <div className="pause-overlay" role="dialog" aria-modal="true" aria-label="일시 정지">
      <button type="button" className="pause-overlay-close" onClick={game.togglePause} aria-label="계속 달리기">×</button>
      <div className="pause-overlay-content"><h2>잠시 쉬어가요</h2></div>
    </div>}
  </main>
}

export default function App() {
  // useState는 화면에 필요한 값을 기억한다. set으로 시작하는 함수를 부르면 새 값으로 화면도 바뀐다.
  const [screen, setScreen] = useState<AppScreen>(screenFromUrl)
  useEffect(() => { void registerSiteVisit() }, [])
  const [showSiteSplash, setShowSiteSplash] = useState(true)
  const [lightMode, setLightMode] = useState(() => localStorage.getItem(GAME_THEME_KEY) !== 'false')
  // 다른 화면에 전달할 함수를 기억한다. 대괄호 안의 값이 바뀌면 함수를 새로 만든다.
  const toggleTheme = useCallback(() => setLightMode(current => {
    localStorage.setItem(GAME_THEME_KEY, String(!current))
    return !current
  }), [])
  useEffect(() => {
    const handleBack = () => setScreen(screenFromUrl())
    window.addEventListener('popstate', handleBack)
    return () => window.removeEventListener('popstate', handleBack)
  }, [])
  useEffect(() => {
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 250 : 1650
    const timer = window.setTimeout(() => setShowSiteSplash(false), duration)
    return () => window.clearTimeout(timer)
  }, [])
  const [selected, setSelected] = useState<SeoulDistrict | null>(learningDistrictFromUrl)
  const [runKey, setRunKey] = useState(0)
  const [result, setResult] = useState<GameResultData | null>(null)
  const [activeCourse, setActiveCourse] = useState<DistrictCourse | null>(() => {
    const district = learningDistrictFromUrl()
    return district ? createDistrictCourse(district, []) : null
  })
  const [currentRankingId, setCurrentRankingId] = useState<string | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem(LEADERBOARD_KEY) ?? '[]') as LeaderboardEntry[] }
    catch { return [] }
  })
  const [playedStations, setPlayedStations] = useState<PlayedStations>(() => {
    try { return JSON.parse(localStorage.getItem(PLAYED_STATIONS_KEY) ?? '{}') as PlayedStations }
    catch { return {} }
  })
  const [highScore, setHighScore] = useState(() => Number(localStorage.getItem(HIGH_SCORE_KEY) ?? 0))
  const handleResult = useCallback((gameResult: GameResultData) => {
    setResult(gameResult)
    setHighScore((value) => Math.max(value, gameResult.score))
    if (selected && activeCourse) {
      const rankingEntry: LeaderboardEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        district: selected,
        score: gameResult.score,
        accuracy: gameResult.accuracy,
        elapsedSeconds: gameResult.elapsedSeconds,
        completed: gameResult.completed,
        createdAt: Date.now(),
      }
      setCurrentRankingId(rankingEntry.id)
      setLeaderboard((current) => {
        const next = [...current, rankingEntry]
          .sort((a, b) => b.score - a.score || a.elapsedSeconds - b.elapsedSeconds || b.accuracy - a.accuracy || a.createdAt - b.createdAt)
          .slice(0, 100)
        localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(next))
        return next
      })
      setPlayedStations((current) => {
        const completedIds = activeCourse.stations.slice(0, gameResult.passedStations + 1).map((station) => station.id)
        const next = { ...current, [selected]: Array.from(new Set([...(current[selected] ?? []), ...completedIds])) }
        localStorage.setItem(PLAYED_STATIONS_KEY, JSON.stringify(next))
        return next
      })
    }
    setScreen('result')
  }, [activeCourse, selected])
  const goHome = () => {
    const url = new URL(window.location.href)
    url.searchParams.delete('lang')
    url.searchParams.delete('route')
    url.searchParams.delete('district')
    url.searchParams.set('page', 'typing')
    window.history.replaceState(null, '', url)
    setScreen('select'); setResult(null); setActiveCourse(null)
  }
  const openTours = () => {
    const url = new URL(window.location.href)
    url.searchParams.delete('page')
    url.searchParams.set('lang', savedSiteLocale())
    window.history.replaceState(null, '', url)
    setScreen('tour')
  }
  const openAuth = (kind: AuthPageKind) => {
    const url = new URL(window.location.href)
    url.searchParams.delete('lang')
    url.searchParams.set('page', kind)
    window.history.pushState(null, '', url)
    setScreen(kind)
  }
  const openTextPractice = () => {
    if (!selected) setSelected('강남구')
    setScreen('text')
  }
  const startDistrictGame = (district: SeoulDistrict) => {
    setSelected(district)
    setActiveCourse(createDistrictCourse(district, playedStations[district] ?? []))
    setRunKey((value) => value + 1); setResult(null); setCurrentRankingId(null); setScreen('game')
  }
  const startGame = () => { if (selected) startDistrictGame(selected) }
  let screenContent: ReactNode
  if (screen === 'game' && activeCourse) screenContent = <GameScreen key={runKey} course={activeCourse} playedStationIds={selected ? (playedStations[selected] ?? []) : []} onHome={goHome} onResult={handleResult} lightMode={lightMode} onToggleTheme={toggleTheme} />
  else if (screen === 'result' && activeCourse && result) screenContent = <GameResult district={activeCourse.district} result={result} highScore={highScore}
    totalStations={activeCourse.stations.length} leaderboard={leaderboard} currentRankingId={currentRankingId} onRetry={startGame} onHome={goHome} />
  else if (screen === 'tour') screenContent = <TouristGuide onBack={goHome} darkMode={!lightMode} onToggleTheme={toggleTheme} />
  else if (screen === 'login' || screen === 'signup') screenContent = <AuthPage key={screen} kind={screen} onHome={goHome} onNavigate={openAuth} />
  else if (screen === 'text') screenContent = <TextPractice district={selected} onDistrictChange={setSelected} onBack={goHome} />
  else screenContent = <DistrictSelector selected={selected} onSelect={startDistrictGame} onStart={startGame} onOpenTours={openTours}
    onOpenTextPractice={openTextPractice}
    onOpenAuth={openAuth}
    highScore={highScore} playedStations={playedStations} />

  return <>
    {screenContent}
    {showSiteSplash && <div className="site-bike-splash" role="status" aria-label="자전거로 즐기는 서울">
      <div className="site-bike-splash-scene" aria-hidden="true">
        <svg className="site-bike-splash-road" viewBox="0 0 600 460" focusable="false">
          <defs><clipPath id="site-seoul-map-clip"><path d={SEOUL_SPLASH_PATH} /></clipPath></defs>
          <path className="site-bike-map-land" d={SEOUL_SPLASH_PATH} />
          <g clipPath="url(#site-seoul-map-clip)">
            <path className="site-bike-road-bed site-bike-road-avenue" d="M-20 104C52 100 91 143 155 128S257 80 318 108 425 160 492 132 566 96 634 121M-24 305C43 277 103 308 163 285S263 237 327 265 429 320 493 290 563 248 626 273M75 486C115 417 150 354 204 303S310 218 355 157 407 69 450-25M220 489C249 420 272 356 324 309S420 234 458 177 511 86 567-14" />
            <path className="site-bike-road-bed site-bike-road-street" d="M45 5C77 64 86 116 66 166S32 252 52 315 98 403 105 468M112 0C142 56 146 110 128 158S101 250 126 304 169 379 166 456M187-8C168 46 171 96 202 145S245 218 219 272 183 357 207 413 242 451 239 474M257-8C293 46 296 94 266 146S230 224 261 276 305 348 291 399 270 442 281 472M337-12C305 45 310 94 344 143S384 220 351 274 321 351 351 405 388 451 378 476M410-10C447 44 444 98 412 149S383 226 416 276 453 345 435 397 417 440 435 468M493-12C458 48 462 101 495 151S536 221 506 274 476 346 505 400 541 445 527 472M566-4C532 48 535 98 568 145S605 222 578 274 552 344 574 390 602 440 594 468M-8 61C55 48 113 74 169 65S272 36 331 59 440 91 497 67 572 48 621 66M-14 185C42 165 98 195 154 183S263 150 324 175 432 210 489 185 566 163 624 181M-14 231C48 211 102 239 163 229S270 197 331 221 434 255 492 232 568 207 625 227M-10 354C48 330 108 361 168 349S271 317 331 340 433 377 493 352 568 329 622 346M18 414C75 391 129 418 186 406S280 380 337 400 434 434 493 413 560 390 607 404M17 27C42 48 59 71 67 94M91 17C110 43 119 68 108 94M156 7C174 32 179 56 167 82M227 9C245 35 246 59 232 85M300 4C317 30 317 54 301 80M374 2C389 26 389 53 375 79M449 3C467 30 463 56 448 84M525 9C544 34 539 61 523 88M590 18C606 42 600 65 584 91M24 272C58 248 91 228 127 231M73 342C104 320 136 298 175 301M151 387C184 361 215 339 252 341M245 425C275 399 307 378 345 380M355 421C388 394 418 374 457 376M458 340C490 318 523 300 561 302M432 235C464 215 498 197 536 201M328 191C362 171 397 153 435 157M196 178C229 158 261 140 298 143" />
            <path className="site-bike-cycle-route" d="M20 155C70 177 104 196 151 190S236 158 282 175 365 214 412 205 493 172 567 192M26 332C82 307 124 286 177 291S260 321 311 304 401 270 451 282 522 311 581 284M95 455C126 386 159 330 211 283S310 211 352 153 396 63 421 4M190 455C216 398 237 347 284 302S380 221 423 174 481 83 537 9" />
            <path className="site-bike-cycle-route-center" d="M20 155C70 177 104 196 151 190S236 158 282 175 365 214 412 205 493 172 567 192M26 332C82 307 124 286 177 291S260 321 311 304 401 270 451 282 522 311 581 284M95 455C126 386 159 330 211 283S310 211 352 153 396 63 421 4M190 455C216 398 237 347 284 302S380 221 423 174 481 83 537 9" />
            <circle className="site-bike-road-node" cx="155" cy="128" r="4" /><circle className="site-bike-road-node" cx="318" cy="108" r="4.5" /><circle className="site-bike-road-node" cx="163" cy="285" r="4" /><circle className="site-bike-road-node" cx="327" cy="265" r="4.5" /><circle className="site-bike-road-node" cx="493" cy="290" r="4" />
          </g>
          <path className="site-bike-map-route-casing" d={SEOUL_SPLASH_PATH} />
          <path className="site-bike-map-boundary" d={SEOUL_SPLASH_PATH} />
        </svg>
        <svg className="site-bike-splash-mark" viewBox="0 0 128 76" focusable="false">
          <g className="site-bike-splash-wheel" transform="translate(25 51)"><circle r="19" /><path d="M-19 0h38M0-19v38M-13.4-13.4l26.8 26.8m0-26.8-26.8 26.8" /></g>
          <g className="site-bike-splash-wheel" transform="translate(103 51)"><circle r="19" /><path d="M-19 0h38M0-19v38M-13.4-13.4l26.8 26.8m0-26.8-26.8 26.8" /></g>
          <path className="site-bike-splash-frame" d="M25 51 50 20 70 51H25m25-31h25l28 31M70 51 75 20M45 15h13m17 5 5-9h10" />
          <circle className="site-bike-splash-hub" cx="50" cy="20" r="3" /><circle className="site-bike-splash-hub" cx="70" cy="51" r="3" />
        </svg>
      </div>
    </div>}
  </>
}

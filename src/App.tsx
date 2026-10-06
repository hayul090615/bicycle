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

type AppScreen = 'select' | 'text' | 'game' | 'result' | 'tour' | AuthPageKind
function screenFromUrl(): AppScreen {
  const params = new URLSearchParams(window.location.search)
  const page = params.get('page')
  if (page === 'login' || page === 'signup') return page
  if (page === 'typing') return 'select'
  return 'tour'
}
const HIGH_SCORE_KEY = 'seoul-typing-bike-high-score'
const PLAYED_STATIONS_KEY = 'seoul-typing-bike-played-stations-v1'
const GAME_THEME_KEY = 'seoul-typing-bike-light-mode'
const LEADERBOARD_KEY = 'seoul-typing-bike-leaderboard-v1'
type PlayedStations = Partial<Record<SeoulDistrict, string[]>>

function GameScreen({ course, playedStationIds, onHome, onResult, lightMode, onToggleTheme }: { course: DistrictCourse; playedStationIds: readonly string[]; onHome: () => void; onResult: (result: GameResultData) => void; lightMode: boolean; onToggleTheme: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const game = useTypingGame(course, onResult)
  const stationData = useBikeStations(course.district as SeoulDistrict)
  const overallProgress = ((game.stationIndex + game.segmentProgress) / (course.stations.length - 1)) * 100
  const upcomingStation = course.stations[game.stationIndex + 2]
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
  useEffect(() => { if (game.status === 'playing') inputRef.current?.focus() }, [game.status, game.stationIndex])
  const focusGame = (event: MouseEvent<HTMLElement>) => {
    if (game.status === 'playing' && !(event.target as HTMLElement).closest('button, input')) inputRef.current?.focus()
  }
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
            disabled={game.status !== 'playing'} timerStarted={game.hasStartedTyping} onValueChange={game.updateInput} onCompositionCommit={game.commitComposition}
            onSubmitAttempt={game.submitInput} />}
        </div>
        <div className="hud-station-card hud-station-card--next">
          <span><i className="station-card-icon station-card-icon--next" aria-hidden="true">➜</i>다음 대여소</span><strong>{upcomingStation?.name ?? '코스 도착'}</strong>
        </div>
      </div>
    </div>
    {game.status === 'countdown' && <Countdown value={game.countdown} courseTitle={course.title} stationName={game.currentStation.name} />}
    {game.status === 'paused' && <div className="pause-overlay" role="dialog" aria-modal="true" aria-label="일시 정지">
      <button type="button" className="pause-overlay-close" onClick={game.togglePause} aria-label="계속 달리기">×</button>
      <div className="pause-overlay-content"><h2>잠시 쉬어가요</h2></div>
    </div>}
  </main>
}

export default function App() {
  const [screen, setScreen] = useState<AppScreen>(screenFromUrl)
  const [showSiteSplash, setShowSiteSplash] = useState(true)
  const [lightMode, setLightMode] = useState(() => localStorage.getItem(GAME_THEME_KEY) !== 'false')
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
  const [selected, setSelected] = useState<SeoulDistrict | null>(null)
  const [runKey, setRunKey] = useState(0)
  const [result, setResult] = useState<GameResultData | null>(null)
  const [activeCourse, setActiveCourse] = useState<DistrictCourse | null>(null)
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
  const selectedCourse = selected ? districtCourses[selected] : undefined
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
    url.searchParams.set('page', 'typing')
    window.history.replaceState(null, '', url)
    setScreen('select'); setResult(null); setActiveCourse(null)
  }
  const openTours = () => {
    const url = new URL(window.location.href)
    url.searchParams.delete('page')
    url.searchParams.set('lang', 'en')
    window.history.replaceState(null, '', url)
    setScreen('tour')
  }
  const openToursWithStation = (stationId: string) => {
    try { localStorage.setItem('seoul-bike-selected-pickup-station', stationId) } catch { /* Continue to the route planner. */ }
    openTours()
    const url = new URL(window.location.href)
    url.searchParams.set('lang', 'ko')
    window.history.replaceState(null, '', url)
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
  const startGame = () => {
    if (!selected || !selectedCourse) return
    setActiveCourse(createDistrictCourse(selected, playedStations[selected] ?? []))
    setRunKey((value) => value + 1); setResult(null); setCurrentRankingId(null); setScreen('game')
  }
  let screenContent: ReactNode
  if (screen === 'game' && activeCourse) screenContent = <GameScreen key={runKey} course={activeCourse} playedStationIds={selected ? (playedStations[selected] ?? []) : []} onHome={goHome} onResult={handleResult} lightMode={lightMode} onToggleTheme={toggleTheme} />
  else if (screen === 'result' && activeCourse && result) screenContent = <GameResult district={activeCourse.district} result={result} highScore={highScore}
    totalStations={activeCourse.stations.length} leaderboard={leaderboard} currentRankingId={currentRankingId} onRetry={startGame} onHome={goHome} />
  else if (screen === 'tour') screenContent = <TouristGuide onBack={goHome} darkMode={!lightMode} onToggleTheme={toggleTheme} />
  else if (screen === 'login' || screen === 'signup') screenContent = <AuthPage key={screen} kind={screen} onHome={goHome} onNavigate={openAuth} />
  else if (screen === 'text') screenContent = <TextPractice district={selected} onDistrictChange={setSelected} onBack={goHome} />
  else screenContent = <DistrictSelector selected={selected} onSelect={setSelected} onStart={startGame} onOpenTours={openTours}
    onOpenToursWithStation={openToursWithStation}
    onOpenTextPractice={openTextPractice}
    onOpenAuth={openAuth}
    highScore={highScore} playedStations={playedStations} />

  return <>
    {screenContent}
    {showSiteSplash && <div className="site-bike-splash" role="status" aria-label="자전거로 즐기는 서울">
      <div className="site-bike-splash-scene" aria-hidden="true">
        <svg className="site-bike-splash-road" viewBox="0 0 360 180" focusable="false">
          <path className="site-bike-map-boundary" d="M36 18 61 10 89 16 112 8 139 15 163 9 190 15 217 8 244 16 271 11 299 19 326 17 347 32 342 55 353 76 344 98 352 120 339 141 343 157 319 169 292 164 269 173 242 165 216 174 190 166 163 174 138 165 111 172 87 164 62 169 41 157 22 159 13 140 19 119 9 98 17 77 11 56 20 37Z" />
          <path className="site-bike-road-bed site-bike-road-avenue" d="M5 42C43 47 63 31 96 35S146 54 179 43 231 27 261 39 315 58 356 43M4 133C39 119 66 139 99 128S151 105 181 120 231 149 265 132 316 111 356 128M38 178C63 151 77 122 105 101S149 76 174 58 218 28 239 2M112 181C128 155 143 133 169 115S211 84 233 65 271 34 300 4" />
          <path className="site-bike-road-bed site-bike-road-street" d="M26 23C39 41 49 57 45 77S30 112 39 145M70 13C83 34 83 51 76 69S62 105 70 128 89 153 95 168M119 12C108 32 106 50 117 67S137 93 128 111 108 142 119 166M157 12C171 30 177 48 166 67S145 98 157 116 182 142 177 166M205 13C193 31 192 48 203 65S226 94 215 112 192 141 203 165M250 14C261 31 260 47 250 65S233 95 246 113 269 143 260 166M296 18C282 37 281 53 292 71S315 101 304 119 286 143 292 163M18 65C48 74 66 88 91 82S133 58 158 70 196 96 220 84 266 60 293 73 326 91 348 82M13 104C42 91 67 99 91 111S133 135 159 123 194 97 219 107 263 133 289 121 325 99 349 109M52 17C58 37 62 51 58 68M99 20C94 39 96 55 108 72M143 18C151 37 151 52 140 70M187 19C180 37 183 52 195 69M234 21C225 38 228 54 240 70M278 22C270 39 275 55 286 71M320 26C309 43 313 58 326 73M31 149C52 132 66 119 91 120M82 161C100 142 114 128 137 129M147 161C161 144 178 133 197 135M213 161C227 145 245 132 265 135M277 157C294 140 312 128 333 133" />
          <path className="site-bike-road-center" d="M5 42C43 47 63 31 96 35S146 54 179 43 231 27 261 39 315 58 356 43M4 133C39 119 66 139 99 128S151 105 181 120 231 149 265 132 316 111 356 128M38 178C63 151 77 122 105 101S149 76 174 58 218 28 239 2M112 181C128 155 143 133 169 115S211 84 233 65 271 34 300 4" />
          <circle className="site-bike-road-node" cx="96" cy="35" r="3" /><circle className="site-bike-road-node" cx="179" cy="43" r="3.4" /><circle className="site-bike-road-node" cx="99" cy="128" r="3" /><circle className="site-bike-road-node" cx="181" cy="120" r="3.4" /><circle className="site-bike-road-node" cx="265" cy="132" r="3" />
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

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
    {game.status === 'paused' && <div className="pause-overlay" role="dialog" aria-modal="true"><div><span>Ⅱ</span><h2>잠시 쉬어가요</h2><p>시간도 함께 멈춰 있습니다.</p><button className="button button--primary" onClick={game.togglePause}>계속 달리기</button></div></div>}
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
          <path className="site-bike-road-bed site-bike-road-avenue" d="M-14 28 35 35 72 24 112 39 153 25 196 38 235 23 279 36 320 22 374 34M-12 91 31 79 72 94 111 78 151 94 191 78 232 94 273 77 312 94 373 75M-12 153 35 139 74 158 113 142 153 159 194 141 236 158 276 139 319 157 373 136" />
          <path className="site-bike-road-bed site-bike-road-street" d="M36-12 35 35 31 79 35 139 42 190M112-12 112 39 111 78 113 142 120 191M196-12 196 38 191 78 194 141 202 191M279-12 279 36 273 77 276 139 284 191M-12 54 72 24 72 94 74 158M72 24 153 25 151 94 153 159M153 25 235 23 232 94 236 158M235 23 320 22 312 94 319 157M31 79 72 94 113 78 151 94 191 78 232 94 273 77 312 94" />
          <path className="site-bike-road-center" d="M-14 28 35 35 72 24 112 39 153 25 196 38 235 23 279 36 320 22 374 34M-12 91 31 79 72 94 111 78 151 94 191 78 232 94 273 77 312 94 373 75M-12 153 35 139 74 158 113 142 153 159 194 141 236 158 276 139 319 157 373 136" />
          <circle className="site-bike-road-node" cx="72" cy="94" r="3.5" /><circle className="site-bike-road-node" cx="151" cy="94" r="3.5" /><circle className="site-bike-road-node" cx="232" cy="94" r="3.5" /><circle className="site-bike-road-node" cx="312" cy="94" r="3.5" />
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

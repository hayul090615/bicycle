import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { CourseMap } from './components/CourseMap'
import { Countdown } from './components/Countdown'
import { DistrictSelector } from './components/DistrictSelector'
import { GameHeader } from './components/GameHeader'
import { GameResult } from './components/GameResult'
import { TypingInput } from './components/TypingInput'
import { TextPractice } from './components/TextPractice'
import { TouristGuide } from './components/TouristGuide'
import { createDistrictCourse, districtCourses, type SeoulDistrict } from './data/districtCourses'
import { useTypingGame } from './hooks/useTypingGame'
import { useBikeStations } from './hooks/useBikeStations'
import type { DistrictCourse, GameResultData, LeaderboardEntry } from './types/game'

type AppScreen = 'select' | 'game' | 'result' | 'tour' | 'text'
const HIGH_SCORE_KEY = 'seoul-typing-bike-high-score'
const PLAYED_STATIONS_KEY = 'seoul-typing-bike-played-stations-v1'
const GAME_THEME_KEY = 'seoul-typing-bike-light-mode'
const LEADERBOARD_KEY = 'seoul-typing-bike-leaderboard-v1'
type PlayedStations = Partial<Record<SeoulDistrict, string[]>>

function GameScreen({ course, playedStationIds, onHome, onResult }: { course: DistrictCourse; playedStationIds: readonly string[]; onHome: () => void; onResult: (result: GameResultData) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const game = useTypingGame(course, onResult)
  const stationData = useBikeStations(course.district as SeoulDistrict)
  const [lightMode, setLightMode] = useState(() => localStorage.getItem(GAME_THEME_KEY) === 'true')
  const overallProgress = ((game.stationIndex + game.segmentProgress) / (course.stations.length - 1)) * 100
  const upcomingStation = course.stations[game.stationIndex + 2]
  const toggleTheme = () => setLightMode((current) => {
    localStorage.setItem(GAME_THEME_KEY, String(!current))
    return !current
  })
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
      progress={overallProgress} lightMode={lightMode} onToggleTheme={toggleTheme} />
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
  const [screen, setScreen] = useState<AppScreen>(() => ['en', 'ko'].includes(new URLSearchParams(window.location.search).get('lang') ?? '') ? 'tour' : 'select')
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
    window.history.replaceState(null, '', url)
    setScreen('select'); setResult(null); setActiveCourse(null)
  }
  const openTours = () => {
    const url = new URL(window.location.href)
    url.searchParams.set('lang', 'en')
    window.history.replaceState(null, '', url)
    setScreen('tour')
  }
  const openTextPractice = () => { if (selected) setScreen('text') }
  const startGame = () => {
    if (!selected || !selectedCourse) return
    setActiveCourse(createDistrictCourse(selected, playedStations[selected] ?? []))
    setRunKey((value) => value + 1); setResult(null); setCurrentRankingId(null); setScreen('game')
  }
  if (screen === 'game' && activeCourse) return <GameScreen key={runKey} course={activeCourse} playedStationIds={selected ? (playedStations[selected] ?? []) : []} onHome={goHome} onResult={handleResult} />
  if (screen === 'result' && activeCourse && result) return <GameResult district={activeCourse.district} result={result} highScore={highScore}
    totalStations={activeCourse.stations.length} leaderboard={leaderboard} currentRankingId={currentRankingId} onRetry={startGame} onHome={goHome} />
  if (screen === 'tour') return <TouristGuide onBack={goHome} />
  if (screen === 'text' && selected) return <TextPractice district={selected} onBack={() => setScreen('select')} />
  return <DistrictSelector selected={selected} onSelect={setSelected} onStart={startGame} onOpenTours={openTours}
    onOpenTextPractice={openTextPractice}
    highScore={highScore} playedStations={playedStations} />
}

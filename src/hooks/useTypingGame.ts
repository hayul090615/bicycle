import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DistrictCourse, GameResultData, GameStatus } from '../types/game'
import { analyzeInput, toCharacters } from '../utils/hangul'
import { useGameTimer } from './useGameTimer'

const HIGH_SCORE_KEY = 'seoul-typing-bike-high-score'

export function useTypingGame(course: DistrictCourse, onFinish: (result: GameResultData) => void) {
  const [status, setStatus] = useState<GameStatus>('countdown')
  const [countdown, setCountdown] = useState(3)
  const [stationIndex, setStationIndex] = useState(0)
  const [input, setInput] = useState('')
  const [score, setScore] = useState(0)
  const [combo, setCombo] = useState(0)
  const [bestCombo, setBestCombo] = useState(0)
  const [correctUnits, setCorrectUnits] = useState(0)
  const [wrongAttempts, setWrongAttempts] = useState(0)
  const [errorPulse, setErrorPulse] = useState(0)
  const [arrivalPulse, setArrivalPulse] = useState(0)
  const [segmentProgress, setSegmentProgress] = useState(0)
  const [compositionActive, setCompositionActive] = useState(false)
  const [hasStartedTyping, setHasStartedTyping] = useState(false)
  const [highScore, setHighScore] = useState(() => Number(localStorage.getItem(HIGH_SCORE_KEY) ?? 0))
  const maxPrefixRef = useRef(0)
  const correctUnitsRef = useRef(0)
  const resultSentRef = useRef(false)
  const arrivingRef = useRef(false)
  const lastCompletedValueRef = useRef('')
  const visualPrefixRef = useRef(0)
  const inputLengthRef = useRef(0)
  const acceptedInputRef = useRef('')
  const active = status === 'playing' && hasStartedTyping
  const { elapsedSeconds } = useGameTimer(active)
  const currentStation = course.stations[stationIndex]
  const nextStation = course.stations[stationIndex + 1]
  const targetText = nextStation?.typingName ?? nextStation?.name ?? ''
  const rawAnalysis = useMemo(() => analyzeInput(input, targetText), [input, targetText])
  const analysis = useMemo(() => {
    const stableAnalysis = !compositionActive || rawAnalysis.validPrefixLength >= visualPrefixRef.current
      ? rawAnalysis
      : {
          ...rawAnalysis,
          validPrefixLength: visualPrefixRef.current,
          progress: segmentProgress,
        }
    if (!stableAnalysis.isWrong) return stableAnalysis
    return { ...stableAnalysis, firstWrongIndex: -1, isWrong: false, isComplete: false }
  }, [compositionActive, rawAnalysis, segmentProgress])

  useEffect(() => {
    if (status !== 'countdown') return
    if (countdown === 0) {
      setStatus('playing')
      return
    }
    const timeoutId = window.setTimeout(() => setCountdown((value) => value - 1), 1000)
    return () => window.clearTimeout(timeoutId)
  }, [countdown, status])

  const buildResult = useCallback((
    completed: boolean,
    finalPassed = stationIndex,
    finalScore = score,
    finalCorrectUnits = correctUnits,
    finalCombo = combo,
    finalBestCombo = bestCombo,
  ): GameResultData => {
    const attempts = finalCorrectUnits + wrongAttempts
    const accuracy = attempts === 0 ? 100 : Math.round((finalCorrectUnits / attempts) * 100)
    const effectiveElapsed = Math.max(1, elapsedSeconds)
    return {
      completed, score: finalScore, accuracy, combo: finalCombo, bestCombo: finalBestCombo, passedStations: finalPassed,
      correctUnits: finalCorrectUnits, wrongAttempts, elapsedSeconds: effectiveElapsed,
      cpm: Math.round((finalCorrectUnits / effectiveElapsed) * 60),
    }
  }, [bestCombo, combo, correctUnits, elapsedSeconds, score, stationIndex, wrongAttempts])

  const finish = useCallback((completed: boolean, finalPassed?: number, finalScore?: number, finalCorrectUnits?: number, finalCombo?: number, finalBestCombo?: number) => {
    if (resultSentRef.current) return
    resultSentRef.current = true
    setStatus('finished')
    const result = buildResult(completed, finalPassed, finalScore, finalCorrectUnits, finalCombo, finalBestCombo)
    const nextHighScore = Math.max(highScore, result.score)
    localStorage.setItem(HIGH_SCORE_KEY, String(nextHighScore))
    setHighScore(nextHighScore)
    onFinish(result)
  }, [buildResult, highScore, onFinish])

  const arrive = useCallback((finalCorrectUnits = correctUnitsRef.current) => {
    if (!nextStation || arrivingRef.current) return
    arrivingRef.current = true
    const completedTarget = nextStation.typingName ?? nextStation.name
    const lengthBonus = toCharacters(completedTarget).length * 25
    const nextCombo = combo + 1
    const nextScore = score + 100 + lengthBonus + combo * 15
    const nextIndex = stationIndex + 1
    setScore(nextScore)
    setCombo(nextCombo)
    setBestCombo((value) => Math.max(value, nextCombo))
    setStationIndex(nextIndex)
    setInput('')
    setSegmentProgress(0)
    setCompositionActive(false)
    setArrivalPulse((value) => value + 1)
    maxPrefixRef.current = 0
    visualPrefixRef.current = 0
    inputLengthRef.current = 0
    acceptedInputRef.current = ''
    lastCompletedValueRef.current = completedTarget
    if (nextIndex === course.stations.length - 1) finish(true, nextIndex, nextScore, finalCorrectUnits, nextCombo, Math.max(bestCombo, nextCombo))
  }, [bestCombo, combo, course.stations.length, finish, nextStation, score, stationIndex])

  useEffect(() => {
    arrivingRef.current = false
  }, [stationIndex])

  const updateInput = useCallback((value: string, isComposing: boolean) => {
    if (status !== 'playing' || !nextStation) return acceptedInputRef.current
    // 한글 조합 확정을 위해 누른 스페이스는 게임 입력에서 제거한다.
    const sanitizedValue = value.replace(/\s+/gu, '')
    setCompositionActive(isComposing)
    const nextInputLength = toCharacters(sanitizedValue).length
    const deletedBackward = nextInputLength < inputLengthRef.current
    const target = nextStation.typingName ?? nextStation.name
    if (sanitizedValue === lastCompletedValueRef.current && sanitizedValue !== target) {
      // A completed Hangul composition can dispatch one last change event after
      // the station has already advanced. Ignore that stale value without
      // clearing input the player may have started for the new station.
      return acceptedInputRef.current
    }
    const nextAnalysis = analyzeInput(sanitizedValue, target)
    if (sanitizedValue.length > 0 && !nextAnalysis.isWrong) setHasStartedTyping(true)
    inputLengthRef.current = nextInputLength
    setInput(sanitizedValue)
    if (!nextAnalysis.isWrong) {
      acceptedInputRef.current = nextAnalysis.inputCharacters.slice(0, nextAnalysis.validPrefixLength).join('')
    }
    const visualPrefix = isComposing && !deletedBackward
      ? Math.max(visualPrefixRef.current, nextAnalysis.validPrefixLength)
      : nextAnalysis.validPrefixLength
    visualPrefixRef.current = visualPrefix
    setSegmentProgress(target.length === 0 ? 1 : visualPrefix / toCharacters(target).length)
    const addedUnits = Math.max(0, nextAnalysis.validPrefixLength - maxPrefixRef.current)
    if (addedUnits > 0) {
      correctUnitsRef.current += addedUnits
      setCorrectUnits((count) => count + addedUnits)
      maxPrefixRef.current = nextAnalysis.validPrefixLength
    }
    // 조합 중에도 완성형 음절에 맞춰 이동하되, 목적지 전환은 조합 종료 뒤 처리한다.
    if (nextAnalysis.isComplete && !isComposing) arrive(correctUnitsRef.current)
    return sanitizedValue
  }, [arrive, nextStation, status])

  const commitComposition = useCallback((value: string) => {
    if (status !== 'playing' || !nextStation) return acceptedInputRef.current
    const sanitizedValue = value.replace(/\s+/gu, '')
    setCompositionActive(false)
    const target = nextStation.typingName ?? nextStation.name
    if (sanitizedValue === lastCompletedValueRef.current && sanitizedValue !== target) return acceptedInputRef.current
    const committed = analyzeInput(sanitizedValue, target)
    if (committed.isWrong || committed.validPrefixLength < committed.inputCharacters.length) {
      const acceptedValue = acceptedInputRef.current
      const acceptedAnalysis = analyzeInput(acceptedValue, target)
      setInput(acceptedValue)
      visualPrefixRef.current = acceptedAnalysis.validPrefixLength
      inputLengthRef.current = toCharacters(acceptedValue).length
      setSegmentProgress(acceptedAnalysis.progress)
      return acceptedValue
    }
    setInput(sanitizedValue)
    acceptedInputRef.current = sanitizedValue
    visualPrefixRef.current = committed.validPrefixLength
    inputLengthRef.current = toCharacters(sanitizedValue).length
    setSegmentProgress(committed.progress)
    if (committed.isComplete) {
      arrive(correctUnitsRef.current)
    }
    return sanitizedValue
  }, [arrive, nextStation, status])

  const submitInput = useCallback((value: string) => {
    if (status !== 'playing' || !nextStation) return
    const sanitizedValue = value.replace(/\s+/gu, '')
    const target = nextStation.typingName ?? nextStation.name
    const submitted = analyzeInput(sanitizedValue, target)
    setCompositionActive(false)
    if (submitted.isComplete) {
      arrive(correctUnitsRef.current)
      return
    }
    if (!submitted.isWrong) return
    setInput('')
    setSegmentProgress(0)
    visualPrefixRef.current = 0
    maxPrefixRef.current = 0
    inputLengthRef.current = 0
    acceptedInputRef.current = ''
    setWrongAttempts((count) => count + 1)
    setCombo(0)
    setErrorPulse((pulse) => pulse + 1)
  }, [arrive, nextStation, status])

  const togglePause = () => setStatus((value) => value === 'playing' ? 'paused' : 'playing')
  const attempts = correctUnits + wrongAttempts
  const accuracy = attempts === 0 ? 100 : Math.round((correctUnits / attempts) * 100)

  return {
    status, countdown, stationIndex, currentStation, nextStation, targetText, input, analysis, segmentProgress, hasStartedTyping,
    score, combo, bestCombo, accuracy, correctUnits, wrongAttempts,
    elapsedSeconds, highScore, errorPulse, arrivalPulse,
    updateInput, commitComposition, submitInput, togglePause,
  }
}

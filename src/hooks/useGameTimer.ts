import { useEffect, useState } from 'react'

export function useGameTimer(durationSeconds: number, active: boolean) {
  const [remainingSeconds, setRemainingSeconds] = useState(durationSeconds)
  useEffect(() => {
    if (!active) return
    const intervalId = window.setInterval(() => setRemainingSeconds((current) => Math.max(0, current - 1)), 1000)
    return () => window.clearInterval(intervalId)
  }, [active])
  return { remainingSeconds, elapsedSeconds: durationSeconds - remainingSeconds }
}

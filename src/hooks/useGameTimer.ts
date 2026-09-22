import { useEffect, useState } from 'react'

export function useGameTimer(active: boolean) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  useEffect(() => {
    if (!active) return
    const intervalId = window.setInterval(() => setElapsedSeconds((current) => current + 1), 1000)
    return () => window.clearInterval(intervalId)
  }, [active])
  return { elapsedSeconds }
}

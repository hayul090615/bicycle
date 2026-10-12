/**
 * 실제로 타이핑을 진행하는 동안에만 경과 초를 증가시킨다. 게임이 멈추거나 컴포넌트가 종료되면 interval을 해제한다.
 */
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

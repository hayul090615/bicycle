/**
 * 실제로 타이핑을 진행하는 동안에만 경과 초를 증가시킨다. 게임이 멈추거나 컴포넌트가 종료되면 일정 시간마다 실행하던 작업을 멈춘다.
 */
import { useEffect, useState } from 'react'

export function useGameTimer(active: boolean) {
  // useState는 화면에 필요한 값을 기억한다. set으로 시작하는 함수를 부르면 새 값으로 화면도 바뀐다.
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  // 화면이 열리거나 대괄호 안의 값이 바뀌면 실행한다. return 안의 함수는 이전 작업을 정리할 때 실행된다.
  useEffect(() => {
    if (!active) return
    const intervalId = window.setInterval(() => setElapsedSeconds((current) => current + 1), 1000)
    return () => window.clearInterval(intervalId)
  }, [active])
  return { elapsedSeconds }
}

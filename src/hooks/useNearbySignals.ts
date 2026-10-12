/** 신호등 버튼이 켜져 있을 때만 주변 자료를 찾고, 지도를 옮기면 다시 찾는다. */
import { useEffect, useState } from 'react'
import { fetchNearbySignals, type RouteCondition } from '../services/routeConditions'
export function useNearbySignals(enabled: boolean, center: { lat: number; lng: number }) {
  const key = `${center.lat.toFixed(4)}:${center.lng.toFixed(4)}`
  // useState는 화면에 필요한 값을 기억한다. set으로 시작하는 함수를 부르면 새 값으로 화면도 바뀐다.
  const [data, setData] = useState<{ key: string; places: RouteCondition[]; status: 'loading' | 'ready' | 'error' } | null>(null)
  // 화면이 열리거나 대괄호 안의 값이 바뀌면 실행한다. return 안의 함수는 이전 작업을 정리할 때 실행된다.
  useEffect(() => {
    if (!enabled) { setData(null); return }
    const controller = new AbortController()
    setData({ key, places: [], status: 'loading' })
    const delay = window.setTimeout(() => {
      void fetchNearbySignals(center, controller.signal).then(places => {
        if (!controller.signal.aborted) setData({ key, places, status: 'ready' })
      }).catch(() => {
        if (!controller.signal.aborted) setData({ key, places: [], status: 'error' })
      })
    }, 350)
    return () => { window.clearTimeout(delay); controller.abort() }
  }, [enabled, key])
  return data?.key === key && enabled ? data : { key, places: [], status: enabled ? 'loading' : 'idle' }
}

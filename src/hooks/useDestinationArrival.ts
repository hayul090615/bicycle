/**
 * 실제 GPS에 대한 도착 판정 상태를 유지한다. 오래되거나 부정확한 관측은 제외하고 목적지 근처의 연속 관측을 확인한 뒤 목적지마다 한 번 안내한다.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

type Location = { lat: number; lng: number; accuracy?: number; timestamp?: number }

/** 실제 GPS 위치와 목적지 사이의 지표면 거리를 미터로 계산한다. */
function gapMeters(first: Location, second: Location) {
  const scale = Math.PI / 180
  const latitude = (second.lat - first.lat) * scale
  const longitude = (second.lng - first.lng) * scale
  const angle = Math.sin(latitude / 2) ** 2 + Math.cos(first.lat * scale) * Math.cos(second.lat * scale) * Math.sin(longitude / 2) ** 2
  return 12_742_000 * Math.asin(Math.min(1, Math.sqrt(angle)))
}

export function useDestinationArrival({ destinationKey, destination, location, enabled }: {
  destinationKey: string | null
  destination: Location
  location: Location | null
  enabled: boolean
}) {
  // useState는 화면에 필요한 값을 기억한다. set으로 시작하는 함수를 부르면 새 값으로 화면도 바뀐다.
  const [open, setOpen] = useState(false)
  // 도착지별로 출발했는지, 몇 초 동안 가까이 있었는지, 이미 안내했는지를 기억한다.
  const trip = useRef({ key: null as string | null, armed: false, nearbySince: null as number | null, arrived: false, lastFix: 0 })
  // 화면이 열리거나 대괄호 안의 값이 바뀌면 실행한다. return 안의 함수는 이전 작업을 정리할 때 실행된다.
  useEffect(() => {
    if (trip.current.key !== destinationKey) {
      trip.current = { key: destinationKey, armed: false, nearbySince: null, arrived: false, lastFix: 0 }
      setOpen(false)
    }
    const state = trip.current
    // 거리 사진을 옮기는 것은 실제 이동이 아니다. 정확하고 최근에 받은 GPS만 도착 확인에 쓴다.
    if (!destinationKey || !enabled || !location
      || ![location.lat, location.lng, location.accuracy, location.timestamp, destination.lat, destination.lng].every(value => typeof value === 'number' && Number.isFinite(value))
      || location.accuracy! < 0 || location.accuracy! > 15
      || Date.now() - location.timestamp! > 15_000 || location.timestamp! > Date.now() + 1000) {
      state.nearbySince = null
      return
    }
    if (state.arrived) return
    // 같은 시각의 위치를 여러 번 받아도 새 위치로 세지 않는다.
    if (location.timestamp! <= state.lastFix) return
    if (location.timestamp! - state.lastFix > 10_000) state.nearbySince = null
    state.lastFix = location.timestamp!
    const distance = gapMeters(location, destination)
    // 처음부터 목적지 근처에 있던 경우를 피하려고, 45m 밖에서 출발한 기록부터 확인한다.
    if (distance >= 45) state.armed = true
    if (!state.armed || distance > 12 || distance + location.accuracy! > 20) { state.nearbySince = null; return }
    const now = location.timestamp!
    if (state.nearbySince === null) state.nearbySince = now
    // 가까운 위치가 3초 이상 이어져야 잠깐 튄 GPS 때문에 안내가 뜨지 않는다.
    else if (now - state.nearbySince >= 3000) {
      state.arrived = true
      setOpen(true)
    }
  }, [destinationKey, destination.lat, destination.lng, enabled, location])
  // 다른 화면에 전달할 함수를 기억한다. 대괄호 안의 값이 바뀌면 함수를 새로 만든다.
  const dismiss = useCallback(() => setOpen(false), [])
  return { open, dismiss }
}

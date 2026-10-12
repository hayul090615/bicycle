/** 지도를 옮긴 뒤 잠깐 기다렸다가 새 위치의 장소를 찾는다. 오래된 검색 결과는 지운다. */
import { useEffect, useMemo, useState } from 'react'
import { fetchNearbyPlaces, type NearbyPlaceCategory, type NearbyPlacesResult } from '../services/nearbyPlaces'
import { metersBetween } from '../services/nearbyBikes'
import { MAP_NEARBY_RADIUS_METERS } from '../services/nearbyPlaces'

const EMPTY = { places: [], region: '서울', blogsAvailable: false, blogs: [] } as NearbyPlacesResult
export function useNearbyPlaces(category: NearbyPlaceCategory | null, center: { lat: number; lng: number }) {
  const key = category ? `${category}:${center.lat.toFixed(4)}:${center.lng.toFixed(4)}` : null
  // useState는 화면에 필요한 값을 기억한다. set으로 시작하는 함수를 부르면 새 값으로 화면도 바뀐다.
  const [data, setData] = useState<{ key: string; result: NearbyPlacesResult; status: 'loading' | 'ready' | 'error' } | null>(null)
  // 화면이 열리거나 대괄호 안의 값이 바뀌면 실행한다. return 안의 함수는 이전 작업을 정리할 때 실행된다.
  useEffect(() => {
    if (!category || !key) { setData(null); return }
    const controller = new AbortController()
    let timeout = 0
    setData({ key, result: EMPTY, status: 'loading' })
    const delay = window.setTimeout(() => {
      // 검색이 오래 걸리면 기다리는 표시를 끝낸 뒤 검색을 중단한다.
      timeout = window.setTimeout(() => {
        setData({ key, result: EMPTY, status: 'error' })
        controller.abort()
      }, 14000)
      void fetchNearbyPlaces(category, center, controller.signal).then(result => {
        if (!controller.signal.aborted) setData({ key, result, status: 'ready' })
      }).catch(() => {
        if (!controller.signal.aborted) setData({ key, result: EMPTY, status: 'error' })
      }).finally(() => window.clearTimeout(timeout))
    }, 350)
    return () => { window.clearTimeout(delay); window.clearTimeout(timeout); controller.abort() }
  }, [key])
  const current = data?.key === key ? data : null
  const result = current?.result ?? EMPTY
  // 이전 검색 결과를 재사용할 때도 현재 지도 중심에서 500m인지 다시 계산한다.
  // 같은 입력이면 전에 계산한 값을 다시 쓴다. 대괄호 안의 값이 바뀔 때만 새로 계산한다.
  const places = useMemo(() => result.places.map(place => ({ ...place, distanceMeters: metersBetween(center, place) }))
    .filter(place => place.distanceMeters <= MAP_NEARBY_RADIUS_METERS), [result.places, center.lat, center.lng])
  return { ...result, places, status: current?.status ?? (category ? 'loading' : 'idle') }
}

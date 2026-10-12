/**
 * 선택 자치구의 대여소 데이터를 관리한다. 기본 미리 저장해 둔 자료을 즉시 제공하고 API가 설정되면 실시간 결과로 바꾸며 실패 시 기본 자료를 유지한다.
 */
import { useEffect, useState } from 'react'
import type { BikeStation } from '../types/game'
import { bundledBikeStations, fetchDistrictStations } from '../services/seoulBikeApi'
import type { SeoulDistrict } from '../data/districtCourses'

export type StationDataStatus = 'snapshot' | 'loading' | 'live' | 'fallback'

export function useBikeStations(district: SeoulDistrict) {
  const apiKey = import.meta.env.VITE_SEOUL_API_KEY?.trim()
  const bundledDistrictStations = bundledBikeStations.filter((station) => station.district === district)
  // useState는 화면에 필요한 값을 기억한다. set으로 시작하는 함수를 부르면 새 값으로 화면도 바뀐다.
  const [stations, setStations] = useState<BikeStation[]>(bundledDistrictStations)
  const [status, setStatus] = useState<StationDataStatus>(apiKey ? 'loading' : 'snapshot')

  // 화면이 열리거나 대괄호 안의 값이 바뀌면 실행한다. return 안의 함수는 이전 작업을 정리할 때 실행된다.
  useEffect(() => {
    if (!apiKey) return
    let active = true
    setStations(bundledDistrictStations)
    fetchDistrictStations(apiKey, district)
      .then((nextStations) => {
        if (!active || nextStations.length === 0) return
        setStations(nextStations)
        setStatus('live')
      })
      .catch(() => {
        if (active) setStatus('fallback')
      })
    return () => { active = false }
  }, [apiKey, district])

  return { stations, status }
}

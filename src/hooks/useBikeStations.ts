/**
 * 선택 자치구의 대여소 데이터를 관리한다. 기본 스냅샷을 즉시 제공하고 API가 설정되면 실시간 결과로 바꾸며 실패 시 기본 자료를 유지한다.
 */
import { useEffect, useState } from 'react'
import type { BikeStation } from '../types/game'
import { bundledBikeStations, fetchDistrictStations } from '../services/seoulBikeApi'
import type { SeoulDistrict } from '../data/districtCourses'

export type StationDataStatus = 'snapshot' | 'loading' | 'live' | 'fallback'

export function useBikeStations(district: SeoulDistrict) {
  const apiKey = import.meta.env.VITE_SEOUL_API_KEY?.trim()
  const bundledDistrictStations = bundledBikeStations.filter((station) => station.district === district)
  const [stations, setStations] = useState<BikeStation[]>(bundledDistrictStations)
  const [status, setStatus] = useState<StationDataStatus>(apiKey ? 'loading' : 'snapshot')

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

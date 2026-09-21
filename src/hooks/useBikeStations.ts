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

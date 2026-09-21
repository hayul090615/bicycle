import type { BikeStation } from '../types/game'
import { allBikeStations, stationSnapshotMeta, type SeoulDistrict } from '../data/districtCourses'

interface SeoulStationRow {
  STA_LOC: string
  RENT_NO: string
  RENT_NM: string
  STA_ADD1: string
  STA_LAT: string
  STA_LONG: string
  HOLD_NUM: string
}

interface SeoulStationResponse {
  stationInfo?: {
    list_total_count: string
    RESULT: { CODE: string; MESSAGE: string }
    row: SeoulStationRow[]
  }
  RESULT?: { CODE: string; MESSAGE: string }
}

export const bundledBikeStations = allBikeStations
export { stationSnapshotMeta }

const mapRow = (row: SeoulStationRow): BikeStation => ({
  id: row.RENT_NO,
  name: row.RENT_NM.trim(),
  district: row.STA_LOC.trim(),
  address: row.STA_ADD1.trim(),
  lat: Number(row.STA_LAT),
  lng: Number(row.STA_LONG),
  docks: Number(row.HOLD_NUM || 0),
})

async function fetchPage(apiKey: string, start: number, end: number) {
  const response = await fetch(`/seoul-api/${encodeURIComponent(apiKey)}/json/tbCycleStationInfo/${start}/${end}/`)
  if (!response.ok) throw new Error(`서울시 API 응답 오류 (${response.status})`)
  const data = await response.json() as SeoulStationResponse
  if (!data.stationInfo) throw new Error(data.RESULT?.MESSAGE ?? '서울시 대여소 데이터를 읽을 수 없습니다.')
  return data.stationInfo
}

export async function fetchDistrictStations(apiKey: string, district: SeoulDistrict): Promise<BikeStation[]> {
  const first = await fetchPage(apiKey, 1, 1000)
  const pages = [first]
  const total = Number(first.list_total_count)
  for (let start = 1001; start <= total; start += 1000) {
    pages.push(await fetchPage(apiKey, start, Math.min(total, start + 999)))
  }
  return pages.flatMap((page) => page.row)
    .filter((row) => row.STA_LOC.trim() === district)
    .map(mapRow)
    .filter((station) => Number.isFinite(station.lat) && Number.isFinite(station.lng))
}

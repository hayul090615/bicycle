import stationData from './seoulBikeStations.json'
import type { BikeStation, DistrictCourse, Station } from '../types/game'
import { districtFeatureMap, getFeatureRings } from './districtGeoData'

export const SEOUL_DISTRICTS = [
  '강남구', '강동구', '강북구', '강서구', '관악구',
  '광진구', '구로구', '금천구', '노원구', '도봉구',
  '동대문구', '동작구', '마포구', '서대문구', '서초구',
  '성동구', '성북구', '송파구', '양천구', '영등포구',
  '용산구', '은평구', '종로구', '중구', '중랑구',
] as const

export type SeoulDistrict = (typeof SEOUL_DISTRICTS)[number]
export const allBikeStations = stationData.stations as BikeStation[]
export const stationSnapshotMeta = { source: stationData.source, sourceDate: stationData.sourceDate }

const distance = (a: BikeStation, b: BikeStation) =>
  Math.hypot(a.lat - b.lat, (a.lng - b.lng) * Math.cos((a.lat * Math.PI) / 180))

function makeTypingName(name: string) {
  const subway = name.match(/^(.+?)역\s*(?:\d+번)?\s*출구/u)
  if (subway) return subway[1].replace(/\s+/gu, '')
  return name
    .replace(/\([^)]*\)/gu, '')
    .replace(/\s*(?:앞|인근|맞은편|건너편)$/u, '')
    .replace(/\s+/gu, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
}

function makeDetailedTypingName(name: string) {
  return name
    .replace(/\([^)]*\)/gu, '')
    .replace(/\s+/gu, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
}

function makeDistrictTypingNames(stations: BikeStation[]) {
  const shortNames = stations.map((station) => makeTypingName(station.name))
  const shortNameCounts = new Map<string, number>()
  shortNames.forEach((name) => shortNameCounts.set(name, (shortNameCounts.get(name) ?? 0) + 1))

  const usedNames = new Set<string>()
  return new Map(stations.map((station, index) => {
    const shortName = shortNames[index]
    const detailedName = makeDetailedTypingName(station.name)
    let typingName = (shortNameCounts.get(shortName) ?? 0) > 1 ? detailedName : shortName
    if (usedNames.has(typingName)) typingName = `${detailedName}${station.id}`
    usedNames.add(typingName)
    return [station.id, typingName]
  }))
}

function isPointInRing(lng: number, lat: number, ring: [number, number][]) {
  let inside = false
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current, current += 1) {
    const [currentLng, currentLat] = ring[current]
    const [previousLng, previousLat] = ring[previous]
    const crossesLatitude = (currentLat > lat) !== (previousLat > lat)
    const crossingLng = ((previousLng - currentLng) * (lat - currentLat)) / (previousLat - currentLat || Number.EPSILON) + currentLng
    if (crossesLatitude && lng < crossingLng) inside = !inside
  }
  return inside
}

function isStationInsideDistrict(station: BikeStation, district: SeoulDistrict) {
  const tolerance = 0.0011
  const longitudeScale = Math.cos((station.lat * Math.PI) / 180)
  return getFeatureRings(districtFeatureMap[district]).some((ring) => {
    if (isPointInRing(station.lng, station.lat, ring)) return true
    return ring.some((point, index) => {
      const next = ring[(index + 1) % ring.length]
      const startX = (point[0] - station.lng) * longitudeScale
      const startY = point[1] - station.lat
      const endX = (next[0] - station.lng) * longitudeScale
      const endY = next[1] - station.lat
      const deltaX = endX - startX
      const deltaY = endY - startY
      const lengthSquared = deltaX * deltaX + deltaY * deltaY
      const ratio = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, -(startX * deltaX + startY * deltaY) / lengthSquared))
      return Math.hypot(startX + deltaX * ratio, startY + deltaY * ratio) <= tolerance
    })
  })
}

function uncrossRoute(route: BikeStation[], lockedPrefixCount = 1) {
  const optimized = [...route]
  let changed = true
  let passes = 0

  while (changed && passes < optimized.length * 2) {
    changed = false
    passes += 1
    for (let start = Math.max(1, lockedPrefixCount); start < optimized.length - 1; start += 1) {
      for (let end = start + 1; end < optimized.length; end += 1) {
        const beforeStart = optimized[start - 1]
        const segmentStart = optimized[start]
        const segmentEnd = optimized[end]
        const afterEnd = optimized[end + 1]
        const currentDistance = distance(beforeStart, segmentStart) + (afterEnd ? distance(segmentEnd, afterEnd) : 0)
        const reversedDistance = distance(beforeStart, segmentEnd) + (afterEnd ? distance(segmentStart, afterEnd) : 0)
        if (reversedDistance + Number.EPSILON < currentDistance) {
          optimized.splice(start, end - start + 1, ...optimized.slice(start, end + 1).reverse())
          changed = true
        }
      }
    }
  }
  return optimized
}

function pickNearbyRoute(stations: BikeStation[], count = stations.length, seed: BikeStation[] = []) {
  const selectedIds = new Set(seed.map((station) => station.id))
  const available = stations.filter((station) => !selectedIds.has(station.id))
  const route = [...seed]
  if (route.length === 0 && available.length > 0) {
    const first = available.reduce((north, station) => station.lat > north.lat ? station : north)
    route.push(first)
    available.splice(available.indexOf(first), 1)
  }
  while (route.length < count && available.length > 0) {
    const current = route.at(-1)!
    const next = available.reduce((nearest, station) => distance(current, station) < distance(current, nearest) ? station : nearest)
    route.push(next)
    available.splice(available.indexOf(next), 1)
  }
  return route.length <= 40 ? uncrossRoute(route, seed.length) : route
}

function toCourseStation(station: BikeStation, index: number, typingName: string): Station {
  return {
    ...station,
    name: `${station.id}. ${station.name}`,
    typingName,
    x: 8 + index * 17,
    y: 12 + index * 7,
  }
}

export function createDistrictCourse(district: SeoulDistrict, playedStationIds: readonly string[] = []): DistrictCourse {
  const taggedStations = allBikeStations.filter((station) => station.district === district)
  const boundaryStations = taggedStations.filter((station) => isStationInsideDistrict(station, district))
  const districtStations = boundaryStations.length >= 2 ? boundaryStations : taggedStations
  const playedIds = new Set(playedStationIds)
  const unplayedStations = districtStations.filter((station) => !playedIds.has(station.id))
  const targetsPerCourse = Math.ceil(Math.max(1, districtStations.length - 1) / 3)
  const restarting = unplayedStations.length === 0
  const previousFinish = !restarting ? districtStations.find((station) => station.id === playedStationIds.at(-1)) : undefined
  const stationPool = restarting ? districtStations : unplayedStations
  const selectedStations = pickNearbyRoute(
    stationPool,
    Math.min(targetsPerCourse + 1, stationPool.length + (previousFinish ? 1 : 0)),
    previousFinish ? [previousFinish] : [],
  )
  const typingNames = makeDistrictTypingNames(districtStations)
  const playedInDistrict = districtStations.filter((station) => playedIds.has(station.id)).length
  const completedTargets = Math.max(0, playedInDistrict - 1)
  const coursePart = restarting ? 1 : Math.min(3, Math.floor(completedTargets / targetsPerCourse) + 1)
  return {
    district,
    title: `${district} 따릉이 타자 코스 ${coursePart}/3`,
    description: `${district}의 실제 따릉이 대여소를 세 코스로 나누어 달립니다.`,
    durationSeconds: Math.max(180, selectedStations.length * 4),
    isSample: false,
    source: stationData.source,
    sourceDate: stationData.sourceDate,
    stations: selectedStations.map((station, index) => toCourseStation(station, index, typingNames.get(station.id) ?? makeDetailedTypingName(station.name))),
  }
}

export const districtCourses = Object.fromEntries(
  SEOUL_DISTRICTS.map((district) => [district, createDistrictCourse(district)]),
) as Record<SeoulDistrict, DistrictCourse>

export type CourseDifficulty = '쉬움' | '보통' | '어려움'

const rankedDistricts = SEOUL_DISTRICTS.map((district) => {
  const targets = districtCourses[district].stations.slice(1)
  const averageLength = targets.reduce((sum, station) =>
    sum + Array.from(station.typingName ?? station.name).length, 0) / Math.max(targets.length, 1)
  return { district, averageLength }
}).sort((a, b) => a.averageLength - b.averageLength)

export const districtDifficultyMap = Object.fromEntries(
  rankedDistricts.map(({ district }, index) => [
    district,
    index < 8 ? '쉬움' : index >= rankedDistricts.length - 8 ? '어려움' : '보통',
  ]),
) as Record<SeoulDistrict, CourseDifficulty>

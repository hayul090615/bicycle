import { allBikeStations } from './districtCourses'
import type { BikeStation } from '../types/game'

export interface TouristStop {
  place: string
  detail: string
  stationId: string
}

export interface TouristRoute {
  id: string
  title: string
  area: string
  summary: string
  suggestedTime: string
  source: string
  stops: TouristStop[]
}

// Stops are matched to the city's June 2026 station snapshot. Lines between them
// are a sightseeing preview, not turn-by-turn bicycle directions.
export const touristRoutes: TouristRoute[] = [
  {
    id: 'yeouido',
    title: 'Yeouido river & park',
    area: 'Easy city ride',
    summary: 'Start by the Hangang, pause in Yeouido Park, and finish near the National Assembly.',
    suggestedTime: '60–90 min with stops',
    source: 'https://english.visitseoul.net/tours/Explore-Seoul-on-a-Seoul-Bike/18469',
    stops: [
      { place: 'Yeouinaru & Hangang Park', detail: 'Pick up a bike near the riverside entrance.', stationId: '5890' },
      { place: 'Yeouido Park', detail: 'Park the bike before exploring the footpaths.', stationId: '5853' },
      { place: 'National Assembly area', detail: 'Finish by the National Assembly subway stop.', stationId: '203' },
    ],
  },
  {
    id: 'seoul-forest',
    title: 'Seoul Forest to Ttukseom',
    area: 'Green & riverside',
    summary: 'Combine a walk in Seoul Forest with a ride toward Ttukseom Hangang Park.',
    suggestedTime: '75–105 min with stops',
    source: 'https://english.visitseoul.net/yongsan%26yeouido-area/Hangang-River-Cycling-Trail/ENP002871',
    stops: [
      { place: 'Seoul Forest', detail: 'Walk the shaded park paths after docking.', stationId: '3552' },
      { place: 'Seongsu neighborhood', detail: 'Take a break around Seoul Forest Station.', stationId: '4389' },
      { place: 'Ttukseom Hangang Park', detail: 'Enjoy the river and return the bike.', stationId: '5153' },
    ],
  },
  {
    id: 'banpo',
    title: 'Banpo & Jamwon',
    area: 'Late afternoon',
    summary: 'A relaxed neighborhood ride with time to walk toward the Hangang parks.',
    suggestedTime: '60–90 min with stops',
    source: 'https://english.visitseoul.net/nature/things-to-do-at-hangang-park-a-place-beloved-by-seoulites_/31268',
    stops: [
      { place: 'Sinbanpo', detail: 'Start at the station near Sinbanpo Station.', stationId: '2214' },
      { place: 'Banpo neighborhood', detail: 'Pause for food or a short walk.', stationId: '2524' },
      { place: 'Jamwon', detail: 'Return the bike before walking toward the river.', stationId: '2259' },
    ],
  },
]

const stationById = new Map(allBikeStations.map((station) => [station.id, station]))

export function getTouristStation(stationId: string): BikeStation {
  const station = stationById.get(stationId)
  if (!station) throw new Error(`Unknown tourist station: ${stationId}`)
  return station
}

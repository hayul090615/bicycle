import { allBikeStations } from './districtCourses'
import type { BikeStation } from '../types/game'

export interface TouristStop {
  place: string
  placeKo: string
  detail: string
  detailKo: string
  stationId: string
}

export type TourCategory = 'sightseeing' | 'fitness' | 'night' | 'seasonal'
export type TourSeason = 'spring' | 'summer' | 'autumn' | 'winter'

export interface TouristRoute {
  id: string
  category: TourCategory
  season?: TourSeason
  title: string
  titleKo: string
  area: string
  areaKo: string
  summary: string
  summaryKo: string
  suggestedTime: string
  suggestedTimeKo: string
  distance?: string
  source: string
  stops: TouristStop[]
}

// Stops are matched to the city's June 2026 station snapshot. Lines between them
// are a sightseeing preview, not turn-by-turn bicycle directions.
export const touristRoutes: TouristRoute[] = [
  {
    id: 'yeouido',
    category: 'sightseeing',
    title: 'Yeouido river & park',
    titleKo: '여의도 한강·공원 코스',
    area: 'Easy city ride',
    areaKo: '도심 산책형',
    summary: 'Start by the Hangang, pause in Yeouido Park, and finish near the National Assembly.',
    summaryKo: '한강에서 출발해 여의도공원에 들르고 국회의사당 근처에서 마무리합니다.',
    suggestedTime: '60–90 min with stops',
    suggestedTimeKo: '관광 포함 60~90분',
    source: 'https://english.visitseoul.net/tours/Explore-Seoul-on-a-Seoul-Bike/18469',
    stops: [
      { place: 'Yeouinaru & Hangang Park', placeKo: '여의나루·한강공원', detail: 'Pick up a bike near the riverside entrance.', detailKo: '한강공원 입구 가까운 대여소에서 출발하세요.', stationId: '5890' },
      { place: 'Yeouido Park', placeKo: '여의도공원', detail: 'Park the bike before exploring the footpaths.', detailKo: '공원 산책로를 둘러볼 때는 대여소에 반납하세요.', stationId: '5853' },
      { place: 'National Assembly area', placeKo: '국회의사당 일대', detail: 'Finish by the National Assembly subway stop.', detailKo: '국회의사당역 근처 대여소에서 마무리합니다.', stationId: '203' },
    ],
  },
  {
    id: 'seoul-forest',
    category: 'sightseeing',
    title: 'Seoul Forest to Ttukseom',
    titleKo: '서울숲에서 뚝섬까지',
    area: 'Green & riverside',
    areaKo: '숲과 한강',
    summary: 'Combine a walk in Seoul Forest with a ride toward Ttukseom Hangang Park.',
    summaryKo: '서울숲을 산책하고 뚝섬한강공원 쪽으로 이어지는 코스입니다.',
    suggestedTime: '75–105 min with stops',
    suggestedTimeKo: '관광 포함 75~105분',
    source: 'https://english.visitseoul.net/yongsan%26yeouido-area/Hangang-River-Cycling-Trail/ENP002871',
    stops: [
      { place: 'Seoul Forest', placeKo: '서울숲', detail: 'Walk the shaded park paths after docking.', detailKo: '자전거를 반납한 뒤 그늘진 공원 산책로를 둘러보세요.', stationId: '3552' },
      { place: 'Seongsu neighborhood', placeKo: '성수동', detail: 'Take a break around Seoul Forest Station.', detailKo: '서울숲역 주변에서 쉬어가기 좋습니다.', stationId: '4389' },
      { place: 'Ttukseom Hangang Park', placeKo: '뚝섬한강공원', detail: 'Enjoy the river and return the bike.', detailKo: '한강을 감상하고 지정 대여소에 반납하세요.', stationId: '5153' },
    ],
  },
  {
    id: 'banpo',
    category: 'sightseeing',
    title: 'Banpo & Jamwon',
    titleKo: '반포·잠원 코스',
    area: 'Late afternoon',
    areaKo: '오후 나들이',
    summary: 'A relaxed neighborhood ride with time to walk toward the Hangang parks.',
    summaryKo: '동네길을 여유롭게 달리고 한강공원 쪽은 걸어서 둘러보는 코스입니다.',
    suggestedTime: '60–90 min with stops',
    suggestedTimeKo: '관광 포함 60~90분',
    source: 'https://english.visitseoul.net/nature/things-to-do-at-hangang-park-a-place-beloved-by-seoulites_/31268',
    stops: [
      { place: 'Sinbanpo', placeKo: '신반포', detail: 'Start at the station near Sinbanpo Station.', detailKo: '신반포역 가까운 대여소에서 출발합니다.', stationId: '2214' },
      { place: 'Banpo neighborhood', placeKo: '반포동', detail: 'Pause for food or a short walk.', detailKo: '식사하거나 주변을 산책하며 쉬어가세요.', stationId: '2524' },
      { place: 'Jamwon', placeKo: '잠원', detail: 'Return the bike before walking toward the river.', detailKo: '자전거를 반납한 뒤 한강 쪽으로 걸어가세요.', stationId: '2259' },
    ],
  },
  {
    id: 'river-training',
    category: 'fitness',
    title: 'Banpo to Mapo river ride',
    titleKo: '반포에서 마포까지 한강 라이딩',
    area: '16.4 km · mostly flat',
    areaKo: '16.4km · 대부분 평지',
    summary: 'A longer riverside workout via Nodeul Island, Yeouido and Ichon. Turn around early if needed.',
    summaryKo: '노들섬·여의도·이촌을 지나는 장거리 한강 운동 코스입니다. 힘들면 중간에 돌아오세요.',
    suggestedTime: 'About 70–100 min riding',
    suggestedTimeKo: '주행 약 70~100분',
    distance: '16.4 km',
    source: 'https://english.visitseoul.net/editorspicks/Biking-Around-Seoul/ENN028818',
    stops: [
      { place: 'Banpo Bridge area', placeKo: '반포대교 일대', detail: 'Join the riverside bike path.', detailKo: '한강 자전거도로로 진입하세요.', stationId: '2219' },
      { place: 'Nodeul Island', placeKo: '노들섬', detail: 'Rest near Hangang Railway Bridge.', detailKo: '한강철교 근처에서 잠시 쉬어가세요.', stationId: '870' },
      { place: 'Yeouido Hangang Park', placeKo: '여의도한강공원', detail: 'Refill water and check your energy.', detailKo: '물을 보충하고 컨디션을 확인하세요.', stationId: '5890' },
      { place: 'Ichon', placeKo: '이촌', detail: 'Continue west toward Mapodaegyo Bridge.', detailKo: '마포대교 방향으로 서쪽 구간을 이어갑니다.', stationId: '855' },
      { place: 'Mapo', placeKo: '마포', detail: 'Finish near Mapo Station.', detailKo: '마포역 근처에서 마무리합니다.', stationId: '147' },
    ],
  },
  {
    id: 'tukseom-training',
    category: 'fitness',
    title: 'Seoul Forest & Ttukseom training ride',
    titleKo: '서울숲·뚝섬 운동 코스',
    area: '10.1 km · riverside path',
    areaKo: '10.1km · 한강변 자전거도로',
    summary: 'Follow the official Jungnangcheon–Seoul Forest–Ttukseom course. Expect shared riverside paths.',
    summaryKo: '중랑천에서 서울숲·뚝섬으로 이어지는 공식 코스를 참고하세요. 한강변 공유 구간에서는 감속하세요.',
    suggestedTime: 'About 45–70 min riding',
    suggestedTimeKo: '주행 약 45~70분',
    distance: '10.1 km',
    source: 'https://english.visitseoul.net/editorspicks/Biking-Around-Seoul/ENN028818',
    stops: [
      { place: 'Seoul Forest', placeKo: '서울숲', detail: 'Start near the park entrance.', detailKo: '공원 입구 가까운 대여소에서 출발합니다.', stationId: '3552' },
      { place: 'Seongsu riverside', placeKo: '성수 한강변', detail: 'Use marked bike paths toward Ttukseom.', detailKo: '표시된 자전거도로를 따라 뚝섬 방향으로 이동하세요.', stationId: '511' },
      { place: 'Ttukseom Hangang Park', placeKo: '뚝섬한강공원', detail: 'Cool down and return the bike at a dock.', detailKo: '천천히 정리 운동한 뒤 대여소에 반납하세요.', stationId: '502' },
    ],
  },
  {
    id: 'night-river',
    category: 'night',
    title: 'Hangang night-view tour',
    titleKo: '한강 야경 투어',
    area: '13 km · Ttukseom to Nodeul',
    areaKo: '13km · 뚝섬에서 노들섬까지',
    summary: 'Ride through Ttukseom, Dongho Bridge and Banpo Bridge before finishing at Nodeul Island.',
    summaryKo: '뚝섬·동호대교·반포대교를 지나 노들섬에서 마무리하는 야경 코스입니다.',
    suggestedTime: 'About 60–90 min riding',
    suggestedTimeKo: '주행 약 60~90분',
    distance: '13 km',
    source: 'https://english.seoul.go.kr/service/movement/seoul-public-bike/attractive-seoul-bike-tour-routes/',
    stops: [
      { place: 'Ttukseom Hangang Park', placeKo: '뚝섬한강공원', detail: 'Start before sunset; check lights and brakes.', detailKo: '해 지기 전에 출발하고 전조등과 브레이크를 확인하세요.', stationId: '588' },
      { place: 'Dongho Bridge', placeKo: '동호대교', detail: 'Keep to the marked bike path.', detailKo: '표시된 자전거도로로 주행하세요.', stationId: '5651' },
      { place: 'Banpo Bridge', placeKo: '반포대교', detail: 'Slow down near crossings and crowds.', detailKo: '횡단 구간과 사람이 많은 곳에서는 속도를 줄이세요.', stationId: '2219' },
      { place: 'Nodeul Island', placeKo: '노들섬', detail: 'Finish at Nodeulseom West Bike Rental.', detailKo: '노들섬 서측 대여소에서 반납합니다.', stationId: '870' },
    ],
  },
  {
    id: 'yeouido-night',
    category: 'night',
    title: 'Yeouido lights & Saetgang',
    titleKo: '여의도 불빛·샛강 코스',
    area: '8 km · flat & well lit',
    areaKo: '8km · 평탄하고 조명이 있는 구간',
    summary: 'A shorter evening ride around Yeouido and Saetgang. Stay on lit paths and watch for pedestrians.',
    summaryKo: '여의도와 샛강을 도는 짧은 저녁 코스입니다. 조명이 있는 길을 이용하고 보행자를 살피세요.',
    suggestedTime: 'About 35–55 min riding',
    suggestedTimeKo: '주행 약 35~55분',
    distance: '8 km',
    source: 'https://english.seoul.go.kr/enjoy-bike-rides-romantic-moments-along-hangang-river/',
    stops: [
      { place: 'Yeouinaru', placeKo: '여의나루', detail: 'Begin by the riverside park.', detailKo: '한강공원 가까이에서 출발합니다.', stationId: '5890' },
      { place: 'Yeouido Hangang Park', placeKo: '여의도한강공원', detail: 'Take a rest by the river.', detailKo: '강변에서 잠시 쉬어가세요.', stationId: '5891' },
      { place: 'Saetgang Ecology Park', placeKo: '샛강생태공원', detail: 'Walk the wetland paths after parking the bike.', detailKo: '자전거를 반납한 뒤 생태공원 산책로를 걸어보세요.', stationId: '271' },
    ],
  },
  {
    id: 'spring-flowers',
    category: 'seasonal',
    season: 'spring',
    title: 'Spring flowers in Yeouido',
    titleKo: '봄꽃 피는 여의도',
    area: 'Spring · 8 km',
    areaKo: '봄 · 8km',
    summary: 'Ride the level Yeouido–Saetgang route when spring flowers are in bloom. Festival crowds can slow the ride.',
    summaryKo: '봄꽃이 필 때 평탄한 여의도·샛강 구간을 달려보세요. 축제 기간에는 사람이 많아 속도를 줄여야 합니다.',
    suggestedTime: 'About 35–55 min riding',
    suggestedTimeKo: '주행 약 35~55분',
    distance: '8 km',
    source: 'https://english.seoul.go.kr/enjoy-bike-rides-romantic-moments-along-hangang-river/',
    stops: [
      { place: 'Yeouinaru', placeKo: '여의나루', detail: 'Start early to avoid peak crowds.', detailKo: '혼잡을 피해 이른 시간에 출발하세요.', stationId: '5890' },
      { place: 'Yeouido Hangang Park', placeKo: '여의도한강공원', detail: 'Enjoy the seasonal flowers from the path.', detailKo: '자전거도로에서 계절 꽃을 감상하세요.', stationId: '5891' },
      { place: 'Saetgang Ecology Park', placeKo: '샛강생태공원', detail: 'Finish with a quiet walk through the wetland.', detailKo: '습지 산책로를 걸으며 마무리합니다.', stationId: '271' },
    ],
  },
  {
    id: 'summer-shade',
    category: 'seasonal',
    season: 'summer',
    title: 'Summer shade at Seoul Forest',
    titleKo: '여름 그늘, 서울숲',
    area: 'Summer · green stops',
    areaKo: '여름 · 숲길 휴식',
    summary: 'Pair a short ride with shaded walking paths in Seoul Forest. Avoid the hottest hours and bring water.',
    summaryKo: '짧게 자전거를 타고 서울숲 그늘길을 걷는 코스입니다. 한낮 더위를 피하고 물을 챙기세요.',
    suggestedTime: 'About 60–90 min with a walk',
    suggestedTimeKo: '산책 포함 60~90분',
    source: 'https://english.visitseoul.net/tours/Cooling-Off-the-Natural-Way-_/22066',
    stops: [
      { place: 'Seoul Forest', placeKo: '서울숲', detail: 'Walk beneath the trees after docking.', detailKo: '대여소에 반납한 뒤 나무 그늘을 걸어보세요.', stationId: '3552' },
      { place: 'Seoul Forest Station', placeKo: '서울숲역', detail: 'Take a water break in Seongsu.', detailKo: '성수에서 물을 마시며 쉬어가세요.', stationId: '4389' },
      { place: 'Ttukseom Hangang Park', placeKo: '뚝섬한강공원', detail: 'Use the riverside path in cooler morning or evening hours.', detailKo: '기온이 낮은 오전이나 저녁에 한강변을 이용하세요.', stationId: '5153' },
    ],
  },
  {
    id: 'autumn-reeds',
    category: 'seasonal',
    season: 'autumn',
    title: 'Autumn reeds at Amsa',
    titleKo: '가을 갈대, 암사생태공원',
    area: 'Autumn · 5 km',
    areaKo: '가을 · 5km',
    summary: 'Follow the Jamsil-to-Amsa riverside course and leave time for a walk among the reeds.',
    summaryKo: '잠실에서 암사생태공원까지 한강변을 달리고 갈대길은 걸어서 둘러보세요.',
    suggestedTime: 'About 25–40 min riding',
    suggestedTimeKo: '주행 약 25~40분',
    distance: '5 km',
    source: 'https://english.seoul.go.kr/enjoy-bike-rides-romantic-moments-along-hangang-river/',
    stops: [
      { place: 'Jamsil Sports Complex', placeKo: '잠실종합운동장', detail: 'Start at the station by the sports complex.', detailKo: '종합운동장 가까운 대여소에서 출발합니다.', stationId: '1205' },
      { place: 'Gwangnaru Hangang Park', placeKo: '광나루한강공원', detail: 'Follow the riverside cycle path.', detailKo: '한강변 자전거도로를 따라 이동하세요.', stationId: '576' },
      { place: 'Amsa Ecology Park', placeKo: '암사생태공원', detail: 'Walk the reed trail and check the return station.', detailKo: '갈대길은 걸어서 둘러보고 반납 대여소를 확인하세요.', stationId: '3539' },
    ],
  },
  {
    id: 'winter-daylight',
    category: 'seasonal',
    season: 'winter',
    title: 'Winter daylight ride',
    titleKo: '겨울 낮 시간 라이딩',
    area: 'Winter · short out-and-back',
    areaKo: '겨울 · 짧은 왕복 코스',
    summary: 'Choose a sunny midday and keep the ride short. Check for icy patches and turn back if the path is slippery.',
    summaryKo: '햇볕이 있는 낮에 짧게 다녀오세요. 노면이 얼었거나 미끄러우면 주행을 멈추세요.',
    suggestedTime: '30–45 min; adjust to conditions',
    suggestedTimeKo: '30~45분 · 날씨에 맞춰 조정',
    source: 'https://english.seoul.go.kr/service/movement/seoul-public-bike/attractive-seoul-bike-tour-routes/',
    stops: [
      { place: 'Ttukseom Hangang Park', placeKo: '뚝섬한강공원', detail: 'Start after checking the path and weather.', detailKo: '노면과 날씨를 확인한 뒤 출발하세요.', stationId: '502' },
      { place: 'Ttukseom riverside', placeKo: '뚝섬 한강변', detail: 'Turn around early if it is cold or slippery.', detailKo: '춥거나 미끄러우면 일찍 돌아오세요.', stationId: '5153' },
      { place: 'Ttukseom Station', placeKo: '뚝섬유원지역', detail: 'Return the bike before sunset.', detailKo: '해 지기 전에 자전거를 반납하세요.', stationId: '588' },
    ],
  },
]

const stationById = new Map(allBikeStations.map((station) => [station.id, station]))

export function getTouristStation(stationId: string): BikeStation {
  const station = stationById.get(stationId)
  if (!station) throw new Error(`Unknown tourist station: ${stationId}`)
  return station
}

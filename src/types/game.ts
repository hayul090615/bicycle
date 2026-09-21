export interface RoutePoint {
  x: number
  y: number
}

export interface GeoPoint {
  lat: number
  lng: number
}

export interface Station extends RoutePoint, GeoPoint {
  id: string
  name: string
  /** 긴 공식 대여소명을 게임에서 입력하기 쉽게 만든 별칭 */
  typingName?: string
  address?: string
  /** 현재 대여소에서 다음 대여소로 가는 경유점 */
  routeToNext?: RoutePoint[]
  geoRouteToNext?: GeoPoint[]
}

export interface DistrictCourse {
  district: string
  title: string
  description: string
  durationSeconds: number
  isSample: boolean
  source?: string
  sourceDate?: string
  stations: Station[]
}

export interface BikeStation extends GeoPoint {
  id: string
  name: string
  district: string
  address?: string
  docks: number
}

export type GameStatus = 'countdown' | 'playing' | 'paused' | 'finished'

export interface GameStats {
  score: number
  accuracy: number
  combo: number
  bestCombo: number
  passedStations: number
  correctUnits: number
  wrongAttempts: number
}

export interface GameResultData extends GameStats {
  completed: boolean
  elapsedSeconds: number
  cpm: number
}

export interface LeaderboardEntry {
  id: string
  district: string
  score: number
  accuracy: number
  elapsedSeconds: number
  completed: boolean
  createdAt: number
}

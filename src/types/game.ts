/**
 * 게임과 대여소 데이터에서 공통으로 사용하는 타입 정의다. 화면 좌표 RoutePoint와 실제 위도·경도 GeoPoint를 구분하며 점수·결과·순위 구조를 명시한다.
 */
/** 게임 화면의 평면 좌표. 지도용 경도·위도 배열과 섞어 사용하지 않는다. */
export interface RoutePoint {
  x: number
  y: number
}

/** 실제 지도 좌표. lat은 위도, lng는 경도이며 단위는 도다. */
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

/** 종료 시점의 통계와 완주 여부를 결과 화면에 전달하는 구조다. */
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

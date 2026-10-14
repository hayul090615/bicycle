//**  게임 지도 위의 자전거 SVG 표시다. 진행 위치·이동 방향과 오타·도착 애니메이션 상태를 CSS 클래스에 전달한다. */

import type { RoutePoint } from '../types/game'

export const BIKE_IMAGE_PATH = `${import.meta.env.BASE_URL}bike.svg`

interface BikeMarkerProps {
  position: RoutePoint
  direction: 1 | -1
  isWrong: boolean
  isArriving: boolean
  animationKey: string
}

export function BikeMarker({ position, direction, isWrong, isArriving, animationKey }: BikeMarkerProps) {
  return (
    <g key={animationKey} className={`bike-marker ${isWrong ? 'bike-marker--wrong' : ''} ${isArriving ? 'bike-marker--arriving' : ''}`}
      style={{ transform: `translate(${position.x}px, ${position.y}px)` }} aria-label="현재 따릉이 위치">
      <g transform={`scale(${direction}, 1)`}>
        <circle className="bike-halo" cx="0" cy="0" r="7" />
        <image href={BIKE_IMAGE_PATH} x="-6" y="-6" width="12" height="12" />
      </g>
    </g>
  )
}

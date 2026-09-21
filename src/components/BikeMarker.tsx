import type { RoutePoint } from '../types/game'

export const BIKE_IMAGE_PATH = '/bike.svg'

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

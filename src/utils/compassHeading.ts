/**
 * 휴대폰 방향 센서에서 유효한 절대 방위를 추출한다. iOS 방위와 Android 절대 방향을 처리하고 기준이 없는 상대 방향은 사용하지 않는다.
 */
type OrientationReading = {
  alpha: number | null
  beta: number | null
  gamma: number | null
  absolute: boolean
  type: string
  webkitCompassHeading?: number
  webkitCompassAccuracy?: number
}

/** 방위 각도를 0 이상 360 미만으로 정규화한다. */
export function normalizeHeading(degrees: number) { return ((degrees % 360) + 360) % 360 }

export function phoneCompassHeading(event: OrientationReading): number | null {
  if (event.webkitCompassHeading !== undefined) {
    if (!Number.isFinite(event.webkitCompassHeading) || event.webkitCompassHeading < 0
      || (event.webkitCompassAccuracy !== undefined && event.webkitCompassAccuracy < 0)) return null
    return normalizeHeading(event.webkitCompassHeading)
  }
  if ((!event.absolute && event.type !== 'deviceorientationabsolute') || event.alpha === null || !Number.isFinite(event.alpha)) return null
  if (event.beta === null || event.gamma === null || !Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return normalizeHeading(360 - event.alpha)
  const alpha = event.alpha * Math.PI / 180, beta = event.beta * Math.PI / 180, gamma = event.gamma * Math.PI / 180
  const x = -Math.cos(alpha) * Math.sin(gamma) - Math.sin(alpha) * Math.sin(beta) * Math.cos(gamma)
  const y = -Math.sin(alpha) * Math.sin(gamma) + Math.cos(alpha) * Math.sin(beta) * Math.cos(gamma)
  return Math.hypot(x, y) < .05 ? normalizeHeading(360 - event.alpha) : normalizeHeading(Math.atan2(x, y) * 180 / Math.PI)
}

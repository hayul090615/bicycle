/** Approximate solar position using NOAA's published equations. Angles are degrees clockwise from north. */
export function getSolarPosition(date: string, minutes: number, lat: number, lng: number) {
  const [year, month, day] = date.split('-').map(Number)
  const dayOfYear = Math.floor((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1)) / 86_400_000) + 1
  const daysInYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 366 : 365
  const hour = minutes / 60
  const gamma = (2 * Math.PI / daysInYear) * (dayOfYear - 1 + (hour - 12) / 24)
  const equationOfTime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma)
    - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma))
  const declination = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma)
    - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma)
    - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma)
  const hourAngle = ((minutes + equationOfTime + 4 * lng - 60 * 9) / 4 - 180) * Math.PI / 180
  const latitude = lat * Math.PI / 180
  const cosZenith = Math.min(1, Math.max(-1, Math.sin(latitude) * Math.sin(declination)
    + Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle)))
  const elevation = 90 - Math.acos(cosZenith) * 180 / Math.PI
  const azimuth = (Math.atan2(Math.sin(hourAngle), Math.cos(hourAngle) * Math.sin(latitude)
    - Math.tan(declination) * Math.cos(latitude)) * 180 / Math.PI + 180 + 360) % 360
  return {
    elevation,
    azimuth,
    shadowAzimuth: (azimuth + 180) % 360,
    shadowLength: elevation > 0 ? 1 / Math.tan(elevation * Math.PI / 180) : null,
  }
}

export function todayInSeoul() {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date())
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return `${value('year')}-${value('month')}-${value('day')}`
}

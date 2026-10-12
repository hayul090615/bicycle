/**
 * 여행 코스를 Google Earth URL 또는 KML 파일로 변환한다. 장소 이름의 XML 특수문자를 처리하고 다운로드 후 임시 객체 URL을 해제한다.
 */
import { getTouristStation, type TouristRoute } from '../data/touristRoutes'

/** 선택 코스의 정류 지점을 여는 Google Earth 링크를 만든다. */
export function googleEarthUrl(route: TouristRoute, stopIndex = 0) {
  const station = getTouristStation(route.stops[stopIndex]?.stationId ?? route.stops[0].stationId)
  return `https://earth.google.com/web/@${station.lat},${station.lng},0a,1600d,35y,0h,60t,0r`
}

const xml = (value: string) => value.replace(/[<>&"']/g, character => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[character]!)

/** 경로와 장소 설명을 Google Earth가 읽을 수 있는 KML 문서로 만든다. */
export function routeKml(route: TouristRoute, locale: 'en' | 'ko') {
  const name = locale === 'ko' ? route.titleKo : route.title
  const note = locale === 'ko'
    ? '경유지 연결선이며 실제 자전거 길안내가 아닙니다. 출발 전 현장 경로를 확인하세요.'
    : 'Lines connect stops only, not navigable cycling directions. Check the route before riding.'
  const lookAt = (lat: number, lng: number) => `<LookAt><longitude>${lng}</longitude><latitude>${lat}</latitude><altitude>0</altitude><heading>0</heading><tilt>60</tilt><range>1600</range><altitudeMode>relativeToGround</altitudeMode></LookAt>`
  const stations = route.stops.map(stop => getTouristStation(stop.stationId))
  const placemarks = route.stops.map((stop, index) => {
    const station = stations[index]
    return `<Placemark><name>${xml(`${index + 1}. ${locale === 'ko' ? stop.placeKo : stop.place}`)}</name><description>${xml(`${locale === 'ko' ? stop.detailKo : stop.detail} · #${station.id} ${station.name}`)}</description>${lookAt(station.lat, station.lng)}<Point><coordinates>${station.lng},${station.lat},0</coordinates></Point></Placemark>`
  }).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${xml(name)}</name><description>${xml(note)}</description>${lookAt(stations[0].lat, stations[0].lng)}
<Style id="route"><LineStyle><color>ff759d08</color><width>4</width></LineStyle></Style>
${placemarks}
<Placemark><name>${xml(note)}</name><styleUrl>#route</styleUrl><LineString><tessellate>1</tessellate><altitudeMode>clampToGround</altitudeMode><coordinates>${stations.map(station => `${station.lng},${station.lat},0`).join(' ')}</coordinates></LineString></Placemark>
</Document></kml>`
}

/** 코스 KML을 파일로 내려받고 생성한 임시 다운로드 URL을 해제한다. */
export function downloadEarthRoute(route: TouristRoute, locale: 'en' | 'ko') {
  const url = URL.createObjectURL(new Blob([routeKml(route, locale)], { type: 'application/vnd.google-earth.kml+xml' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `seoul-${route.id}-${locale}.kml`
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10000)
}

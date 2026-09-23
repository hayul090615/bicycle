import { useEffect, useMemo, useState } from 'react'
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip } from 'react-leaflet'
import type { TouristRoute } from '../data/touristRoutes'
import { getTouristStation } from '../data/touristRoutes'

type Locale = 'en' | 'ko'
interface PublicCamera {
  id: string; name: string; address: string; purpose: string; cameras: string; resolution: string
  direction: string; lat: number; lng: number; updatedAt: string
}
interface CameraBundle { count: number; latestRecordDate: string; cameras: PublicCamera[] }
interface Coordinate { lat: number; lng: number }

const distanceMeters = (a: Coordinate, b: Coordinate) => {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value))
}

export function PublicCctvMap({ route, locale }: { route: TouristRoute; locale: Locale }) {
  const first = getTouristStation(route.stops[0].stationId)
  const [center, setCenter] = useState<Coordinate>({ lat: first.lat, lng: first.lng })
  const [bundle, setBundle] = useState<CameraBundle | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [locationError, setLocationError] = useState('')
  const [usingGps, setUsingGps] = useState(false)

  useEffect(() => {
    let active = true
    fetch('/datasets/seoul-cctv.json.gz')
      .then((response) => { if (!response.ok) throw new Error(String(response.status)); return response.arrayBuffer() })
      .then(async (compressed) => {
        if (!('DecompressionStream' in window)) throw new Error('GZIP_UNSUPPORTED')
        const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))
        return await new Response(stream).json() as CameraBundle
      })
      .then((data) => { if (active) setBundle(data) })
      .catch(() => { if (active) setError(locale === 'en' ? 'Public camera location data could not be loaded.' : '공공 CCTV 위치 데이터를 불러오지 못했습니다.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [locale])

  useEffect(() => { const station = getTouristStation(route.stops[0].stationId); setCenter({ lat: station.lat, lng: station.lng }); setUsingGps(false) }, [route.id])

  const nearby = useMemo(() => bundle?.cameras
    .map((camera) => ({ camera, distance: distanceMeters(center, camera) }))
    .filter(({ distance }) => distance <= 5000)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 40) ?? [], [bundle, center])

  const locate = () => {
    setLocationError('')
    if (!navigator.geolocation) { setLocationError(locale === 'en' ? 'Location is unavailable in this browser.' : '이 브라우저에서 위치 기능을 사용할 수 없습니다.'); return }
    navigator.geolocation.getCurrentPosition(
      (position) => { setCenter({ lat: position.coords.latitude, lng: position.coords.longitude }); setUsingGps(true) },
      () => setLocationError(locale === 'en' ? 'Location access was denied. Showing cameras near this route instead.' : '위치 권한을 사용할 수 없어 코스 시작점 주변 카메라를 표시합니다.'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  }

  return <section className="tour-info-card tour-cctv-card" aria-labelledby="tour-cctv-title">
    <div className="tour-card-kicker">{locale === 'en' ? 'PUBLIC DATA · SEOUL' : '공공데이터 · 서울'}</div>
    <h2 id="tour-cctv-title">{locale === 'en' ? 'Nearby public CCTV locations' : '주변 공공 CCTV 위치'}</h2>
    <p>{locale === 'en' ? 'Camera locations and installation details from the national public CCTV dataset.' : '전국 CCTV 표준데이터에서 가져온 위치 및 설치 정보입니다.'}</p>
    <button className="tour-resource-link tour-locate-button" type="button" onClick={locate}>⌖ {locale === 'en' ? 'Use my location' : '내 위치 기준으로 찾기'}</button>
    {locationError && <p className="tour-cctv-message" role="status">{locationError}</p>}
    <div className="tour-cctv-map-wrap">
      <MapContainer key={`${center.lat.toFixed(4)}-${center.lng.toFixed(4)}`} className="tour-cctv-map" center={[center.lat, center.lng]} zoom={14} scrollWheelZoom>
        <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' />
        <CircleMarker center={[center.lat, center.lng]} radius={8} pathOptions={{ color: '#fff', weight: 3, fillColor: '#1677ff', fillOpacity: 1 }}>
          <Tooltip permanent>{usingGps ? (locale === 'en' ? 'You are here' : '내 위치') : (locale === 'en' ? 'Route start' : '코스 시작점')}</Tooltip>
        </CircleMarker>
        {nearby.map(({ camera, distance }) => <CircleMarker key={camera.id} center={[camera.lat, camera.lng]} radius={7}
          pathOptions={{ color: '#fff', weight: 2, fillColor: '#7257d9', fillOpacity: .9 }}>
          <Popup>
            <strong>{camera.purpose || (locale === 'en' ? 'Public CCTV' : '공공 CCTV')}</strong>
            <div>{camera.name}</div><div>{camera.address || (locale === 'en' ? 'Address not provided' : '주소 정보 없음')}</div>
            <div>{(distance / 1000).toFixed(1)} km · {locale === 'en' ? `${camera.cameras || '—'} cameras` : `카메라 ${camera.cameras || '—'}대`}</div>
            <div>{locale === 'en' ? `Data date: ${camera.updatedAt || '—'}` : `자료 기준일: ${camera.updatedAt || '—'}`}</div>
            <hr /><div>{locale === 'en' ? 'This location dataset does not include a live video URL.' : '위치 데이터에 실시간 영상 주소는 포함되어 있지 않습니다.'}</div>
          </Popup>
        </CircleMarker>)}
      </MapContainer>
    </div>
    <p className="tour-cctv-count" aria-live="polite">{loading ? (locale === 'en' ? 'Loading public data…' : '공공데이터 불러오는 중…') : error || (nearby.length === 0 ? (locale === 'en' ? 'No listed camera locations within 5 km. This dataset covers Seoul only.' : '반경 5km 내 카메라가 없습니다. 이 자료는 서울시 데이터입니다.') : (locale === 'en' ? `${nearby.length} locations within 5 km · source data contains ${bundle?.count.toLocaleString()} Seoul cameras` : `반경 5km 내 ${nearby.length}곳 · 서울 CCTV ${bundle?.count.toLocaleString()}건 데이터`))}</p>
    <a className="tour-cctv-source" href="https://www.data.go.kr/data/15013094/standard.do" target="_blank" rel="noopener noreferrer">{locale === 'en' ? `Source: MOIS National CCTV Standard Data · latest row date ${bundle?.latestRecordDate ?? ''}` : `출처: 행정안전부 전국 CCTV 표준데이터 · 자료 최신 기준일 ${bundle?.latestRecordDate ?? ''}`}</a>
    <p className="tour-cctv-message">{locale === 'en' ? 'Tap a camera marker for its public record. Live footage is not published in this dataset, so the app does not claim these cameras are viewable live.' : '카메라 표시를 누르면 공개된 설치 정보를 볼 수 있습니다. 원본 데이터에는 실시간 영상 주소가 없어 영상 재생으로 표시하지 않습니다.'}</p>
  </section>
}

import { siteText } from '../services/tourTranslations'
import type { SiteLocale } from '../services/siteLocale'
/**
 * 로드뷰 시점의 방향을 표시하고 북쪽 정렬을 제공한다. 사용자가 방향 센서 사용을 선택하면 권한을 확인한 뒤 휴대폰의 절대 방위에 맞춰 시점을 회전한다.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { KakaoMapsApi, KakaoRoadview } from '../services/kakaoMaps'
import { normalizeHeading, phoneCompassHeading } from '../utils/compassHeading'

type CompassEvent = DeviceOrientationEvent & { webkitCompassHeading?: number; webkitCompassAccuracy?: number }
type PermissionConstructor = typeof DeviceOrientationEvent & { requestPermission?: (absolute?: boolean) => Promise<PermissionState> }
const DIRECTIONS = {
  ko: ['북', '북동', '동', '남동', '남', '남서', '서', '북서'],
  en: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'],
  pt: ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'],
  ja: ['北', '北東', '東', '南東', '南', '南西', '西', '北西'],
  fr: ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'],
  zh: ['北', '东北', '东', '东南', '南', '西南', '西', '西北'],
}

export function RoadviewCompass({ api, roadview, locale }: { api: KakaoMapsApi; roadview: KakaoRoadview; locale: SiteLocale }) {
  // 화면의 방위 이름은 언어만 바꾸며 SDK의 실제 회전 각도는 그대로 사용한다.
  const ko = locale === 'ko'
  // useState는 화면에 필요한 값을 기억한다. set으로 시작하는 함수를 부르면 새 값으로 화면도 바뀐다.
  const [heading, setHeading] = useState(0)
  const [following, setFollowing] = useState(false)
  const [sensorStatus, setSensorStatus] = useState<'idle' | 'asking' | 'denied' | 'unavailable'>('idle')
  // useRef는 지도 객체나 이전 값을 기억하는 상자다. current를 바꿔도 화면을 다시 그리지는 않는다.
  const operation = useRef(0)

  // 화면이 열리거나 대괄호 안의 값이 바뀌면 실행한다. return 안의 함수는 이전 작업을 정리할 때 실행된다.
  useEffect(() => {
    let frame = 0
    const read = () => {
      frame = 0
      const pan = roadview.getViewpoint().pan
      if (Number.isFinite(pan)) setHeading(normalizeHeading(pan))
    }
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(read) }
    read()
    api.event.addListener(roadview, 'viewpoint_changed', schedule)
    api.event.addListener(roadview, 'position_changed', schedule)
    return () => {
      ++operation.current
      window.cancelAnimationFrame(frame)
      api.event.removeListener(roadview, 'viewpoint_changed', schedule)
      api.event.removeListener(roadview, 'position_changed', schedule)
    }
  }, [api, roadview])

  useEffect(() => {
    if (!following) return
    let frame = 0
    let smoothed: number | null = null
    let lastUpdate = 0
    const unavailable = window.setTimeout(() => { setFollowing(false); setSensorStatus('unavailable') }, 6000)
    const receive = (event: DeviceOrientationEvent) => {
      if (document.querySelector('.tour-arrival-overlay')) return
      const bearing = phoneCompassHeading(event as CompassEvent)
      if (bearing === null) return
      window.clearTimeout(unavailable)
      smoothed = smoothed === null ? bearing : smoothed + (((bearing - smoothed + 540) % 360) - 180) * .3
      if (frame || performance.now() - lastUpdate < 35) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        lastUpdate = performance.now()
        if (smoothed === null) return
        const viewpoint = roadview.getViewpoint()
        const pan = normalizeHeading(smoothed)
        if (Math.abs(((pan - viewpoint.pan + 540) % 360) - 180) >= .7) roadview.setViewpoint({ ...viewpoint, pan })
      })
    }
    window.addEventListener('deviceorientationabsolute', receive)
    window.addEventListener('deviceorientation', receive)
    return () => {
      window.clearTimeout(unavailable)
      window.cancelAnimationFrame(frame)
      window.removeEventListener('deviceorientationabsolute', receive)
      window.removeEventListener('deviceorientation', receive)
    }
  }, [following, roadview])

  const north = () => {
    ++operation.current
    setFollowing(false)
    setSensorStatus('idle')
    roadview.setViewpoint({ ...roadview.getViewpoint(), pan: 0 })
  }
  const togglePhone = async () => {
    const request = ++operation.current
    if (following) { setFollowing(false); setSensorStatus('idle'); return }
    if (!window.isSecureContext || typeof DeviceOrientationEvent === 'undefined') { setSensorStatus('unavailable'); return }
    setSensorStatus('asking')
    try {
      const orientation = DeviceOrientationEvent as PermissionConstructor
      const permission = orientation.requestPermission ? await orientation.requestPermission(true) : 'granted'
      if (request !== operation.current) return
      if (permission !== 'granted') { setSensorStatus('denied'); return }
      setSensorStatus('idle')
      setFollowing(true)
    } catch {
      if (request === operation.current) setSensorStatus('denied')
    }
  }
  const rounded = Math.round(heading) % 360
  const direction = DIRECTIONS[locale][Math.round(heading / 45) % 8]
  const northLabel = siteText(locale, `Face north · now ${direction} ${rounded} degrees`, `북쪽으로 맞추기 · 현재 ${direction} ${rounded}도`)
  const phoneLabel = siteText(locale, following ? 'Turn phone direction off' : 'Follow phone direction', following ? '휴대폰 방향 따라보기 끄기' : '휴대폰 방향 따라보기 켜기')
  const message = sensorStatus === 'denied' ? (siteText(locale, 'Allow orientation access to use this.', '방향 센서 권한을 허용해 주세요.'))
    : sensorStatus === 'unavailable' ? (siteText(locale, 'Direction data is unavailable on this device.', '이 기기에서 방향 정보를 받지 못했어요.')) : null

  // 아래 JSX는 화면에 보일 내용이다. 중괄호 안에는 위에서 계산한 값이나 버튼 동작을 넣는다.
  return <div className="tour-roadview-compass-dock">
    <button type="button" className="tour-roadview-compass" onClick={north} aria-label={northLabel} title={northLabel}>
      <span className="tour-roadview-compass-dial" style={{ '--compass-bearing': `${-heading}deg` } as CSSProperties} aria-hidden="true">
        <span className="tour-roadview-compass-north">N</span>
        <svg viewBox="0 0 40 40"><path className="tour-roadview-compass-needle-north" d="M20 6 26 20 14 20Z" /><path className="tour-roadview-compass-needle-south" d="M20 34 14 20 26 20Z" /></svg>
      </span>
      <span className="tour-roadview-compass-label" aria-hidden="true">{direction}</span>
    </button>
    <button type="button" className={`tour-roadview-phone-direction${following ? ' is-active' : ''}`} onClick={() => void togglePhone()} disabled={sensorStatus === 'asking'} aria-pressed={following} aria-label={phoneLabel} title={phoneLabel}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="7" y="3" width="10" height="18" rx="2" /><path d="m10 11 2-3 2 3M12 8v7m-2 3h4" /></svg>
      <span>{siteText(locale, 'Phone', '방향')}</span>
    </button>
    {message && <span className="tour-roadview-compass-message" role="status">{message}</span>}
  </div>
}

import { siteText } from '../services/tourTranslations'
import type { SiteLocale } from '../services/siteLocale'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { LonLat } from '../services/bikeRoute'
import type { KakaoMapsApi, KakaoRoadview } from '../services/kakaoMaps'
import { roadviewRouteSections } from '../utils/roadviewRoute'

export type RoadviewDirection = { point: LonLat; label: string; arrow: string; distanceMeters: number; maneuver: string }

const distanceLabel = (meters: number) => meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`

/** 전체화면 사진의 촬영 위치를 기준으로 다음 방향과 남은 길 안내를 보여 준다. */
export function RoadviewDirections({ api, roadview, path, instructions, locale }: {
  api: KakaoMapsApi
  roadview: KakaoRoadview
  path: LonLat[] | null
  instructions: RoadviewDirection[]
  locale: SiteLocale
}) {
  const [open, setOpen] = useState(true)
  const [position, setPosition] = useState(() => ({ lat: roadview.getPosition().getLat(), lng: roadview.getPosition().getLng() }))
  const listId = useId()
  const list = useRef<HTMLOListElement>(null)
  useEffect(() => {
    let timeout = 0
    const readPosition = () => {
      const photo = roadview.getPosition()
      const lat = photo.getLat(), lng = photo.getLng()
      if (Number.isFinite(lat) && Number.isFinite(lng)) setPosition(current => current.lat === lat && current.lng === lng ? current : { lat, lng })
    }
    const changed = () => {
      readPosition()
      window.clearTimeout(timeout)
      timeout = window.setTimeout(readPosition, 650)
    }
    changed()
    api.event.addListener(roadview, 'position_changed', changed)
    api.event.addListener(roadview, 'panoid_changed', changed)
    return () => {
      window.clearTimeout(timeout)
      api.event.removeListener(roadview, 'position_changed', changed)
      api.event.removeListener(roadview, 'panoid_changed', changed)
    }
  }, [api, roadview])
  const steps = useMemo(() => instructions.map(instruction => ({ ...instruction,
    offset: path ? roadviewRouteSections(path, { lat: instruction.point[1], lng: instruction.point[0] }).sections[0]?.progressMeters ?? 0 : 0,
  })), [instructions, path])
  const progress = path ? roadviewRouteSections(path, position) : null
  const progressMeters = progress?.sections[0]?.progressMeters ?? 0
  const upcomingIndex = steps.findIndex(step => step.offset + 10 >= progressMeters)
  const index = upcomingIndex < 0 ? Math.max(0, steps.length - 1) : upcomingIndex
  const next = steps[index] ?? steps.at(-1)
  useEffect(() => {
    if (!open) return
    const active = list.current?.querySelector<HTMLElement>('[aria-current="step"]')
    if (active && list.current) list.current.scrollTop = Math.max(0, active.offsetTop - list.current.offsetTop - 8)
  }, [index, open])

  return <div className="tour-roadview-directions-dock">
    <button type="button" className="tour-roadview-directions-toggle" aria-expanded={open} aria-controls={listId}
      onClick={() => setOpen(value => !value)}>{open ? (siteText(locale, 'Close list', '목록 닫기')) : (siteText(locale, 'Show directions', '길 안내 보기'))}</button>
    {open && <aside id={listId} className="tour-roadview-directions" aria-label={siteText(locale, 'Street view directions', '로드뷰 길 안내')}>
      <div className="tour-roadview-directions-current" role="status" aria-live="polite">
        <span aria-hidden="true">{next?.arrow ?? '↑'}</span>
        <div><small>{next?.maneuver === 'arrive' ? (siteText(locale, 'ARRIVAL', '도착 안내')) : (siteText(locale, 'NEXT DIRECTION', '다음 이동 방향'))}</small>
          <strong>{next?.label ?? (siteText(locale, 'Loading bicycle directions…', '자전거 길 안내를 불러오는 중…'))}</strong>
          {next && progress && Number.isFinite(progress.remainingMeters) && <em>{distanceLabel(Math.max(0, next.offset - progressMeters))} {siteText(locale, 'to next direction', '후 안내')} · {distanceLabel(progress.remainingMeters)} {siteText(locale, 'remaining', '남음')}</em>}
        </div>
      </div>
      <h3>{siteText(locale, 'Full directions', '전체 길 안내')}</h3>
      {steps.length ? <ol ref={list}>{steps.map((step, stepIndex) => <li key={`${step.point.join(',')}-${stepIndex}`} aria-current={stepIndex === index ? 'step' : undefined}>
        <span aria-hidden="true">{step.arrow}</span><div><strong>{step.label}</strong><small>{distanceLabel(step.distanceMeters)}</small></div>
      </li>)}</ol> : <p>{siteText(locale, 'Directions appear when the route loads.', '경로를 불러오면 안내가 표시됩니다.')}</p>}
    </aside>}
  </div>
}

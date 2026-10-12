/**
 * 로드뷰의 도착 버튼을 누르면 목적지 주변 촬영 지점으로 바로 이동한다.
 * 요청한 사진의 위치가 확인된 뒤 축하 안내를 호출하며 실제 GPS는 변경하지 않는다.
 */
import { useEffect, useRef, useState } from 'react'
import type { KakaoMapsApi, KakaoRoadview } from '../services/kakaoMaps'

export function RoadviewDestinationControl({ api, roadview, destination, locale, onArrival }: {
  api: KakaoMapsApi
  roadview: KakaoRoadview
  destination: { lat: number; lng: number }
  locale: 'ko' | 'en'
  onArrival: () => void
}) {
  const jumpRef = useRef<() => void>(() => {})
  const arrivalRef = useRef(onArrival)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const ko = locale === 'ko'
  useEffect(() => { arrivalRef.current = onArrival }, [onArrival])

  useEffect(() => {
    setBusy(false)
    setError(false)
    let disposed = false, request = 0, timeout = 0, confirmation = 0
    let expectedPano: number | null = null
    let searchRadius = 30
    let moving = false
    const client = new api.RoadviewClient()
    const position = new api.LatLng(destination.lat, destination.lng)
    const marker = document.createElement('button')
    marker.type = 'button'
    marker.className = 'tour-roadview-route-destination'
    marker.textContent = ko ? '도착' : 'End'
    marker.title = ko ? '도착지로 바로 이동' : 'Jump to destination'
    marker.setAttribute('aria-label', marker.title)
    const overlay = new api.CustomOverlay({ map: null, position, content: marker, xAnchor: .5, yAnchor: 1, clickable: true })
    overlay.setAltitude?.(0)
    overlay.setRange?.(300)
    overlay.setMap(roadview)
    const stop = (failed: boolean) => {
      moving = false
      expectedPano = null
      window.clearTimeout(timeout)
      window.clearTimeout(confirmation)
      marker.disabled = false
      marker.textContent = ko ? '도착' : 'End'
      if (!disposed) { setBusy(false); setError(failed) }
    }
    // SDK의 사진 ID와 실제 촬영 좌표를 확인한다. 사진 로딩 중에는 안내를 띄우지 않는다.
    const confirmPhoto = () => {
      if (disposed || !moving || expectedPano === null || roadview.getPanoId() !== expectedPano) return
      const currentRequest = request
      window.clearTimeout(confirmation)
      confirmation = window.setTimeout(() => {
        if (disposed || !moving || currentRequest !== request || roadview.getPanoId() !== expectedPano) return
        const photo = roadview.getPosition()
        const lat = photo.getLat(), lng = photo.getLng()
        const gap = Math.hypot((lat - destination.lat) * 111_320,
          (lng - destination.lng) * 111_320 * Math.cos(destination.lat * Math.PI / 180))
        if (!Number.isFinite(gap) || gap > searchRadius + 10) return
        stop(false)
        arrivalRef.current()
      }, 650)
    }
    jumpRef.current = () => {
      if (disposed || moving) return
      const currentRequest = ++request
      moving = true
      setBusy(true)
      setError(false)
      marker.disabled = true
      marker.textContent = '…'
      // 사진이 없거나 SDK 응답이 멈추면 현재 화면을 유지하고 다시 선택할 수 있게 한다.
      timeout = window.setTimeout(() => {
        if (disposed || request !== currentRequest) return
        ++request
        stop(true)
      }, 12000)
      const findPhoto = (radius: number) => {
        client.getNearestPanoId(position, radius, panoId => {
          if (disposed || request !== currentRequest || !moving) return
          if (panoId === null) {
            if (radius === 30) findPhoto(80)
            else stop(true)
            return
          }
          searchRadius = radius
          expectedPano = panoId
          try {
            if (roadview.getPanoId() === panoId) confirmPhoto()
            else roadview.setPanoId(panoId, position)
          } catch { stop(true) }
        })
      }
      findPhoto(30)
    }
    const handleClick = (event: MouseEvent) => { event.stopPropagation(); jumpRef.current() }
    marker.addEventListener('click', handleClick)
    api.event.addListener(roadview, 'init', confirmPhoto)
    api.event.addListener(roadview, 'panoid_changed', confirmPhoto)
    api.event.addListener(roadview, 'position_changed', confirmPhoto)
    return () => {
      disposed = true
      ++request
      window.clearTimeout(timeout)
      window.clearTimeout(confirmation)
      marker.removeEventListener('click', handleClick)
      api.event.removeListener(roadview, 'init', confirmPhoto)
      api.event.removeListener(roadview, 'panoid_changed', confirmPhoto)
      api.event.removeListener(roadview, 'position_changed', confirmPhoto)
      overlay.setMap(null)
      jumpRef.current = () => {}
    }
  }, [api, destination.lat, destination.lng, ko, roadview])

  return <>
    <button type="button" className="tour-roadview-jump-destination" disabled={busy} aria-busy={busy}
      title={ko ? '도착지로 바로 이동' : 'Jump to destination'} onClick={() => jumpRef.current()}>
      {busy ? '…' : ko ? '도착' : 'End'}
    </button>
    {error && <span className="tour-roadview-jump-error" role="status">
      {ko ? '도착지 근처 사진을 불러오지 못했어요. 다시 눌러 주세요.' : 'Destination imagery is unavailable. Please try again.'}
    </span>}
  </>
}

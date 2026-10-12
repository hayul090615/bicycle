import { useEffect, useRef, useState } from 'react'
import type { LonLat } from '../services/bikeRoute'
import type { KakaoMapsApi, KakaoOverlay, KakaoRoadview } from '../services/kakaoMaps'
import { bearingToRoadviewPoint, roadviewRouteSections, type RibbonSection } from '../utils/roadviewRoute'

type AnchorPair = { section: RibbonSection; left: HTMLElement; right: HTMLElement }
type ScreenPoint = { x: number; y: number }

export function RoadviewRouteRibbon({ api, roadview, host, path, destination, locale }: {
  api: KakaoMapsApi
  roadview: KakaoRoadview
  host: HTMLElement
  path: LonLat[]
  destination: { lat: number; lng: number }
  locale: 'ko' | 'en'
}) {
  const ribbon = useRef<SVGPathElement>(null)
  const centerline = useRef<SVGPathElement>(null)
  const alignOnce = useRef(false)
  const advanceRef = useRef<() => void>(() => {})
  const [offRoute, setOffRoute] = useState(false)
  const [moving, setMoving] = useState(false)
  const [moveFailed, setMoveFailed] = useState(false)
  const ko = locale === 'ko'

  useEffect(() => {
    let disposed = false
    let frame = 0
    let moveTimeout = 0
    let moveRequest = 0
    let anchors: AnchorPair[] = []
    let overlays: KakaoOverlay[] = []
    let sections: RibbonSection[] = []
    let nearestPoint: LonLat | null = null
    let routeIsNearby = true
    let progressFloor = 0
    let alignAfterMove = false
    let alignFrame = 0
    let camera = { lat: 0, lng: 0 }
    const client = new api.RoadviewClient()
    const stopMoving = () => { window.clearTimeout(moveTimeout); if (!disposed) setMoving(false) }

    const readScreen = (anchor: HTMLElement, rect: DOMRect): ScreenPoint | null => {
      if (!anchor.isConnected || !anchor.getClientRects().length) return null
      if (anchor.parentElement && getComputedStyle(anchor.parentElement).visibility === 'hidden') return null
      const position = anchor.getBoundingClientRect()
      const x = position.left + position.width / 2 - rect.left, y = position.top + position.height / 2 - rect.top
      return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) < rect.width * 4 && Math.abs(y) < rect.height * 4 ? { x, y } : null
    }
    const draw = () => {
      frame = 0
      if (disposed) return
      const bounds = host.getBoundingClientRect()
      const pan = roadview.getViewpoint().pan * Math.PI / 180
      const rows = anchors.map(pair => {
        const dx = (pair.section.center[0] - camera.lng) * 111_320 * Math.cos(camera.lat * Math.PI / 180)
        const dy = (pair.section.center[1] - camera.lat) * 111_320
        if (dx * Math.sin(pan) + dy * Math.cos(pan) <= .8) return null
        const left = readScreen(pair.left, bounds), right = readScreen(pair.right, bounds)
        return left && right ? { left, right } : null
      })
      let band = '', line = ''
      rows.forEach((row, index) => {
        const next = rows[index + 1]
        if (!row || !next) return
        band += `M${row.left.x},${row.left.y}L${row.right.x},${row.right.y}L${next.right.x},${next.right.y}L${next.left.x},${next.left.y}Z`
        line += `M${(row.left.x + row.right.x) / 2},${(row.left.y + row.right.y) / 2}L${(next.left.x + next.right.x) / 2},${(next.left.y + next.right.y) / 2}`
      })
      ribbon.current?.setAttribute('d', band)
      centerline.current?.setAttribute('d', line)
    }
    const scheduleDraw = () => { if (!frame && !disposed) frame = window.requestAnimationFrame(draw) }
    const createAnchor = (point: LonLat) => {
      const element = document.createElement('span')
      element.className = 'tour-roadview-route-anchor'
      element.setAttribute('aria-hidden', 'true')
      const overlay = new api.CustomOverlay({ map: null, position: new api.LatLng(point[1], point[0]), content: element, xAnchor: .5, yAnchor: .5, clickable: false })
      overlay.setAltitude?.(0)
      overlay.setRange?.(200)
      overlay.setMap(roadview)
      overlays.push(overlay)
      return element
    }
    const rebuild = () => {
      if (disposed) return
      ++moveRequest
      stopMoving()
      overlays.forEach(overlay => overlay.setMap(null))
      overlays = []
      anchors = []
      ribbon.current?.setAttribute('d', '')
      centerline.current?.setAttribute('d', '')
      const position = roadview.getPosition()
      camera = { lat: position.getLat(), lng: position.getLng() }
      const route = roadviewRouteSections(path, camera, progressFloor)
      sections = route.sections
      nearestPoint = route.nearestPoint
      progressFloor = Math.max(progressFloor, (sections[0]?.progressMeters ?? 0) - 12)
      routeIsNearby = route.closestDistance <= 55
      setOffRoute(!routeIsNearby)
      setMoveFailed(false)
      if (routeIsNearby) {
        anchors = sections.map(section => ({ section, left: createAnchor(section.left), right: createAnchor(section.right) }))
        if ((!alignOnce.current || alignAfterMove) && sections.length > 2) {
          alignOnce.current = true
          alignAfterMove = false
          window.cancelAnimationFrame(alignFrame)
          alignFrame = window.requestAnimationFrame(() => {
            if (disposed || !sections.length) return
            const target = (sections.find(section => section.progressMeters >= sections[0].progressMeters + 18) ?? sections.at(-1)!).center
            roadview.setViewpoint({ ...roadview.getViewpoint(), pan: bearingToRoadviewPoint(camera, target), tilt: -6 })
          })
        }
      }
      const label = document.createElement('span')
      label.className = 'tour-roadview-route-destination'
      label.textContent = ko ? '도착' : 'End'
      const end = new api.CustomOverlay({ map: null, position: new api.LatLng(destination.lat, destination.lng), content: label, xAnchor: .5, yAnchor: 1, clickable: false })
      end.setAltitude?.(.3)
      end.setRange?.(200)
      end.setMap(roadview)
      overlays.push(end)
      scheduleDraw()
    }
    advanceRef.current = () => {
      if (disposed) return
      const request = ++moveRequest
      const currentPano = roadview.getPanoId()
      const candidates = !routeIsNearby && nearestPoint
        ? [{ point: nearestPoint, progress: sections[0]?.progressMeters ?? progressFloor }]
        : [12, 28, 48].flatMap(distance => {
          const section = sections.find(item => item.progressMeters >= (sections[0]?.progressMeters ?? 0) + distance) ?? sections.at(-1)
          return section ? [{ point: section.center, progress: section.progressMeters }] : []
        })
      setMoving(true)
      setMoveFailed(false)
      moveTimeout = window.setTimeout(() => { if (request === moveRequest) { ++moveRequest; setMoveFailed(true); stopMoving() } }, 7000)
      const tryCandidate = (index: number) => {
        const candidate = candidates[index]
        if (!candidate) { setMoveFailed(true); stopMoving(); return }
        const point = candidate.point
        client.getNearestPanoId(new api.LatLng(point[1], point[0]), 35, panoId => {
          if (disposed || request !== moveRequest) return
          if (roadview.getPanoId() !== currentPano) { stopMoving(); return }
          if (panoId === null || panoId === currentPano) { tryCandidate(index + 1); return }
          progressFloor = Math.max(progressFloor, candidate.progress - 15)
          alignAfterMove = true
          roadview.setPanoId(panoId, new api.LatLng(point[1], point[0]))
        })
      }
      tryCandidate(0)
    }
    rebuild()
    api.event.addListener(roadview, 'position_changed', rebuild)
    api.event.addListener(roadview, 'viewpoint_changed', scheduleDraw)
    const observer = new ResizeObserver(scheduleDraw)
    observer.observe(host)
    return () => {
      disposed = true
      window.cancelAnimationFrame(frame)
      window.cancelAnimationFrame(alignFrame)
      window.clearTimeout(moveTimeout)
      observer.disconnect()
      api.event.removeListener(roadview, 'position_changed', rebuild)
      api.event.removeListener(roadview, 'viewpoint_changed', scheduleDraw)
      overlays.forEach(overlay => overlay.setMap(null))
      advanceRef.current = () => {}
    }
  }, [api, destination.lat, destination.lng, host, ko, path, roadview])

  return <>
    <svg className="tour-roadview-route-ribbon" aria-hidden="true"><path className="tour-roadview-route-band" ref={ribbon} /><path className="tour-roadview-route-centerline" ref={centerline} /></svg>
    <div className="tour-roadview-route-guide">
      <span>{moveFailed ? (ko ? '다음 사진이 없어요. 다른 지점을 눌러 보세요.' : 'No next photo here. Try another point.') : offRoute ? (ko ? '선택한 경로로 이동해 보세요' : 'Go to your selected route') : (ko ? '파란 경로를 따라 도착지까지' : 'Follow blue to your destination')}</span>
      <button type="button" disabled={moving} onClick={() => advanceRef.current()}>{moving ? '…' : offRoute ? (ko ? '경로로' : 'To route') : (ko ? '다음 ›' : 'Next ›')}</button>
    </div>
  </>
}

/**
 * 촬영 좌표 주변의 경로를 지면 앵커에 투영해 파란 SVG 선으로 그린다. 사진 전환 후 좌표·시점을 재확인하며 경로 끝 도착 여부와 다음 사진 이동을 처리한다.
 */
import { useEffect, useRef, useState } from 'react'
import type { LonLat } from '../services/bikeRoute'
import type { KakaoMapsApi, KakaoOverlay, KakaoRoadview } from '../services/kakaoMaps'
import type { RouteElevationPoint } from '../services/routeConditions'
import { bearingToRoadviewPoint, roadviewRouteSections, type RibbonSection } from '../utils/roadviewRoute'
import { roadviewGroundAltitude, visibleRoadviewGroundSections } from '../utils/roadviewGround'
import { isAtRoadviewDestination } from '../utils/routeArrival'

type AnchorPair = { section: RibbonSection; left: HTMLElement; right: HTMLElement }
type ScreenPoint = { x: number; y: number }

export function RoadviewRouteRibbon({ api, roadview, host, path, terrainPath, elevationProfile, destination, locale, onDestinationArrival }: {
  api: KakaoMapsApi
  roadview: KakaoRoadview
  host: HTMLElement
  path: LonLat[]
  terrainPath: LonLat[] | null
  elevationProfile: RouteElevationPoint[]
  destination: { lat: number; lng: number }
  locale: 'ko' | 'en'
  onDestinationArrival: () => void
}) {
  const ribbon = useRef<SVGPathElement>(null)
  const centerline = useRef<SVGPathElement>(null)
  const alignOnce = useRef(false)
  const advanceRef = useRef<() => void>(() => {})
  const arrivalCallback = useRef(onDestinationArrival)
  const [offRoute, setOffRoute] = useState(false)
  const [moving, setMoving] = useState(false)
  const [moveFailed, setMoveFailed] = useState(false)
  const ko = locale === 'ko'
  useEffect(() => { arrivalCallback.current = onDestinationArrival }, [onDestinationArrival])

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
    let pendingAlignment: { target: LonLat; initial: boolean } | null = null
    let cameraInitialized = false
    let settleTimeout = 0
    let arrivalTimeout = 0
    let settling = false
    let stableZoom = alignOnce.current ? roadview.getViewpoint().zoom : 0
    let horizon: { element: HTMLElement; overlay: KakaoOverlay } | null = null
    let camera = { lat: 0, lng: 0 }
    const client = new api.RoadviewClient()
    const stopMoving = () => { window.clearTimeout(moveTimeout); if (!disposed) setMoving(false) }

    const readScreen = (anchor: HTMLElement, rect: DOMRect): ScreenPoint | null => {
      if (!anchor.isConnected || !anchor.getClientRects().length) return null
      if (anchor.parentElement && getComputedStyle(anchor.parentElement).visibility === 'hidden') return null
      const position = anchor.getBoundingClientRect()
      const x = position.left + position.width / 2 - rect.left, y = position.top + position.height / 2 - rect.top
      return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) < rect.width * 2 && Math.abs(y) < rect.height * 2 ? { x, y } : null
    }
    // SDK 지면 앵커의 화면 위치를 읽어 시점 앞쪽의 안전한 사각형만 연결한다.
    const draw = () => {
      frame = 0
      if (disposed || settling) return
      const position = roadview.getPosition()
      if (Math.abs(position.getLat() - camera.lat) + Math.abs(position.getLng() - camera.lng) > 1e-8) {
        // SDK init/position events can precede the final photo coordinate.
        // Rebuild from the settled position instead of reusing old anchors.
        rebuild()
        return
      }
      const bounds = host.getBoundingClientRect()
      const pan = roadview.getViewpoint().pan * Math.PI / 180
      horizon?.overlay.setPosition?.(new api.LatLng(camera.lat + Math.cos(pan) * 20 / 111_320,
        camera.lng + Math.sin(pan) * 20 / (111_320 * Math.cos(camera.lat * Math.PI / 180))))
      const horizonPoint = horizon && readScreen(horizon.element, bounds)
      // Never connect ground anchors across the panorama's horizon/near plane.
      if (!horizonPoint) { ribbon.current?.setAttribute('d', ''); centerline.current?.setAttribute('d', ''); return }
      const rows = anchors.map(pair => {
        const dx = (pair.section.center[0] - camera.lng) * 111_320 * Math.cos(camera.lat * Math.PI / 180)
        const dy = (pair.section.center[1] - camera.lat) * 111_320
        if (dx * Math.sin(pan) + dy * Math.cos(pan) <= 2.5 || Math.hypot(dx, dy) > 45) return null
        const left = readScreen(pair.left, bounds), right = readScreen(pair.right, bounds)
        return left && right && Math.min(left.y, right.y) > horizonPoint.y + 2
          && Math.hypot(left.x - right.x, left.y - right.y) < Math.min(200, bounds.width * .5)
          ? { left, right } : null
      })
      let band = '', line = ''
      rows.forEach((row, index) => {
        const next = rows[index + 1]
        if (!row || !next || Math.hypot((row.left.x + row.right.x - next.left.x - next.right.x) / 2,
          (row.left.y + row.right.y - next.left.y - next.right.y) / 2) > bounds.height * .6) return
        band += `M${row.left.x},${row.left.y}L${row.right.x},${row.right.y}L${next.right.x},${next.right.y}L${next.left.x},${next.left.y}Z`
        line += `M${(row.left.x + row.right.x) / 2},${(row.left.y + row.right.y) / 2}L${(next.left.x + next.right.x) / 2},${(next.left.y + next.right.y) / 2}`
      })
      ribbon.current?.setAttribute('d', band)
      centerline.current?.setAttribute('d', line)
    }
    const scheduleDraw = () => { if (!frame && !disposed) frame = window.requestAnimationFrame(draw) }
    const createAnchor = (point: LonLat, altitude: number) => {
      const element = document.createElement('span')
      element.className = 'tour-roadview-route-anchor'
      element.setAttribute('aria-hidden', 'true')
      const overlay = new api.CustomOverlay({ map: null, position: new api.LatLng(point[1], point[0]), content: element, xAnchor: .5, yAnchor: .5, clickable: false })
      overlay.setAltitude?.(altitude)
      overlay.setRange?.(60)
      overlay.setMap(roadview)
      overlays.push(overlay)
      return { element, overlay }
    }
    // 전환 중에는 이전 선을 숨기고 좌표와 시점을 다시 맞춘 뒤 도착을 확인한다.
    const settle = () => {
      settling = true
      ribbon.current?.setAttribute('d', '')
      centerline.current?.setAttribute('d', '')
      window.clearTimeout(settleTimeout)
      settleTimeout = window.setTimeout(() => {
        if (disposed) return
        settling = false
        const position = roadview.getPosition()
        if (Math.abs(position.getLat() - camera.lat) + Math.abs(position.getLng() - camera.lng) > 1e-8) { rebuild(); return }
        // The SDK also resets its viewpoint during photo loading. Apply route
        // alignment after that transition so image and anchors share one pose.
        if (pendingAlignment) {
          const viewpoint = roadview.getViewpoint()
          roadview.setViewpoint({ ...viewpoint, pan: bearingToRoadviewPoint(camera, pendingAlignment.target), tilt: -6,
            zoom: pendingAlignment.initial ? 0 : stableZoom })
          alignOnce.current = true
          pendingAlignment = null
        }
        scheduleDraw()
        window.clearTimeout(arrivalTimeout)
        const panoId = roadview.getPanoId()
        // 사진 전환이 끝난 뒤 한 번 더 같은 촬영 지점인지 확인한다.
        arrivalTimeout = window.setTimeout(() => {
          if (disposed || settling || roadview.getPanoId() !== panoId) return
          const position = roadview.getPosition()
          const confirmed = { lat: position.getLat(), lng: position.getLng() }
          const route = roadviewRouteSections(path, confirmed, progressFloor)
          if (isAtRoadviewDestination(confirmed, destination, route.remainingMeters, route.closestDistance)) arrivalCallback.current()
        }, 1000)
      }, 650)
    }
    const panoramaChanged = () => { alignAfterMove = true; settle() }
    const viewpointChanged = () => {
      if (!settling) stableZoom = roadview.getViewpoint().zoom
      scheduleDraw()
    }
    // 사진 위치가 바뀌면 이전 오버레이를 지우고 가까운 경로 앵커를 새로 만든다.
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
      const movedPhoto = cameraInitialized && Math.abs(position.getLat() - camera.lat) + Math.abs(position.getLng() - camera.lng) > 1e-8
      camera = { lat: position.getLat(), lng: position.getLng() }
      cameraInitialized = true
      let route = roadviewRouteSections(path, camera, progressFloor)
      if (progressFloor > 0 && route.closestDistance > 12) {
        const unrestricted = roadviewRouteSections(path, camera)
        if (unrestricted.closestDistance + 5 < route.closestDistance) {
          route = unrestricted
          progressFloor = Math.max(0, (route.sections[0]?.progressMeters ?? 0) - 12)
        }
      }
      sections = route.sections
      nearestPoint = route.nearestPoint
      progressFloor = Math.max(progressFloor, (sections[0]?.progressMeters ?? 0) - 12)
      routeIsNearby = route.closestDistance <= 12
      setOffRoute(!routeIsNearby)
      setMoveFailed(false)
      const altitudeAt = roadviewGroundAltitude(terrainPath, elevationProfile, camera)
      horizon = createAnchor([camera.lng, camera.lat], 1.7)
      if (routeIsNearby) {
        anchors = visibleRoadviewGroundSections(sections).map(section => ({ section,
          left: createAnchor(section.left, altitudeAt(section.center)).element,
          right: createAnchor(section.right, altitudeAt(section.center)).element }))
        if ((!alignOnce.current || alignAfterMove || movedPhoto) && sections.length > 2) {
          alignAfterMove = false
          const target = (sections.find(section => section.progressMeters >= sections[0].progressMeters + 18) ?? sections.at(-1)!).center
          pendingAlignment = { target, initial: !alignOnce.current }
        }
      } else pendingAlignment = null
      settle()
    }
    // 경로 앞쪽의 촬영 후보를 차례로 조회하며 같은 사진은 건너뛴다.
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
    api.event.addListener(roadview, 'panoid_changed', panoramaChanged)
    api.event.addListener(roadview, 'viewpoint_changed', viewpointChanged)
    const observer = new ResizeObserver(scheduleDraw)
    observer.observe(host)
    return () => {
      disposed = true
      window.cancelAnimationFrame(frame)
      window.clearTimeout(moveTimeout)
      window.clearTimeout(settleTimeout)
      window.clearTimeout(arrivalTimeout)
      observer.disconnect()
      api.event.removeListener(roadview, 'position_changed', rebuild)
      api.event.removeListener(roadview, 'panoid_changed', panoramaChanged)
      api.event.removeListener(roadview, 'viewpoint_changed', viewpointChanged)
      overlays.forEach(overlay => overlay.setMap(null))
      advanceRef.current = () => {}
    }
  }, [api, destination.lat, destination.lng, elevationProfile, host, ko, path, roadview, terrainPath])

  return <>
    <svg className="tour-roadview-route-ribbon" aria-hidden="true"><path className="tour-roadview-route-band" ref={ribbon} /><path className="tour-roadview-route-centerline" ref={centerline} /></svg>
    <div className="tour-roadview-route-guide">
      <span>{moveFailed ? (ko ? '다음 사진이 없어요. 다른 지점을 눌러 보세요.' : 'No next photo here. Try another point.') : offRoute ? (ko ? '선택한 경로로 이동해 보세요' : 'Go to your selected route') : (ko ? '파란 경로를 따라 도착지까지' : 'Follow blue to your destination')}</span>
      <button type="button" disabled={moving} onClick={() => advanceRef.current()}>{moving ? '…' : offRoute ? (ko ? '경로로' : 'To route') : (ko ? '다음 ›' : 'Next ›')}</button>
    </div>
  </>
}

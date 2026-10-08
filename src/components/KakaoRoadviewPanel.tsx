import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { loadKakaoMaps, type KakaoMapsApi, type KakaoRoadview, type KakaoRoadviewClient } from '../services/kakaoMaps'
import './KakaoRoadviewPanel.css'

export interface KakaoRoadviewPanelProps {
  target: { lat: number; lng: number }
  locale: 'en' | 'ko'
  onClose: () => void
  onPositionChange: (position: { lat: number; lng: number }) => void
}

type RoadviewStatus = 'loading' | 'ready' | 'empty' | 'error'
const MOBILE_ROADVIEW_QUERY = '(max-width: 700px), (hover: none) and (pointer: coarse)'

export function KakaoRoadviewPanel({ target, locale, onClose, onPositionChange }: KakaoRoadviewPanelProps) {
  const anchorRef = useRef<HTMLSpanElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const roadviewRef = useRef<KakaoRoadview | null>(null)
  const clientRef = useRef<KakaoRoadviewClient | null>(null)
  const confirmedPanoRef = useRef<number | null>(null)
  const requestRef = useRef(0)
  const positionCallbackRef = useRef(onPositionChange)
  const [status, setStatus] = useState<RoadviewStatus>('loading')
  const [retry, setRetry] = useState(0)
  const [expanded, setExpanded] = useState(() => window.matchMedia(MOBILE_ROADVIEW_QUERY).matches)
  const [portalLayer] = useState(() => {
    const layer = document.createElement('div')
    layer.className = 'tour-roadview-layer'
    return layer
  })
  const openerRef = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null)
  const titleId = useId()
  const viewerId = useId()
  const ko = locale === 'ko'

  useLayoutEffect(() => {
    const stage = anchorRef.current?.closest('.tour-map-stage') ?? anchorRef.current?.parentElement
    if (!stage) return
    const focused = document.activeElement instanceof HTMLElement && portalLayer.contains(document.activeElement)
      ? document.activeElement : null
    portalLayer.classList.toggle('tour-roadview-layer--fullscreen', expanded)
    // Moving this same container preserves React's portal subtree and the SDK panorama.
    const parent = expanded ? document.body : stage
    if (portalLayer.parentElement !== parent) parent.appendChild(portalLayer)
    if (focused?.isConnected) focused.focus({ preventScroll: true })
  }, [expanded, portalLayer])

  useLayoutEffect(() => {
    const screen = anchorRef.current?.closest('.tour-screen')
    if (!screen) return
    const syncTheme = () => portalLayer.classList.toggle('tour-screen--dark', screen.classList.contains('tour-screen--dark'))
    syncTheme()
    const observer = new MutationObserver(syncTheme)
    observer.observe(screen, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [portalLayer])

  useLayoutEffect(() => {
    const media = window.matchMedia(MOBILE_ROADVIEW_QUERY)
    const change = (event: MediaQueryListEvent) => setExpanded(event.matches)
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [])

  useLayoutEffect(() => {
    if (!expanded) return
    const previousOverflow = document.body.style.getPropertyValue('overflow')
    const previousPriority = document.body.style.getPropertyPriority('overflow')
    const background = new Map<HTMLElement, boolean>()
    const lockBackground = () => {
      for (const child of document.body.children) {
        if (!(child instanceof HTMLElement) || child === portalLayer || /^(SCRIPT|STYLE|LINK)$/.test(child.tagName)) continue
        if (!background.has(child)) background.set(child, child.inert)
        child.inert = true
      }
    }
    document.body.style.setProperty('overflow', 'hidden')
    lockBackground()
    const observer = new MutationObserver(lockBackground)
    observer.observe(document.body, { childList: true })
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        setExpanded(false)
        return
      }
      if (event.key !== 'Tab') return
      const controls = [...portalLayer.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
        .filter(node => node.getClientRects().length && !node.closest('[inert]') && getComputedStyle(node).visibility !== 'hidden')
      const first = controls[0]
      const last = controls[controls.length - 1]
      const active = document.activeElement
      if (!first || !last) {
        event.preventDefault()
        panelRef.current?.focus({ preventScroll: true })
      } else if (!controls.includes(active as HTMLElement) || (event.shiftKey ? active === first : active === last)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus({ preventScroll: true })
      }
    }
    document.addEventListener('keydown', handleKey, true)
    if (!portalLayer.contains(document.activeElement)) {
      portalLayer.querySelector<HTMLButtonElement>('.tour-roadview-panel__controls button')?.focus({ preventScroll: true })
    }
    return () => {
      observer.disconnect()
      document.removeEventListener('keydown', handleKey, true)
      for (const [node, inert] of background) node.inert = inert
      if (previousOverflow) document.body.style.setProperty('overflow', previousOverflow, previousPriority)
      else document.body.style.removeProperty('overflow')
    }
  }, [expanded, portalLayer])

  useLayoutEffect(() => () => {
    portalLayer.remove()
    const opener = openerRef.current
    const candidates = [opener, ...document.querySelectorAll<HTMLElement>('.tour-map-view-dock .tour-roadview-toggle')]
    candidates.find(node => node?.isConnected && node.getClientRects().length && !node.closest('[inert]'))?.focus({ preventScroll: true })
  }, [portalLayer])

  useEffect(() => { positionCallbackRef.current = onPositionChange }, [onPositionChange])

  useEffect(() => {
    let disposed = false
    let expired = false
    let api: KakaoMapsApi | null = null
    let roadview: KakaoRoadview | null = null
    let expectedPano: number | null = null
    let panoramaReady = false
    const request = ++requestRef.current
    const isCurrent = () => !disposed && !expired && requestRef.current === request
    setStatus('loading')

    // The SDK has no panorama error event; allow a retry if lookup or imagery stalls.
    const timeout = window.setTimeout(() => {
      if (!isCurrent()) return
      expired = true
      setStatus('error')
    }, 25000)

    const fail = () => {
      if (!isCurrent()) return
      expired = true
      window.clearTimeout(timeout)
      setStatus('error')
    }

    const reportPosition = () => {
      if (!isCurrent() || !roadview || expectedPano === null) return
      try {
        // Ignore the previous panorama while a newly selected one is loading.
        const panoId = roadview.getPanoId()
        if (!panoramaReady && panoId !== expectedPano) return
        const position = roadview.getPosition()
        const lat = position.getLat()
        const lng = position.getLng()
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
        panoramaReady = true
        confirmedPanoRef.current = panoId
        window.clearTimeout(timeout)
        setStatus('ready')
        positionCallbackRef.current({ lat, lng })
      } catch {
        fail()
      }
    }
    const trackConfirmedPanorama = () => {
      if (!isCurrent() || !roadview || !panoramaReady) return
      confirmedPanoRef.current = roadview.getPanoId()
    }

    void loadKakaoMaps().then(loadedApi => {
      if (!isCurrent() || !hostRef.current) return
      api = loadedApi
      if (!roadviewRef.current) {
        roadviewRef.current = new api.Roadview(hostRef.current)
      }
      if (!clientRef.current) clientRef.current = new api.RoadviewClient()
      roadview = roadviewRef.current
      const client = clientRef.current!
      api.event.addListener(roadview, 'init', reportPosition)
      api.event.addListener(roadview, 'position_changed', reportPosition)
      api.event.addListener(roadview, 'panoid_changed', trackConfirmedPanorama)
      roadview.relayout()
      const position = new api.LatLng(target.lat, target.lng)

      const findPanorama = (radius: number) => {
        client.getNearestPanoId(position, radius, panoId => {
          if (!isCurrent() || !roadview) return
          try {
            if (panoId === null) {
              if (radius === 80) {
                findPanorama(200)
                return
              }
              window.clearTimeout(timeout)
              expired = true
              setStatus('empty')
              return
            }
            expectedPano = panoId
            // Selecting another map point may resolve to the already visible image.
            if (confirmedPanoRef.current === panoId && roadview.getPanoId() === panoId) {
              reportPosition()
              return
            }
            roadview.setPanoId(panoId, position)
          } catch {
            fail()
          }
        })
      }
      findPanorama(80)
    }).catch(fail)

    return () => {
      disposed = true
      window.clearTimeout(timeout)
      if (api && roadview) {
        api.event.removeListener(roadview, 'init', reportPosition)
        api.event.removeListener(roadview, 'position_changed', reportPosition)
        api.event.removeListener(roadview, 'panoid_changed', trackConfirmedPanorama)
      }
    }
  }, [target.lat, target.lng, retry])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let frame = 0
    const relayout = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => roadviewRef.current?.relayout())
    }
    const observer = new ResizeObserver(relayout)
    observer.observe(host)
    return () => {
      observer.disconnect()
      window.cancelAnimationFrame(frame)
    }
  }, [])

  const expandLabel = expanded ? (ko ? '지도로 돌아가기' : 'Return to map') : (ko ? '전체 화면으로 보기' : 'Full screen')
  const message = status === 'loading'
    ? (ko ? '거리 사진을 불러오는 중…' : 'Loading street imagery…')
    : status === 'empty'
      ? (ko ? '이 위치 주변에 거리 사진이 없습니다.' : 'No street imagery near this location.')
      : (ko ? '거리 사진을 불러오지 못했습니다.' : 'Street imagery could not be loaded.')

  return <>
    <span className="tour-roadview-anchor" ref={anchorRef} aria-hidden="true" />
    {createPortal(<section
    id="tour-roadview-panel"
    ref={panelRef}
    className={`tour-roadview-panel${expanded ? ' tour-roadview-panel--expanded' : ''}`}
    role={expanded ? 'dialog' : 'region'}
    aria-modal={expanded || undefined}
    aria-labelledby={titleId}
    tabIndex={-1}
    onClick={event => event.stopPropagation()}
    onDoubleClick={event => event.stopPropagation()}
    onKeyDown={event => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      if (expanded) setExpanded(false)
      else onClose()
    }}
  >
    <header className="tour-roadview-panel__header">
      <strong id={titleId}>{ko ? '로드뷰' : 'Street view'}</strong>
      <div className="tour-roadview-panel__controls">
        <button
          type="button"
          aria-label={expandLabel}
          title={expandLabel}
          aria-pressed={expanded}
          aria-controls={viewerId}
          onClick={() => setExpanded(value => !value)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            {expanded
              ? <path d="M9 3v6H3m12-6v6h6M3 15h6v6m12-6h-6v6" />
              : <path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6" />}
          </svg>
        </button>
        <button type="button" aria-label={ko ? '거리뷰 닫기' : 'Close street view'} title={ko ? '닫기' : 'Close'} onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </button>
      </div>
    </header>
    <div className="tour-roadview-panel__body" aria-busy={status === 'loading'}>
      <div id={viewerId} className="tour-roadview-panel__host" ref={hostRef} aria-label={ko ? '카카오 거리 파노라마' : 'Kakao street panorama'} />
      {status !== 'ready' && <div className="tour-roadview-panel__status" role="status" aria-live="polite">
        {status === 'loading' && <span className="tour-roadview-panel__spinner" aria-hidden="true" />}
        <p>{message}</p>
        {status !== 'loading' && <>
          <small>{ko ? '지도에서 다른 도로를 선택해 보세요.' : 'Select another road on the map.'}</small>
          <button type="button" onClick={() => setRetry(value => value + 1)}>{ko ? '다시 시도' : 'Retry'}</button>
        </>}
      </div>}
    </div>
  </section>, portalLayer)}
  </>
}

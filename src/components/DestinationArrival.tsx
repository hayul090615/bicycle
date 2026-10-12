import { useEffect, useRef, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import './DestinationArrival.css'

const BURSTS = [
  { x: 130, y: 165, color: '#59dcd9' }, { x: 670, y: 160, color: '#ffcf66' },
  { x: 280, y: 75, color: '#ff8da7' }, { x: 520, y: 70, color: '#bda0ff' },
  { x: 155, y: 345, color: '#ffb767' }, { x: 640, y: 345, color: '#80e9a7' },
] as const

export function DestinationArrival({ locale, onClose }: { locale: 'ko' | 'en'; onClose: () => void }) {
  const closeTarget = useRef<HTMLButtonElement>(null)
  const ko = locale === 'ko'
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeTarget.current?.focus({ preventScroll: true })
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose() }
      if (event.key === 'Tab') { event.preventDefault(); closeTarget.current?.focus({ preventScroll: true }) }
    }
    document.addEventListener('keydown', handleKey, true)
    const timeout = window.setTimeout(onClose, 8500)
    return () => {
      window.clearTimeout(timeout)
      document.removeEventListener('keydown', handleKey, true)
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
    }
  }, [onClose])

  return createPortal(<div className="tour-arrival-overlay" role="dialog" aria-modal="true" aria-labelledby="tour-arrival-title">
    <button className="tour-arrival-dismiss" ref={closeTarget} type="button" onClick={onClose} aria-label={ko ? '도착 축하 안내 닫기' : 'Close arrival celebration'}>
      <span className="tour-arrival-message">
        <span className="tour-arrival-eyebrow">{ko ? '도착지에 도착했어요' : 'You have arrived'}</span>
        <strong id="tour-arrival-title">{ko ? '안전운전' : 'Thank you for'}<span>{ko ? '수고하셨습니다.' : 'riding safely.'}</span></strong>
        <span className="tour-arrival-hint">{ko ? '화면을 누르면 닫혀요' : 'Tap anywhere to close'}</span>
      </span>
    </button>
    <svg className="tour-arrival-fireworks" viewBox="0 0 800 480" aria-hidden="true">
      {BURSTS.map((burst, index) => <g key={index} transform={`translate(${burst.x} ${burst.y})`}>
        <g className="tour-arrival-burst" style={{ '--burst-delay': `${index * .25}s`, '--burst-color': burst.color } as CSSProperties}>
          {Array.from({ length: 14 }, (_, ray) => {
            const angle = ray * Math.PI * 2 / 14
            return <line key={ray} x1={Math.cos(angle) * 16} y1={Math.sin(angle) * 16} x2={Math.cos(angle) * (ray % 2 ? 68 : 84)} y2={Math.sin(angle) * (ray % 2 ? 68 : 84)} />
          })}
        </g>
      </g>)}
    </svg>
  </div>, document.body)
}

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './GameGuide.css'

const HIDDEN_KEY = 'seoul-typing-game-guide-hidden-v1'
export function shouldShowGameGuide() {
  try { return localStorage.getItem(HIDDEN_KEY) !== '1' } catch { return true }
}

const PARTS = [
  { id: 'stats', selector: '.game-header .stats-row', title: '시간·점수·정확도', description: '첫 글자를 입력하면 시간이 시작돼요. 맞게 입력한 기록과 연속 정답을 여기서 확인하세요.' },
  { id: 'actions', selector: '.game-header .header-actions', title: '쉬거나 다시 살펴보기', description: '일시 정지로 잠깐 쉬고, 도움말로 이 설명을 다시 볼 수 있어요. 처음으로를 누르면 자치구 선택 화면으로 돌아가요.' },
  { id: 'current', selector: '.hud-station-card--current', title: '지금 있는 대여소', description: '자전거가 출발한 대여소예요. 글자를 맞게 입력할수록 지도 위 자전거가 다음 대여소로 움직여요.' },
  { id: 'input', selector: '.game-typing-area', title: '이 이름을 그대로 입력하세요', description: '가운데 크게 보이는 대여소 이름을 아래 칸에 입력하세요. 이름을 완성하면 다음 구간으로 넘어가요.' },
  { id: 'next', selector: '.hud-station-card--next', title: '그다음 대여소 미리 보기', description: '현재 입력 중인 구간을 마친 뒤 이어서 갈 대여소예요. 마지막 구간에는 코스 도착이라고 표시돼요.' },
] as const
type Bounds = { x: number; y: number; width: number; height: number }
type Layout = { width: number; height: number; targets: Array<Bounds | null> }

/** 실제 게임 위에 안내를 겹친다. 모바일에서는 한 번에 한 항목만 보여 준다. */
export function GameGuide({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const [hideAgain, setHideAgain] = useState(() => !shouldShowGameGuide())
  const [step, setStep] = useState(0)
  const [layout, setLayout] = useState<Layout>(() => ({ width: window.innerWidth, height: window.innerHeight, targets: [] }))
  const compact = layout.width < 1200 || layout.height < 850
  const dismiss = () => {
    try {
      if (hideAgain) localStorage.setItem(HIDDEN_KEY, '1')
      else localStorage.removeItem(HIDDEN_KEY)
    } catch { /* 안내는 저장이 차단되어도 닫을 수 있다. */ }
    onClose()
  }
  useEffect(() => {
    const element = dialog.current
    if (!element) return
    element.showModal()
    closeButton.current?.focus()
    return () => { if (element.open) element.close() }
  }, [])
  useLayoutEffect(() => {
    const targets = PARTS.map(part => document.querySelector<HTMLElement>(`.game-screen ${part.selector}`))
    const measure = () => {
      const next = { width: window.innerWidth, height: window.visualViewport?.height ?? window.innerHeight,
        targets: targets.map(element => {
          if (!element) return null
          const { x, y, width, height } = element.getBoundingClientRect()
          return { x, y, width, height }
        }) }
      setLayout(current => JSON.stringify(current) === JSON.stringify(next) ? current : next)
    }
    const observer = new ResizeObserver(measure)
    targets.forEach(element => { if (element) observer.observe(element) })
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    window.visualViewport?.addEventListener('resize', measure)
    measure()
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
      window.visualViewport?.removeEventListener('resize', measure)
    }
  }, [])
  const clampX = (x: number, width: number) => Math.max(20, Math.min(x, layout.width - width - 20))
  const positions = [
    { x: clampX(layout.width * .35 - 150, 300), y: Math.max(135, (layout.targets[0]?.y ?? 0) + (layout.targets[0]?.height ?? 80) + 55), width: 300 },
    { x: clampX(layout.width - 340, 300), y: Math.max(145, (layout.targets[1]?.y ?? 0) + (layout.targets[1]?.height ?? 80) + 100), width: 300 },
    { x: 30, y: layout.height * .53, width: 270 },
    { x: clampX(layout.width / 2 - 160, 320), y: Math.min(layout.height * .64, (layout.targets[3]?.y ?? layout.height) - 145), width: 320 },
    { x: layout.width - 300, y: layout.height * .53, width: 270 },
  ]
  const target = layout.targets[step]
  const cardAtTop = compact && target && target.y + target.height / 2 > layout.height / 2
  return createPortal(<dialog ref={dialog} className={`game-guide${compact ? ' game-guide--compact' : ''}`}
    aria-labelledby="game-guide-title" onCancel={event => { event.preventDefault(); dismiss() }} onKeyDown={event => {
      if (event.key !== 'Tab') return
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')]
      const first = controls[0], last = controls.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }}>
    <div className="game-guide-diagram" aria-hidden="true">
      {PARTS.map((part, index) => {
        const bounds = layout.targets[index]
        if (!bounds || (compact && index !== step)) return null
        return <div key={part.id} className="game-guide-highlight" style={{ left: Math.max(2, bounds.x - 5), top: Math.max(2, bounds.y - 5), width: Math.min(layout.width - 4, bounds.width + 10), height: bounds.height + 10 }}><b>{index + 1}</b></div>
      })}
      {!compact && <svg className="game-guide-arrows" width={layout.width} height={layout.height}>
        <defs><marker id="game-guide-arrow" markerWidth="9" markerHeight="9" refX="7" refY="4" orient="auto"><path d="m1 1 6 3-6 3" /></marker></defs>
        {PARTS.map((part, index) => {
          const bounds = layout.targets[index], position = positions[index]
          if (!bounds) return null
          const above = position.y > bounds.y
          const x = position.x + position.width / 2, y = above ? position.y : position.y + 88
          const endX = bounds.x + bounds.width / 2, endY = above ? bounds.y + bounds.height + 12 : bounds.y - 12
          return <path key={part.id} d={`M${x} ${y} Q${x} ${(y + endY) / 2} ${endX} ${endY}`} markerEnd="url(#game-guide-arrow)" />
        })}
      </svg>}
    </div>
    {!compact && <ol className="game-guide-callouts">{PARTS.map((part, index) => <li key={part.id} style={{ left: positions[index].x, top: positions[index].y, width: positions[index].width }}>
      <span>{index + 1}</span><div><h3>{part.title}</h3><p>{part.description}</p></div>
    </li>)}</ol>}
    <section className={`game-guide-card${cardAtTop ? ' game-guide-card--top' : ''}`}>
      <p className="game-guide-kicker">처음이라면 여기부터</p>
      <h2 id="game-guide-title">글자를 입력하며 서울을 달려요</h2>
      {compact ? <div className="game-guide-step" aria-live="polite">
        <span>{step + 1} / {PARTS.length}</span><h3>{PARTS[step].title}</h3><p>{PARTS[step].description}</p>
        <div className="game-guide-navigation"><button type="button" disabled={step === 0} onClick={() => setStep(value => value - 1)}>이전</button>
          <button type="button" disabled={step === PARTS.length - 1} onClick={() => setStep(value => value + 1)}>다음</button></div>
      </div> : <p className="game-guide-intro">표시된 다섯 곳을 확인해 보세요.<br />설명을 보는 동안 게임은 멈춰 있어요.</p>}
      <label className="game-guide-remember"><input type="checkbox" checked={hideAgain} onChange={event => setHideAgain(event.target.checked)} />다음부터 이 설명 보지 않기</label>
      <button ref={closeButton} className="game-guide-start" type="button" onClick={dismiss}>설명 닫고 시작</button>
    </section>
  </dialog>, document.body)
}

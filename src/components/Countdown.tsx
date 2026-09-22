import { BIKE_IMAGE_PATH } from './BikeMarker'

interface CountdownProps {
  value: number
  courseTitle: string
  stationName: string
}

export function Countdown({ value, courseTitle, stationName }: CountdownProps) {
  return <div className="countdown-overlay" role="status" aria-live="assertive">
    <svg className="countdown-route-art" viewBox="0 0 1000 700" preserveAspectRatio="none" aria-hidden="true">
      <path className="countdown-route-shadow" d="M-40 560 C150 490 180 255 365 330 S660 485 1040 120" />
      <path className="countdown-route-line" d="M-40 560 C150 490 180 255 365 330 S660 485 1040 120" />
      <circle cx="166" cy="455" r="9" />
      <circle cx="365" cy="330" r="9" />
      <circle cx="704" cy="377" r="9" />
    </svg>
    <section className="countdown-card">
      <div className="countdown-topline"><span>SEOUL TYPE &amp; RIDE</span><b>COURSE READY</b></div>
      <div className="countdown-bike-lockup" aria-hidden="true">
        <span className="countdown-bike-road" />
        <img src={BIKE_IMAGE_PATH} alt="" />
      </div>
      <span className="countdown-label">READY TO RIDE</span>
      <div className="countdown-badge-shell">
        <i aria-hidden="true" />
        <div className="countdown-badge" key={value}>{value > 0 ? value : 'GO'}</div>
      </div>
      <h2>{value > 0 ? '라이딩을 준비하세요' : '출발 준비 완료!'}</h2>
      <p>{value > 0 ? '손가락을 키보드 위에 가볍게 올려주세요.' : '첫 글자를 입력하면 시간이 시작됩니다.'}</p>
      <div className="countdown-course-info">
        <span><small>COURSE</small><strong>{courseTitle}</strong></span>
        <span><small>START</small><strong>{stationName}</strong></span>
      </div>
      <div className="countdown-steps" aria-label={`카운트다운 ${value}`}>
        {[3, 2, 1].map((step) => <i key={step} className={value <= step ? 'is-active' : ''} />)}
      </div>
    </section>
  </div>
}

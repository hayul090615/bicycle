interface GameHeaderProps {
  district: string
  elapsedSeconds: number
  score: number
  accuracy: number
  combo: number
  onPause: () => void
  onHome: () => void
  paused: boolean
  progress: number
  lightMode: boolean
  onToggleTheme: () => void
}

export function GameHeader(props: GameHeaderProps) {
  return <header className="game-header">
    <div className="game-title-block">
      <div className="game-brand-row">
        <span className="eyebrow">SEOUL TYPING PRACTICE</span>
        <small>대여소: 서울 열린데이터광장 · 지도: OpenStreetMap contributors</small>
      </div>
      <h1>{props.district} 코스</h1>
    </div>
    <div className="header-center">
      <div className="stats-row" aria-label="게임 기록">
        <div className="stat"><span>시간</span><strong>{props.elapsedSeconds}초</strong></div>
        <div className="stat"><span>점수</span><strong>{props.score.toLocaleString()}</strong></div>
        <div className="stat"><span>정확도</span><strong>{props.accuracy}%</strong></div>
        <div className="stat"><span>연속 정답</span><strong>{props.combo}</strong></div>
      </div>
      <div className="header-progress" role="progressbar" aria-label="전체 코스 진행률" aria-valuenow={Math.round(props.progress)} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${props.progress}%` }} />
      </div>
    </div>
    <div className="header-actions">
      <button className="button button--ghost" onClick={props.onToggleTheme}>{props.lightMode ? '☾ 다크' : '☀ 라이트'}</button>
      <button className="button button--ghost" onClick={props.onPause}>{props.paused ? '▶ 계속하기' : 'Ⅱ 일시 정지'}</button>
      <button className="button button--ghost" onClick={props.onHome}>처음으로</button>
    </div>
  </header>
}

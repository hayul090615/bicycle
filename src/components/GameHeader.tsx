/**
 * 타자 게임의 점수·콤보·시간·정확도와 일시정지 제어를 표시한다. 계산된 게임 상태는 이 화면을 사용하는 부모 화면에서 전달받는다.
 */
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
  // 아래 JSX는 화면에 보일 내용이다. 중괄호 안에는 위에서 계산한 값이나 버튼 동작을 넣는다.
  return <header className="game-header">
    <div className="game-title-block">
      <div className="game-brand-row">
        <span className="eyebrow">TTAREUNGI SEOUL JOURNEY</span>
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

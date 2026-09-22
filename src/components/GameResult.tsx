import type { GameResultData, LeaderboardEntry } from '../types/game'

interface GameResultProps {
  district: string
  result: GameResultData
  highScore: number
  totalStations: number
  leaderboard: LeaderboardEntry[]
  currentRankingId: string | null
  onRetry: () => void
  onHome: () => void
}

const rankLabel = (rank: number) => rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : String(rank)

export function GameResult({ district, result, highScore, totalStations, leaderboard, currentRankingId, onRetry, onHome }: GameResultProps) {
  const minutes = Math.floor(result.elapsedSeconds / 60)
  const seconds = result.elapsedSeconds % 60
  const currentRankIndex = leaderboard.findIndex((entry) => entry.id === currentRankingId)
  const currentRank = currentRankIndex + 1
  const currentEntry = currentRankIndex >= 0 ? leaderboard[currentRankIndex] : undefined
  const rankingRows = currentRank > 10 && currentEntry
    ? [...leaderboard.slice(0, 10), currentEntry]
    : leaderboard.slice(0, 10)
  return <main className="result-screen"><div className="result-layout"><section className="result-card">
      <div className={`result-icon ${result.completed ? 'result-icon--complete' : ''}`}>{result.completed ? '⚑' : '⌛'}</div>
      <span className="eyebrow">{district} RIDE REPORT</span>
      <h1>{result.completed ? '코스 완주!' : '라이딩 종료'}</h1>
      <p>{result.completed ? '모든 대여소를 지나 도착점에 도착했어요.' : '여기까지도 멋진 라이딩이었어요. 다시 도전해 보세요.'}</p>
      <div className="score-block"><span>총점</span><strong>{result.score.toLocaleString()}</strong><small>최고 점수 {highScore.toLocaleString()}</small></div>
      <div className="result-stats">
        <div><span>걸린 시간</span><strong>{minutes}:{String(seconds).padStart(2, '0')}</strong></div>
        <div><span>정확도</span><strong>{result.accuracy}%</strong></div>
        <div><span>분당 타수</span><strong>{result.cpm}</strong></div>
        <div><span>최고 연속 정답</span><strong>{result.bestCombo}</strong></div>
        <div><span>통과한 대여소</span><strong>{result.passedStations} / {totalStations - 1}</strong></div>
      </div>
      <div className="result-actions"><button className="button button--primary" onClick={onRetry}>다시 하기</button><button className="button button--secondary" onClick={onHome}>자치구 선택으로</button></div>
    </section>
    <aside className="result-ranking-sidebar">
      <section className="leaderboard" aria-label="라이딩 랭킹">
      <header><div><span>LOCAL RANKING</span><h2>라이딩 랭킹</h2></div>{currentRank > 0 && <strong>이번 기록 {currentRank}위</strong>}</header>
      <div className="leaderboard-list">
        {rankingRows.map((entry, rowIndex) => {
          const rank = leaderboard.findIndex((item) => item.id === entry.id) + 1
          const isCurrent = entry.id === currentRankingId
          const isSeparated = rowIndex === 10
          return <div key={entry.id} className={`leaderboard-row ${isCurrent ? 'leaderboard-row--current' : ''} ${isSeparated ? 'leaderboard-row--separated' : ''}`}
            aria-current={isCurrent ? 'true' : undefined}>
            <b className={`rank-badge ${rank <= 3 ? 'rank-badge--medal' : ''}`}>{rankLabel(rank)}</b>
            <span><strong>{entry.district} 코스</strong><small>{entry.completed ? '완주' : '시간 종료'}</small></span>
            <strong>{entry.score.toLocaleString()}점</strong>
            <small>{entry.accuracy}%</small>
            <small>{Math.floor(entry.elapsedSeconds / 60)}:{String(entry.elapsedSeconds % 60).padStart(2, '0')}</small>
          </div>
        })}
      </div>
      </section>
    </aside>
  </div></main>
}

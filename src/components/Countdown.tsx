export function Countdown({ value }: { value: number }) {
  return <div className="countdown-overlay" role="status" aria-live="assertive">
    <div className="countdown-badge" key={value}>{value > 0 ? value : '출발!'}</div>
    <p>손가락을 준비하세요</p>
  </div>
}

/** 대여소는 기본으로 표시하고, 이 버튼 줄에서는 추가로 볼 한 종류를 고른다. */
import type { NearbyPlace, NearbyPlaceCategory } from '../services/nearbyPlaces'
export type DiscoveryCategory = NearbyPlaceCategory | 'signals' | 'cctv'
const OPTIONS: Array<{ id: DiscoveryCategory; ko: string; en: string; icon: string }> = [
  { id: 'food', ko: '식당', en: 'Restaurants', icon: '🍴' },
  { id: 'cafe', ko: '카페', en: 'Cafés', icon: '☕' },
  { id: 'convenience', ko: '편의점', en: 'Shops', icon: '🏪' },
  { id: 'toilet', ko: '화장실', en: 'Toilets', icon: '🚻' },
  { id: 'visit', ko: '명소', en: 'Sights', icon: '📍' },
  { id: 'signals', ko: '신호등', en: 'Signals', icon: '🚦' },
  { id: 'cctv', ko: 'CCTV', en: 'CCTV', icon: '◉' },
]
export function MapDiscoveryBar({ locale, selected, onSelect, status, count, places, focusedPoint, onFocus, region, cctvLocationStatus, showDirectionsToggle, directionsVisible, onToggleDirections }: {
  locale: 'ko' | 'en'; selected: DiscoveryCategory | null; onSelect: (category: DiscoveryCategory) => void
  status: string; count: number; places: NearbyPlace[]; focusedPoint: [number, number] | null
  onFocus: (point: [number, number] | null) => void; region: string
  cctvLocationStatus: 'ready' | 'locating' | 'unavailable'
  showDirectionsToggle: boolean; directionsVisible: boolean; onToggleDirections: () => void
}) {
  const ko = locale === 'ko'
  const focused = focusedPoint ? places.find(place => Math.abs(place.lng - focusedPoint[0]) + Math.abs(place.lat - focusedPoint[1]) < .0001) : null
  // 아래 JSX는 화면에 보일 내용이다. 중괄호 안에는 위에서 계산한 값이나 버튼 동작을 넣는다.
  return <div className="tour-discovery-bar">
    <nav className="tour-discovery-chips" aria-label={ko ? '주변 지도 정보' : 'Nearby map places'}>
      {OPTIONS.map(option => <button key={option.id} type="button" aria-pressed={selected === option.id}
        onClick={() => onSelect(option.id)}><span aria-hidden="true">{option.icon}</span>{ko ? option.ko : option.en}
        {selected === option.id && <small>{status === 'loading' ? '…' : count}</small>}
      </button>)}
      {showDirectionsToggle && <button type="button" className="tour-discovery-directions-toggle" aria-expanded={directionsVisible} onClick={onToggleDirections}>
        {directionsVisible ? (ko ? '목록 닫기' : 'Close list') : (ko ? '목록 열기' : 'Show list')}
      </button>}
    </nav>
    {selected === 'cctv' && <div className="tour-discovery-note" role="status">
      <span>{cctvLocationStatus === 'locating' ? (ko ? '내 위치를 확인하는 중…' : 'Finding your location…')
        : cctvLocationStatus === 'unavailable' ? (ko ? '위치를 허용하면 내 주변 20m CCTV를 표시해요.' : 'Allow location access to see CCTV within 20 m of you.')
          : status === 'loading' ? (ko ? '내 주변 20m CCTV를 찾는 중…' : 'Finding CCTV within 20 m of you…')
            : status === 'error' ? (ko ? 'CCTV 위치 자료를 불러오지 못했어요.' : 'CCTV locations could not be loaded.')
            : count === 0 ? (ko ? '내 위치 20m 안에 등록된 CCTV가 없어요.' : 'No registered CCTV within 20 m of your location.')
              : ko ? `내 주변 20m · CCTV ${count}곳` : `Within 20 m of you · ${count} CCTV locations`}</span>
    </div>}
    {selected === 'signals' && <div className="tour-discovery-note" role="status"><span>
      {status === 'loading' ? (ko ? '주변 500m 신호등을 찾는 중…' : 'Finding signals within 500 m…')
        : status === 'error' ? (ko ? '신호등 자료를 불러오지 못했어요. 다시 눌러 주세요.' : 'Signals could not be loaded. Please try again.')
          : ko ? `주변 500m · 신호등 ${count}곳` : `Within 500 m · ${count} signals`}
    </span></div>}
    {selected && selected !== 'signals' && selected !== 'cctv' && <div className="tour-discovery-note" role="status">
      <span>{status === 'loading' ? (ko ? '주변 500m 장소를 찾는 중…' : 'Finding places within 500 m…')
        : status === 'error' ? (ko ? '장소 검색을 잠시 사용할 수 없어요.' : 'Places are temporarily unavailable.')
          : ko ? `주변 500m · ${count}곳` : `Within 500 m · ${count} places`}</span>
      {['food', 'cafe', 'visit'].includes(selected) && <a href={`https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(`${region} ${selected === 'visit' ? '가볼만한곳' : selected === 'cafe' ? '카페' : '맛집'}`)}`} target="_blank" rel="noopener noreferrer">{ko ? '네이버 블로그 ↗' : 'Naver blogs ↗'}</a>}
    </div>}
    {focused && <div className="tour-discovery-detail"><div><strong>{focused.name}</strong><small>{Math.round(focused.distanceMeters)}m · {focused.address}</small></div>
      {['food', 'cafe', 'visit'].includes(focused.category) && <a href={focused.blogUrl} target="_blank" rel="noopener noreferrer">
        {focused.blog ? (ko ? '블로그 글 ↗' : 'Blog post ↗') : (ko ? '블로그 검색 ↗' : 'Blog search ↗')}
      </a>}
      <button type="button" aria-label={ko ? '장소 안내 닫기' : 'Close place details'} onClick={() => onFocus(null)}>×</button>
    </div>}
  </div>
}

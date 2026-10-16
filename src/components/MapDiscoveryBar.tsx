import { siteText } from '../services/tourTranslations'
import type { SiteLocale } from '../services/siteLocale'
/** 대여소는 기본으로 표시하고, 이 버튼 줄에서는 추가로 볼 한 종류를 고른다. */
import type { NearbyPlace, NearbyPlaceCategory } from '../services/nearbyPlaces'
import type { ReactNode } from 'react'
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
export function MapDiscoveryBar({ locale, selected, onSelect, status, count, places, focusedPoint, onFocus, region, cctvLocationStatus, showDirectionsToggle, directionsVisible, onToggleDirections, controls }: {
  locale: SiteLocale; selected: DiscoveryCategory | null; onSelect: (category: DiscoveryCategory) => void
  status: string; count: number; places: NearbyPlace[]; focusedPoint: [number, number] | null
  onFocus: (point: [number, number] | null) => void; region: string
  cctvLocationStatus: 'ready' | 'locating' | 'unavailable'
  showDirectionsToggle: boolean; directionsVisible: boolean; onToggleDirections: () => void
  controls: ReactNode
}) {
  const ko = locale === 'ko'
  const focused = focusedPoint ? places.find(place => Math.abs(place.lng - focusedPoint[0]) + Math.abs(place.lat - focusedPoint[1]) < .0001) : null
  // 아래 JSX는 화면에 보일 내용이다. 중괄호 안에는 위에서 계산한 값이나 버튼 동작을 넣는다.
  return <div className="tour-discovery-bar">
    <div className="tour-discovery-toolbar">
    <nav className="tour-discovery-chips" aria-label={siteText(locale, 'Nearby map places', '주변 지도 정보')}>
      {OPTIONS.map(option => <button key={option.id} type="button" aria-pressed={selected === option.id}
        onClick={() => onSelect(option.id)}><span aria-hidden="true">{option.icon}</span>{siteText(locale, option.en, option.ko)}
        {selected === option.id && <small>{status === 'loading' ? '…' : count}</small>}
      </button>)}
      {showDirectionsToggle && <button type="button" className="tour-discovery-directions-toggle" aria-expanded={directionsVisible} onClick={onToggleDirections}>
        {directionsVisible ? (siteText(locale, 'Close list', '목록 닫기')) : (siteText(locale, 'Show list', '목록 열기'))}
      </button>}
    </nav>
    {controls}
    </div>
    {selected === 'cctv' && <div className="tour-discovery-note" role="status">
      <span>{cctvLocationStatus === 'locating' ? (siteText(locale, 'Finding your location…', '내 위치를 확인하는 중…'))
        : cctvLocationStatus === 'unavailable' ? (siteText(locale, 'Allow location access to see CCTV within 20 m of you.', '위치를 허용하면 내 주변 20m CCTV를 표시해요.'))
          : status === 'loading' ? (siteText(locale, 'Finding CCTV within 20 m of you…', '내 주변 20m CCTV를 찾는 중…'))
            : status === 'error' ? (siteText(locale, 'CCTV locations could not be loaded.', 'CCTV 위치 자료를 불러오지 못했어요.'))
            : count === 0 ? (siteText(locale, 'No registered CCTV within 20 m of your location.', '내 위치 20m 안에 등록된 CCTV가 없어요.'))
              : siteText(locale, `Within 20 m of you · ${count} CCTV locations`, `내 주변 20m · CCTV ${count}곳`)}</span>
    </div>}
    {selected === 'signals' && <div className="tour-discovery-note" role="status"><span>
      {status === 'loading' ? (siteText(locale, 'Finding signals within 500 m…', '주변 500m 신호등을 찾는 중…'))
        : status === 'error' ? (siteText(locale, 'Signals could not be loaded. Please try again.', '신호등 자료를 불러오지 못했어요. 다시 눌러 주세요.'))
          : siteText(locale, `Within 500 m · ${count} signals`, `주변 500m · 신호등 ${count}곳`)}
    </span></div>}
    {selected && selected !== 'signals' && selected !== 'cctv' && <div className="tour-discovery-note" role="status">
      <span>{status === 'loading' ? (siteText(locale, 'Finding places within 500 m…', '주변 500m 장소를 찾는 중…'))
        : status === 'error' ? (siteText(locale, 'Places are temporarily unavailable.', '장소 검색을 잠시 사용할 수 없어요.'))
          : siteText(locale, `Within 500 m · ${count} places`, `주변 500m · ${count}곳`)}</span>
      {['food', 'cafe', 'visit'].includes(selected) && <a href={`https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(`${region} ${selected === 'visit' ? '가볼만한곳' : selected === 'cafe' ? '카페' : '맛집'}`)}`} target="_blank" rel="noopener noreferrer">{siteText(locale, 'Naver blogs ↗', '네이버 블로그 ↗')}</a>}
    </div>}
    {focused && <div className="tour-discovery-detail"><div><strong>{focused.name}</strong><small>{Math.round(focused.distanceMeters)}m · {focused.address}</small></div>
      {['food', 'cafe', 'visit'].includes(focused.category) && <a href={focused.blogUrl} target="_blank" rel="noopener noreferrer">
        {focused.blog ? (siteText(locale, 'Blog post ↗', '블로그 글 ↗')) : (siteText(locale, 'Blog search ↗', '블로그 검색 ↗'))}
      </a>}
      <button type="button" aria-label={siteText(locale, 'Close place details', '장소 안내 닫기')} onClick={() => onFocus(null)}>×</button>
    </div>}
  </div>
}

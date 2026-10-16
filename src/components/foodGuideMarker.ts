import { siteText } from '../services/tourTranslations'
import type { SiteLocale } from '../services/siteLocale'
/**
 * 지도 위 맛집 안내 버튼용 DOM을 만든다. 선택 언어와 표시 순서를 반영하고 클릭 시 상위 맛집 안내 열기 함수를 호출한다.
 */
export function createFoodGuideMarker(locale: SiteLocale, index: number, onClick: () => void) {
  const marker = document.createElement('button')
  marker.type = 'button'
  marker.className = `tour-food-guide-map-marker tour-food-guide-map-marker--${index % 3}`
  marker.setAttribute('aria-label', siteText(locale, `Open food recommendations at route point ${Math.round(index * 100)} m`, `경로 ${Math.round(index * 100)}m 지점 맛집 추천 열기`))
  marker.title = siteText(locale, 'Food recommendations near this point', '이 지점 주변 맛집 추천')
  marker.innerHTML = '<span aria-hidden="true">🧑‍🍳</span>'
  marker.addEventListener('click', event => {
    event.stopPropagation()
    onClick()
  })
  return marker
}

/**
 * 지도 위 맛집 안내 버튼용 DOM을 만든다. 선택 언어와 표시 순서를 반영하고 클릭 시 상위 맛집 안내 열기 함수를 호출한다.
 */
export function createFoodGuideMarker(locale: 'en' | 'ko', index: number, onClick: () => void) {
  const marker = document.createElement('button')
  marker.type = 'button'
  marker.className = `tour-food-guide-map-marker tour-food-guide-map-marker--${index % 3}`
  marker.setAttribute('aria-label', locale === 'ko' ? `경로 ${Math.round(index * 100)}m 지점 맛집 추천 열기` : `Open food recommendations at route point ${Math.round(index * 100)} m`)
  marker.title = locale === 'ko' ? '이 지점 주변 맛집 추천' : 'Food recommendations near this point'
  marker.innerHTML = '<span aria-hidden="true">🧑‍🍳</span>'
  marker.addEventListener('click', event => {
    event.stopPropagation()
    onClick()
  })
  return marker
}

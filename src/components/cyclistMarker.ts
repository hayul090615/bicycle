/** A restrained cyclist pictogram for map scale, without synthetic photo faces. */
export function createCyclistMarker(index: number, locale: 'en' | 'ko') {
  const element = document.createElement('span')
  element.className = `tour-map-person tour-map-person--${index % 3}`
  element.setAttribute('role', 'img')
  element.setAttribute('aria-label', locale === 'ko' ? '경로 위 자전거 이용자 표시' : 'Cyclist on the route')
  element.title = locale === 'ko' ? '경로 위 자전거 이용자 표시' : 'Cyclist on the route'
  element.innerHTML = '<svg viewBox="0 0 64 92" aria-hidden="true" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="13" cy="70" r="10" stroke="#263a32" stroke-width="2.6"/><circle cx="51" cy="70" r="10" stroke="#263a32" stroke-width="2.6"/><path d="m13 70 13-23 13 23H13l17-10 8 10 7-27m-13 0h12m-8-3 8 3" stroke="#263a32" stroke-width="2.4"/><path d="m26 48 4-15 10-4 7 8-8 11-8 6m-3-10-8 12m11-26 8-5 5 3" stroke="currentColor" stroke-width="5.8"/><path d="m25 56 5 5-8 9m10-14 8 9 8 1" stroke="#263a32" stroke-width="3.3"/><circle cx="43" cy="16" r="6.4" fill="#d6a887" stroke="#744e39" stroke-width="1.5"/><path d="M36 15a7 7 0 0 1 13-2l-1 3-11 1z" fill="#e2b44f" stroke="#775d32" stroke-width="1.4"/></svg>'
  return element
}

/** 식당·카페·화장실 등 주변 장소의 정보와 후기, 길찾기를 같은 팝업으로 제공한다. */
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { NearbyPlace, NearbyPlaceCategory } from '../services/nearbyPlaces'
import { fetchPlaceReviews, type PlaceReviews } from '../services/placeReviews'
import './PlaceReviewPopup.css'

const CATEGORY_LABELS: Record<NearbyPlaceCategory, [string, string]> = {
  food: ['식당', 'Restaurant'], cafe: ['카페', 'Café'], convenience: ['편의점', 'Convenience store'],
  toilet: ['공중 화장실', 'Public toilet'], visit: ['명소', 'Attraction'],
}

export function PlaceReviewPopup({ place, region, locale, anchor, onClose, onNavigate }: {
  place: NearbyPlace; region: string; locale: 'ko' | 'en'; anchor: Element; onClose: () => void; onNavigate: () => void
}) {
  const ko = locale === 'ko'
  const titleId = useId()
  const card = useRef<HTMLElement>(null)
  const [position, setPosition] = useState({ left: 12, top: 12, mobile: false })
  const [data, setData] = useState<{ id: string; result: PlaceReviews; status: 'loading' | 'ready' | 'unavailable' } | null>(null)
  const [reviewsOpen, setReviewsOpen] = useState(false)
  const reviewsId = useId()
  const reviews = data?.id === place.id ? data : null
  const posts = reviews?.result.posts.length ? reviews.result.posts : (place.blog ? [place.blog] : [])
  const rating = reviews?.result.rating ?? null

  useEffect(() => {
    const controller = new AbortController()
    setData({ id: place.id, result: { posts: [], rating: null }, status: 'loading' })
    const timeout = window.setTimeout(() => {
      setData({ id: place.id, result: { posts: [], rating: null }, status: 'unavailable' })
      controller.abort()
    }, 8500)
    void fetchPlaceReviews(place, region, controller.signal).then(result => {
      if (!controller.signal.aborted) setData({ id: place.id, result, status: 'ready' })
    }).catch(() => {
      if (!controller.signal.aborted) setData({ id: place.id, result: { posts: [], rating: null }, status: 'unavailable' })
    }).finally(() => window.clearTimeout(timeout))
    return () => { window.clearTimeout(timeout); controller.abort() }
  }, [place.id, place.name, region])

  useLayoutEffect(() => {
    let frame = 0
    const followMarker = () => {
      const element = card.current
      const stage = element?.closest('.tour-map-stage')
      if (!element || !stage) return
      if (!anchor.isConnected) { onClose(); return }
      const bounds = stage.getBoundingClientRect(), pin = anchor.getBoundingClientRect()
      const map = anchor.closest('.kakao-route-map, .tour-maplibre-3d, .leaflet-container, .google-route-3d')?.getBoundingClientRect() ?? bounds
      const minLeft = Math.max(10, map.left - bounds.left + 10), maxRight = Math.min(bounds.width - 10, map.right - bounds.left - 10)
      const minTop = Math.max(10, map.top - bounds.top + 10), maxBottom = Math.min(bounds.height - 10, map.bottom - bounds.top - 10)
      const mobile = window.matchMedia('(max-width: 700px)').matches
      const width = element.offsetWidth, height = element.offsetHeight
      let left = pin.right - bounds.left + 12
      if (left + width > maxRight) left = pin.left - bounds.left - width - 12
      left = Math.max(minLeft, Math.min(left, maxRight - width))
      const top = Math.max(minTop, Math.min(pin.top - bounds.top - 24, maxBottom - height))
      setPosition(current => current.mobile === mobile && Math.abs(current.left - left) < .5 && Math.abs(current.top - top) < .5 ? current : { left, top, mobile })
      frame = window.requestAnimationFrame(followMarker)
    }
    followMarker()
    return () => window.cancelAnimationFrame(frame)
  }, [anchor, onClose])

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault(); event.stopPropagation(); onClose()
    }
    document.addEventListener('keydown', closeOnEscape, true)
    return () => document.removeEventListener('keydown', closeOnEscape, true)
  }, [onClose])

  return <aside ref={card} className={`tour-place-review-popup${position.mobile ? ' is-mobile' : ''}`}
    style={position.mobile ? undefined : { left: position.left, top: position.top }} role="dialog" aria-labelledby={titleId}>
    <header><div><h3 id={titleId}>{place.name}</h3></div>
      <button type="button" aria-label={ko ? '장소 팝업 닫기' : 'Close place popup'} onClick={onClose}>×</button>
    </header>
    <p className="tour-place-review-address">{place.address || (ko ? '주소 정보 없음' : 'Address unavailable')}</p>
    <p className="tour-place-review-status">{place.category === 'toilet'
      ? (ko ? '🚻 이용 가능 여부를 현장에서 확인해 주세요.' : '🚻 Check availability on site.')
      : (ko ? '방문 전 운영시간을 확인해 주세요.' : 'Check opening hours before visiting.')}</p>
    <div className="tour-place-review-tags"><span>{CATEGORY_LABELS[place.category][ko ? 0 : 1]}</span>
      <span className="tour-place-review-distance">{Math.round(place.distanceMeters)}m</span>
      <span>{ko ? '운영시간 확인 필요' : 'Check opening hours'}</span>
    </div>
    <div className="tour-place-review-rating" role="status">
      {rating ? <><span className="tour-place-review-stars" aria-hidden="true">★★★★★<span style={{ width: `${rating.value / 5 * 100}%` }}>★★★★★</span></span>
        <strong>{rating.value.toFixed(1)} / 5</strong><a href={rating.post.link} target="_blank" rel="noopener noreferrer">{ko ? '글쓴이 별점 · 출처 ↗' : 'Author rating · source ↗'}</a></>
        : <><span aria-hidden="true">☆</span><strong>{ko ? '아직 별점 없음' : 'No rating available'}</strong></>}
    </div>
    <button type="button" className="tour-place-review-toggle" aria-expanded={reviewsOpen} aria-controls={reviewsId} onClick={() => setReviewsOpen(open => !open)}>
      {place.category === 'toilet' ? (ko ? '별점 · 청결도 리뷰' : 'Ratings · cleanliness reviews') : (ko ? '별점 · 이용 후기' : 'Ratings · visitor reviews')}
    </button>
    {reviewsOpen && <section id={reviewsId} className="tour-place-review-posts" aria-label={ko ? '블로그 후기' : 'Blog reviews'}>
      {posts.length ? posts.map(post => <a key={post.link} href={post.link} target="_blank" rel="noopener noreferrer">
        <strong>{post.title.replace(/<[^>]*>/g, '')}</strong><small>{post.bloggerName.replace(/<[^>]*>/g, '')}{post.postDate ? ` · ${post.postDate.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1.$2.$3')}` : ''}</small>
      </a>) : <p>{reviews?.status === 'loading' ? (ko ? '블로그 후기를 찾는 중…' : 'Finding blog reviews…')
        : (ko ? '아래 버튼에서 이 장소의 블로그 후기를 확인해 보세요.' : 'Use the link below to find reviews of this place.')}</p>}
      <a className="tour-place-review-link" href={place.blogUrl} target="_blank" rel="noopener noreferrer">{ko ? '네이버 블로그 후기 보기 ↗' : 'View blog reviews on Naver ↗'}</a>
    </section>}
    <button type="button" className="tour-place-review-navigate" onClick={onNavigate}>{ko ? '길찾기 시작' : 'Start directions'}</button>
  </aside>
}

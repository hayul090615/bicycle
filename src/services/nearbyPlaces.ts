/**
 * 지도의 가운데에서 500m 안에 있는 실제 장소를 찾는다.
 * 카카오의 장소 목록과 네이버의 장소·블로그 정보를 합치고 같은 장소는 한 번만 남긴다.
 */
import { loadKakaoMaps, type KakaoMapsApi, type KakaoPlaceResult } from './kakaoMaps'
import { metersBetween } from './nearbyBikes'
import type { NaverBlogPost } from './naverBlogs'

export const MAP_NEARBY_RADIUS_METERS = 500
export type NearbyPlaceCategory = 'food' | 'cafe' | 'convenience' | 'toilet' | 'visit'
export type NearbyPlace = {
  id: string; name: string; lat: number; lng: number; address: string; category: NearbyPlaceCategory
  distanceMeters: number; blogUrl: string; blog?: NaverBlogPost
}
export type NearbyPlacesResult = { places: NearbyPlace[]; region: string; blogsAvailable: boolean; blogs: NaverBlogPost[] }
const cache = new Map<string, { result: NearbyPlacesResult; expires: number }>()
// 카카오 검색에 보낼 분류 번호다. FD6은 음식점, CE7은 카페, CS2는 편의점, AT4는 관광명소다.
const categoryCodes = { food: 'FD6', cafe: 'CE7', convenience: 'CS2', visit: 'AT4' }

/** 지도 좌표를 동네 이름으로 바꿔 다른 지역의 블로그를 섞지 않게 한다. */
async function regionName(api: KakaoMapsApi, center: { lat: number; lng: number }) {
  return new Promise<string>(resolve => {
    const timeout = window.setTimeout(() => resolve('서울'), 2500)
    new api.services.Geocoder().coord2RegionCode(center.lng, center.lat, (regions, status) => {
      window.clearTimeout(timeout)
      const region = regions.find(item => item.region_type === 'B') ?? regions[0]
      resolve(status === api.services.Status.OK && region ? `서울 ${region.region_2depth_name} ${region.region_3depth_name}` : '서울')
    })
  })
}

/** 검색 결과가 늦게 도착해도 취소한 화면에는 적용하지 않는다. */
async function kakaoPlaces(api: KakaoMapsApi, category: NearbyPlaceCategory, center: { lat: number; lng: number }, signal: AbortSignal) {
  const query = (keyword?: string) => new Promise<KakaoPlaceResult[]>((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return }
    const finish = (places: KakaoPlaceResult[], error?: unknown) => {
      window.clearTimeout(timeout)
      signal.removeEventListener('abort', abort)
      if (error) reject(error); else resolve(places)
    }
    const abort = () => finish([], new DOMException('Search cancelled', 'AbortError'))
    const timeout = window.setTimeout(() => finish([], new Error('Place lookup timed out')), 8000)
    signal.addEventListener('abort', abort, { once: true })
    const options = { location: new api.LatLng(center.lat, center.lng), radius: MAP_NEARBY_RADIUS_METERS, size: 15, sort: api.services.SortBy.DISTANCE }
    const callback = (places: KakaoPlaceResult[], status: string) => {
      if (signal.aborted) { abort(); return }
      if (status === api.services.Status.OK) finish(places)
      else if (status === api.services.Status.ZERO_RESULT) finish([])
      else finish([], new Error('Place lookup unavailable'))
    }
    const search = new api.services.Places()
    if (keyword) search.keywordSearch(keyword, callback, options)
    else search.categorySearch(categoryCodes[category as keyof typeof categoryCodes], callback, options)
  })
  if (category === 'toilet') return query('화장실')
  const first = await query()
  if (category !== 'visit' || first.length >= 5) return first
  const parks = await query('공원').catch(() => [])
  return [...first, ...parks.filter(place => /공원|여행|명소|관광|문화/.test(place.category_name ?? ''))]
}

/** 500m 범위와 이름을 함께 확인해 실제로 가까운 장소만 지도에 보낸다. */
export async function fetchNearbyPlaces(category: NearbyPlaceCategory, center: { lat: number; lng: number }, signal: AbortSignal): Promise<NearbyPlacesResult> {
  const key = `${category}:${center.lat.toFixed(4)}:${center.lng.toFixed(4)}`
  const stored = cache.get(key)
  if (stored && stored.expires > Date.now()) return stored.result
  const api = await loadKakaoMaps()
  const [local, region] = await Promise.allSettled([kakaoPlaces(api, category, center, signal), regionName(api, center)])
  if (signal.aborted) throw new DOMException('Search cancelled', 'AbortError')
  const area = region.status === 'fulfilled' ? region.value : '서울'
  let naver: { available?: boolean; places?: Array<{ name: string; lat: number; lng: number; address: string }>; blogs?: NaverBlogPost[] } = {}
  if (['food', 'cafe', 'visit'].includes(category)) {
    const blogController = new AbortController()
    const cancelBlog = () => blogController.abort()
    signal.addEventListener('abort', cancelBlog, { once: true })
    const blogTimeout = window.setTimeout(cancelBlog, 4500)
    try {
      const params = new URLSearchParams({ kind: category, region: area })
      const response = await fetch(`/api/place-discovery?${params}`, { signal: blogController.signal })
      if (response.ok && response.headers.get('content-type')?.includes('application/json')) naver = await response.json()
    } catch (error) { if (signal.aborted) throw error }
    finally { window.clearTimeout(blogTimeout); signal.removeEventListener('abort', cancelBlog) }
  }
  const candidates = [
    ...(local.status === 'fulfilled' ? local.value.map(place => ({ id: `kakao-${place.id}`, name: place.place_name, address: place.road_address_name || place.address_name, lat: Number(place.y), lng: Number(place.x) })) : []),
    ...(naver.places ?? []).map((place, index) => ({ ...place, id: `naver-${index}-${place.name}` })),
  ]
  const blogs = naver.blogs ?? []
  const places: NearbyPlace[] = []
  for (const candidate of candidates) {
    const distanceMeters = metersBetween(center, candidate)
    if (!candidate.name || !Number.isFinite(distanceMeters) || distanceMeters > MAP_NEARBY_RADIUS_METERS) continue
    if (places.some(place => place.id === candidate.id || (place.name === candidate.name && metersBetween(place, candidate) < 40))) continue
    const name = candidate.name.replace(/[\s()]/g, '')
    const blog = name.length >= 3 ? blogs.find(post => `${post.title} ${post.description}`.replace(/\s/g, '').includes(name)) : undefined
    places.push({ ...candidate, category, distanceMeters, blog,
      blogUrl: blog?.link ?? `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(`${area} ${candidate.name}`)}` })
  }
  if (!places.length && local.status === 'rejected' && !naver.places?.length) throw new Error('Nearby places unavailable')
  places.sort((first, second) => Number(Boolean(second.blog)) - Number(Boolean(first.blog)) || first.distanceMeters - second.distanceMeters)
  const result = { places: places.slice(0, 24), region: area, blogsAvailable: naver.available === true, blogs }
  cache.set(key, { result, expires: Date.now() + 60_000 })
  return result
}

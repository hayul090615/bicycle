/** 선택한 맛집의 블로그 후기를 찾는다. 글에 5점 만점이라고 명시된 점수만 별점으로 읽는다. */
import { searchNaverBlogs, type NaverBlogPost } from './naverBlogs'
import type { NearbyPlace } from './nearbyPlaces'

export type PlaceReviews = { posts: NaverBlogPost[]; rating: { value: number; post: NaverBlogPost } | null }
const cache = new Map<string, { expires: number; result: PlaceReviews }>()
const plainText = (text: string) => text.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').trim()
const normalized = (text: string) => plainText(text).replace(/[\s()[\]·.,_-]/g, '').toLowerCase()

/** 네이버의 공식 매장 평점이 아니라 글쓴이가 명시한 5점 만점 점수다. 없는 점수는 만들지 않는다. */
function reportedRating(post: NaverBlogPost) {
  const text = `${post.title} ${post.description}`
  const patterns = [
    /(?:별점|평점|총점)\s*[:：]?\s*([0-5](?:\.\d{1,2})?)\s*점?\s*\/\s*5\s*점?/,
    /5\s*점\s*만점(?:에|으로)?\s*(?:별점|평점|총점)?\s*[:：]?\s*([0-5](?:\.\d{1,2})?)\s*점/,
    /(?:별점|평점|총점)\s*[:：]?\s*([0-5](?:\.\d{1,2})?)\s*점\s*\(\s*5\s*점\s*만점\s*\)/,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (!match) continue
    const value = Number(match[1])
    if (Number.isFinite(value) && value >= 0 && value <= 5) return { value, post }
  }
  return null
}

export async function fetchPlaceReviews(place: NearbyPlace, region: string, signal: AbortSignal): Promise<PlaceReviews> {
  const key = `${place.id}:${region}`
  const saved = cache.get(key)
  if (saved && saved.expires > Date.now()) return saved.result
  const name = normalized(place.name)
  const results = await searchNaverBlogs(`${region} ${place.name} 후기`, signal)
  const posts = results.map(post => ({ ...post, title: plainText(post.title), description: plainText(post.description), bloggerName: plainText(post.bloggerName) }))
    .filter(post => name.length >= 3 && normalized(post.title).includes(name))
  const unique = [...new Map(posts.map(post => [post.link, post])).values()]
  const rating = unique.map(reportedRating).find(value => value !== null) ?? null
  const result = { posts: unique.slice(0, 3), rating }
  cache.set(key, { result, expires: Date.now() + 5 * 60_000 })
  return result
}

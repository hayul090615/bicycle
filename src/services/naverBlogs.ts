/**
 * 서버의 네이버 검색 API에서 블로그 목록이나 언급 수를 가져온다. 검색 실패는 별도 오류 타입으로 구분하고 언급 수 요청은 메모리 받은 결과를 잠시 저장해서 쓴다.
 */
export interface NaverBlogPost {
  title: string
  link: string
  description: string
  bloggerName: string
  postDate: string
}

export class NaverBlogSearchError extends Error {
  constructor(readonly code: 'not_configured' | 'unavailable') {
    super(code)
    this.name = 'NaverBlogSearchError'
  }
}

const mentionCache = new Map<string, number | null>()

/** 서버 검색 API를 호출해 화면용 블로그 목록을 가져온다. */
export async function searchNaverBlogs(query: string, signal: AbortSignal): Promise<NaverBlogPost[]> {
  const params = new URLSearchParams({ query })
  const response = await fetch('/api/blog-search?' + params, { signal })
  const data = await response.json().catch(() => ({})) as { items?: NaverBlogPost[]; error?: string }
  if (!response.ok) throw new NaverBlogSearchError(data.error === 'blog_api_not_configured' ? 'not_configured' : 'unavailable')
  return data.items ?? []
}

/** 블로그 검색의 총 언급 수를 조회하고 같은 검색어 결과를 잠시 저장해 다시 쓴다. */
export async function countNaverBlogMentions(query: string, signal: AbortSignal): Promise<number | null> {
  if (mentionCache.has(query)) return mentionCache.get(query) ?? null
  const params = new URLSearchParams({ query, countOnly: '1' })
  const response = await fetch('/api/blog-search?' + params, { signal })
  if (!response.ok) return null
  const data = await response.json() as { total?: number }
  const total = Number.isFinite(data.total) ? Math.max(0, data.total!) : null
  mentionCache.set(query, total)
  return total
}

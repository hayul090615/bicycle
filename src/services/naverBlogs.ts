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

export async function searchNaverBlogs(query: string, signal: AbortSignal): Promise<NaverBlogPost[]> {
  const params = new URLSearchParams({ query })
  const response = await fetch('/api/blog-search?' + params, { signal })
  const data = await response.json().catch(() => ({})) as { items?: NaverBlogPost[]; error?: string }
  if (!response.ok) throw new NaverBlogSearchError(data.error === 'blog_api_not_configured' ? 'not_configured' : 'unavailable')
  return data.items ?? []
}

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

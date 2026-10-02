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

export async function searchNaverBlogs(query: string, signal: AbortSignal): Promise<NaverBlogPost[]> {
  const params = new URLSearchParams({ query })
  const response = await fetch('/api/blog-search?' + params, { signal })
  const data = await response.json().catch(() => ({})) as { items?: NaverBlogPost[]; error?: string }
  if (!response.ok) throw new NaverBlogSearchError(data.error === 'blog_api_not_configured' ? 'not_configured' : 'unavailable')
  return data.items ?? []
}

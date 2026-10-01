export interface NaverBlogPost {
  title: string
  link: string
  description: string
  bloggerName: string
  postDate: string
}

export async function searchNaverBlogs(query: string, signal: AbortSignal): Promise<NaverBlogPost[]> {
  const params = new URLSearchParams({ query })
  const response = await fetch('/api/blog-search?' + params, { signal })
  if (!response.ok) throw new Error('BLOG_SEARCH_UNAVAILABLE')
  const data = await response.json() as { items?: NaverBlogPost[] }
  return data.items ?? []
}

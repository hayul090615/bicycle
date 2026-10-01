const NAVER_BLOG_SEARCH_URL = 'https://openapi.naver.com/v1/search/blog.json'

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=300')
  if (request.method !== 'GET') return response.status(405).json({ error: 'method_not_allowed' })

  const query = String(request.query.query ?? '').trim().slice(0, 100)
  if (!query) return response.status(400).json({ error: 'query_required' })

  const clientId = process.env.NAVER_CLIENT_ID
  const clientSecret = process.env.NAVER_CLIENT_SECRET
  if (!clientId || !clientSecret) return response.status(503).json({ error: 'blog_api_not_configured' })

  try {
    const url = new URL(NAVER_BLOG_SEARCH_URL)
    url.searchParams.set('query', query)
    url.searchParams.set('display', '8')
    url.searchParams.set('sort', 'sim')
    const result = await fetch(url, {
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(7000),
    })
    if (!result.ok) return response.status(502).json({ error: 'blog_search_unavailable' })

    const data = await result.json()
    const items = (data.items ?? []).flatMap(item => {
      try {
        const link = new URL(item.link)
        if (link.protocol !== 'https:' && link.protocol !== 'http:') return []
        return [{
          title: String(item.title ?? ''),
          link: link.href,
          description: String(item.description ?? ''),
          bloggerName: String(item.bloggername ?? ''),
          postDate: String(item.postdate ?? ''),
        }]
      } catch {
        return []
      }
    })
    return response.status(200).json({ items })
  } catch {
    return response.status(502).json({ error: 'blog_search_unavailable' })
  }
}

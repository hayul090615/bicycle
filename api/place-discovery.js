/**
 * 네이버에서 동네의 장소와 블로그 글을 함께 찾는 서버 코드다.
 * 비밀 키는 서버에서만 읽으며, 키가 없으면 주변 지도 검색을 계속 사용할 수 있게 알린다.
 */
// 사용자가 고른 영어 분류 이름을 네이버 검색에 사용할 한국어 단어로 바꾼다.
const KINDS = { food: '맛집', cafe: '카페', visit: '가볼만한곳' }
// 검색 결과의 HTML 태그를 지워 화면에는 읽을 수 있는 글자만 남긴다.
const plainText = value => String(value ?? '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim()

export default async function placeDiscovery(request, response) {
  if (request.method !== 'GET') return response.status(405).json({ error: 'method_not_allowed' })
  const kind = String(request.query.kind ?? '')
  const region = String(request.query.region ?? '서울').trim().slice(0, 60)
  if (!KINDS[kind]) return response.status(400).json({ error: 'invalid_kind' })
  const clientId = process.env.NAVER_CLIENT_ID, clientSecret = process.env.NAVER_CLIENT_SECRET
  if (!clientId || !clientSecret) return response.status(200).json({ available: false, places: [], blogs: [] })
  response.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=300')
  const query = `${region} ${KINDS[kind]}`
  // 서로 독립된 장소 검색과 글 검색을 함께 시작해 기다리는 시간을 줄인다.
  const search = async (service, display) => {
    const url = new URL(`https://openapi.naver.com/v1/search/${service}.json`)
    url.searchParams.set('query', query)
    url.searchParams.set('display', String(display))
    url.searchParams.set('sort', service === 'local' ? 'random' : 'sim')
    const result = await fetch(url, { headers: { 'X-Naver-Client-Id': clientId, 'X-Naver-Client-Secret': clientSecret }, signal: AbortSignal.timeout(6500) })
    if (!result.ok) throw new Error('naver_search_unavailable')
    return (await result.json()).items ?? []
  }
  const [local, blog] = await Promise.allSettled([search('local', 5), search('blog', 8)])
  const places = (local.status === 'fulfilled' ? local.value : []).flatMap(item => {
    const rawLng = Number(item.mapx), rawLat = Number(item.mapy)
    const lng = rawLng > 180 ? rawLng / 10_000_000 : rawLng
    const lat = rawLat > 90 ? rawLat / 10_000_000 : rawLat
    // 잘못된 좌표를 지도에 표시하지 않는다. 이 사이트는 서울 주변만 사용한다.
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 37 || lat > 38 || lng < 126 || lng > 128) return []
    const category = plainText(item.category)
    if (kind === 'visit' && !/여행|명소|공원|문화|박물관|미술|전시|관광|유적/.test(category)) return []
    return [{ name: plainText(item.title), address: plainText(item.roadAddress || item.address), category, lat, lng }]
  })
  const blogs = (blog.status === 'fulfilled' ? blog.value : []).flatMap(item => {
    try {
      const link = new URL(item.link)
      if (!['https:', 'http:'].includes(link.protocol)) return []
      return [{ title: plainText(item.title), link: link.href, description: plainText(item.description), bloggerName: plainText(item.bloggername), postDate: String(item.postdate ?? '') }]
    } catch { return [] }
  })
  return response.status(200).json({ available: blog.status === 'fulfilled', places, blogs })
}

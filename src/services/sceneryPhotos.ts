export interface SceneryPhoto {
  title: string
  thumbnail: string
  page: string
  credit: string
  license: string
}

interface CommonsImageInfo {
  thumburl?: string
  descriptionurl?: string
  extmetadata?: Record<string, { value?: string }>
}

interface CommonsPage {
  title: string
  index?: number
  imageinfo?: CommonsImageInfo[]
}

const stripHtml = (value: string) => value.replace(/<[^>]*>/gu, ' ').replace(/&nbsp;/gu, ' ').replace(/&amp;/gu, '&').replace(/\s+/gu, ' ').trim()

function scoreTitle(title: string, preferredTerms: string[]) {
  const lower = title.toLowerCase()
  let score = 0
  const placeWords = preferredTerms.flatMap(term => term.split(/[^\p{L}\p{N}]+/u).filter(word => word.length > 1))
  for (const word of placeWords) if (lower.includes(word.toLowerCase())) score += 3
  if (/park|river|hangang|bridge|seoul|forest|island|night|sunset|view|landscape|공원|한강|대교|숲|섬|야경|풍경/u.test(lower)) score += 2
  if (/logo|map|sign|station interior|subway|train|bus|food|menu|screenshot|coat of arms/u.test(lower)) score -= 5
  return score
}

export async function findSceneryPhoto(lat: number, lng: number, preferredTerms: string[], signal: AbortSignal): Promise<SceneryPhoto | null> {
  const query = new URLSearchParams({
    action: 'query', generator: 'geosearch', ggscoord: `${lat}|${lng}`, ggsradius: '700',
    ggsnamespace: '6', ggslimit: '20', prop: 'imageinfo',
    iiprop: 'url|extmetadata', iiurlwidth: '720', format: 'json', origin: '*',
  })
  const response = await fetch(`https://commons.wikimedia.org/w/api.php?${query}`, { signal })
  if (!response.ok) throw new Error(`Scenery photo request failed: ${response.status}`)
  const data = await response.json() as { query?: { pages?: Record<string, CommonsPage> } }
  const pages = Object.values(data.query?.pages ?? {})
    .filter(page => page.imageinfo?.[0]?.thumburl && page.imageinfo[0].descriptionurl)
    .sort((a, b) => scoreTitle(b.title, preferredTerms) - scoreTitle(a.title, preferredTerms) || (a.index ?? 0) - (b.index ?? 0))
  const page = pages.find(candidate => scoreTitle(candidate.title, preferredTerms) > 0)
  const image = page?.imageinfo?.[0]
  if (!page || !image?.thumburl || !image.descriptionurl) return null
  const metadata = image.extmetadata ?? {}
  const artist = metadata.Artist?.value ? stripHtml(metadata.Artist.value) : ''
  const license = metadata.LicenseShortName?.value ? stripHtml(metadata.LicenseShortName.value) : 'Wikimedia Commons'
  return {
    title: page.title.replace(/^File:/u, '').replace(/\.[a-z\d]+$/iu, '').replace(/_/gu, ' '),
    thumbnail: image.thumburl,
    page: image.descriptionurl,
    credit: artist || 'Wikimedia Commons contributor',
    license,
  }
}

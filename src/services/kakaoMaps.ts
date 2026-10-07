export const hasKakaoMapsKey = Boolean(import.meta.env.VITE_KAKAO_MAP_KEY?.trim())

export interface KakaoLatLng {
  getLat(): number
  getLng(): number
}

export interface KakaoOverlay {
  setMap(map: KakaoMap | null): void
  setPosition?(position: KakaoLatLng): void
}

export interface KakaoBounds {
  extend(position: KakaoLatLng): void
}

export interface KakaoVisibleBounds {
  getSouthWest(): KakaoLatLng
  getNorthEast(): KakaoLatLng
}

export interface KakaoMap {
  setCenter(position: KakaoLatLng): void
  setLevel(level: number, options?: { animate?: boolean }): void
  getBounds(): KakaoVisibleBounds
  getLevel(): number
  addControl(control: unknown, position: string): void
  relayout(): void
}

export interface KakaoRoadview {
  setPanoId(panoId: number, position?: KakaoLatLng): void
}

export interface KakaoRoadviewClient {
  getNearestPanoId(position: KakaoLatLng, radius: number, callback: (panoId: number | null) => void): void
}

export interface KakaoMapsApi {
  event: {
    addListener(target: object, eventName: string, handler: (event?: { latLng?: KakaoLatLng }) => void): void
    removeListener(target: object, eventName: string, handler: (event?: { latLng?: KakaoLatLng }) => void): void
  }
  load(callback: () => void): void
  Map: new (container: HTMLElement, options: {
    center: KakaoLatLng
    level: number
    mapTypeId: string
    draggable: boolean
    scrollwheel: boolean
  }) => KakaoMap
  LatLng: new (latitude: number, longitude: number) => KakaoLatLng
  Roadview: new (container: HTMLElement) => KakaoRoadview
  RoadviewClient: new () => KakaoRoadviewClient
  Polyline: new (options: {
    map: KakaoMap | null
    path: KakaoLatLng[]
    strokeWeight: number
    strokeColor: string
    strokeOpacity: number
    strokeStyle: string
  }) => KakaoOverlay
  Polygon: new (options: {
    map: KakaoMap | null
    path: KakaoLatLng[][]
    strokeWeight: number
    strokeColor: string
    strokeOpacity: number
    fillColor: string
    fillOpacity: number
  }) => KakaoOverlay
  Circle: new (options: {
    map: KakaoMap | null
    center: KakaoLatLng
    radius: number
    strokeWeight: number
    strokeColor: string
    strokeOpacity: number
    fillColor: string
    fillOpacity: number
  }) => KakaoOverlay
  CustomOverlay: new (options: {
    map: KakaoMap | null
    position: KakaoLatLng
    content: HTMLElement
    xAnchor?: number
    yAnchor?: number
    zIndex?: number
  }) => KakaoOverlay
  MapTypeControl: new () => unknown
  ZoomControl: new () => unknown
  ControlPosition: { TOPRIGHT: string; RIGHT: string }
  MapTypeId: { ROADMAP: string }
  services: {
    Status: { OK: string; ZERO_RESULT: string }
    Places: new () => { keywordSearch(query: string, callback: (places: Array<{ id: string; place_name: string; address_name: string; road_address_name: string; x: string; y: string }>, status: string) => void, options?: { size?: number; page?: number }) : void }
    Geocoder: new () => { addressSearch(query: string, callback: (addresses: Array<{ address_name: string; x: string; y: string }>, status: string) => void): void }
  }
}

type KakaoWindow = Window & {
  kakao?: { maps: KakaoMapsApi }
}

let loading: Promise<KakaoMapsApi> | undefined

export function loadKakaoMaps(): Promise<KakaoMapsApi> {
  if (!hasKakaoMapsKey) return Promise.reject(new Error('KAKAO_MAPS_NOT_CONFIGURED'))
  const scope = window as KakaoWindow
  if (scope.kakao?.maps) {
    return new Promise(resolve => scope.kakao!.maps.load(() => resolve(scope.kakao!.maps)))
  }
  if (loading) return loading

  loading = new Promise<KakaoMapsApi>((resolve, reject) => {
    const script = document.createElement('script')
    let settled = false
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      if (error) {
        script.remove()
        loading = undefined
        reject(error)
        return
      }
      resolve(scope.kakao!.maps)
    }
    const timeout = window.setTimeout(() => finish(new Error('KAKAO_MAPS_TIMEOUT')), 20000)
    script.async = true
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(import.meta.env.VITE_KAKAO_MAP_KEY.trim())}&autoload=false&libraries=services`
    script.onload = () => {
      if (!scope.kakao?.maps) {
        finish(new Error('KAKAO_MAPS_UNAVAILABLE'))
        return
      }
      scope.kakao.maps.load(() => finish())
    }
    script.onerror = () => finish(new Error('KAKAO_MAPS_NETWORK_ERROR'))
    document.head.append(script)
  })
  return loading
}

type SearchPlace = { id: string; name: string; address: string; lat: number; lng: number }

async function searchKakaoPlaces(query: string): Promise<SearchPlace[]> {
  const api = await loadKakaoMaps()
  const places = new api.services.Places()
  const searchKeyword = (term: string, page: number) => new Promise<SearchPlace[]>((resolve, reject) => {
    places.keywordSearch(term, (results, status) => {
      if (status === api.services.Status.ZERO_RESULT) { resolve([]); return }
      if (status !== api.services.Status.OK) { reject(new Error('place search unavailable')); return }
      resolve(results.map(place => ({ id: place.id, name: place.place_name, address: place.road_address_name || place.address_name, lat: Number(place.y), lng: Number(place.x) }))
        .filter(place => Number.isFinite(place.lat) && Number.isFinite(place.lng)))
    }, { size: 15, page })
  })
  const searchAddress = (term: string) => new Promise<SearchPlace[]>(resolve => {
    try {
      new api.services.Geocoder().addressSearch(term, (results, status) => {
        if (status !== api.services.Status.OK) { resolve([]); return }
        resolve(results.map((address, index) => ({ id: `address-${term}-${index}`, name: address.address_name, address: address.address_name, lat: Number(address.y), lng: Number(address.x) }))
          .filter(place => Number.isFinite(place.lat) && Number.isFinite(place.lng)))
      })
    } catch { resolve([]) }
  })
  const hasSeoulPrefix = /서울|seoul/i.test(query)
  const keywordTerms = hasSeoulPrefix ? [query] : [query, `서울 ${query}`]
  const addressTerms = hasSeoulPrefix ? [query] : [query, `서울특별시 ${query}`]
  const results = await Promise.allSettled([
    ...keywordTerms.flatMap(term => [1, 2, 3].map(page => searchKeyword(term, page))),
    ...addressTerms.map(searchAddress),
  ])
  const unique = new Map<string, SearchPlace>()
  for (const result of results) {
    if (result.status !== 'fulfilled') continue
    for (const place of result.value) {
      if (place.lat < 37.41 || place.lat > 37.72 || place.lng < 126.76 || place.lng > 127.19) continue
      unique.set(`${place.lat.toFixed(6)},${place.lng.toFixed(6)}`, place)
    }
  }
  if (!unique.size && results.every(result => result.status === 'rejected')) throw new Error('place search unavailable')
  return [...unique.values()].slice(0, 45)
}

async function searchOpenStreetMapPlaces(query: string): Promise<SearchPlace[]> {
  const url = new URL('https://photon.komoot.io/api/')
  url.searchParams.set('q', query)
  url.searchParams.set('bbox', '126.76,37.41,127.19,37.72')
  url.searchParams.set('limit', '30')
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (!response.ok) throw new Error('place search unavailable')
  const data = await response.json() as { features?: Array<{ geometry?: { coordinates?: number[] }; properties?: { osm_id?: number; name?: string; street?: string; district?: string; city?: string } }> }
  return (data.features ?? []).flatMap((feature, index) => {
    const [lng, lat] = feature.geometry?.coordinates ?? []
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return []
    const properties = feature.properties ?? {}
    return [{ id: `osm-${properties.osm_id ?? index}`, name: properties.name || query, address: [properties.street, properties.district, properties.city].filter(Boolean).join(', ') || '서울', lat, lng }]
  })
}

export async function searchSeoulPlaces(query: string): Promise<SearchPlace[]> {
  const normalized = query.replace(/\s+/g, '').toLocaleLowerCase()
  if (normalized === '여의도' || normalized === '여의도동' || normalized === 'yeouido') {
    return [{ id: 'seoul-yeouido', name: '여의도', address: '서울특별시 영등포구 여의도동', lat: 37.5219, lng: 126.9245 }]
  }
  const results = await Promise.allSettled([searchKakaoPlaces(query), searchOpenStreetMapPlaces(query)])
  const unique = new Map<string, SearchPlace>()
  for (const result of results) {
    if (result.status !== 'fulfilled') continue
    for (const place of result.value) {
      if (place.lat < 37.41 || place.lat > 37.72 || place.lng < 126.76 || place.lng > 127.19) continue
      const key = `${place.lat.toFixed(5)},${place.lng.toFixed(5)}`
      if (!unique.has(key)) unique.set(key, place)
    }
  }
  if (!unique.size && results.every(result => result.status === 'rejected')) throw new Error('place search unavailable')
  return [...unique.values()].slice(0, 45)
}

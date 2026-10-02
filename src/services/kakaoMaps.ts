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
  addListener(target: object, eventName: string, handler: (event?: { latLng?: KakaoLatLng }) => void): void
  removeListener(target: object, eventName: string, handler: (event?: { latLng?: KakaoLatLng }) => void): void
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
    map: KakaoMap
    path: KakaoLatLng[]
    strokeWeight: number
    strokeColor: string
    strokeOpacity: number
    strokeStyle: string
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
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(import.meta.env.VITE_KAKAO_MAP_KEY.trim())}&autoload=false`
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

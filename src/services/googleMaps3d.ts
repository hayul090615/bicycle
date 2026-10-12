/**
 * Google 지도 도구를 불러온다. 이미 불러오는 중이면 같은 작업을 기다려 여러 번 설치하지 않게 한다.
 */
export const hasGoogleMapsKey = Boolean(import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim())

export interface Camera3D {
  center: { lat: number; lng: number; altitude: number }
  range: number
  tilt: number
  heading: number
}
export interface GoogleMap3D extends HTMLElement {
  description: string
  center: Camera3D['center']
  range: number
  tilt: number
  heading: number
  flyCameraTo(options: { endCamera: Camera3D; durationMillis: number }): void
  stopCameraAnimation(): void
}
export type GooglePosition3D = { lat: number; lng: number; altitude?: number }
export interface GooglePolygon3D extends HTMLElement {
  path: GooglePosition3D[] | GooglePosition3D[][]
}
export interface Maps3DLibrary {
  Map3DElement: new (options: Camera3D & { mode: string; gestureHandling: string; description: string }) => GoogleMap3D
  Marker3DElement: new (options: Record<string, unknown>) => HTMLElement
  Marker3DInteractiveElement: new (options: Record<string, unknown>) => HTMLElement
  Polyline3DElement: new (options: Record<string, unknown>) => HTMLElement
  Polygon3DElement: new (options: Record<string, unknown>) => GooglePolygon3D
  MapMode: { HYBRID: string }
  AltitudeMode: { CLAMP_TO_GROUND: string }
}
type MapsWindow = Window & {
  google?: { maps: { importLibrary(name: 'maps3d'): Promise<Maps3DLibrary> } }
  seoulGoogleMapsReady?: () => void
  gm_authFailure?: () => void
}
let loading: Promise<Maps3DLibrary> | undefined

/** 중복 SDK 로딩을 공유하고 성공한 3D 지도 라이브러리를 반환한다. */
export function loadGoogleMaps3D(): Promise<Maps3DLibrary> {
  if (!hasGoogleMapsKey) return Promise.reject(new Error('GOOGLE_MAPS_NOT_CONFIGURED'))
  if (loading) return loading
  const scope = window as MapsWindow
  loading = new Promise<Maps3DLibrary>((resolve, reject) => {
    const script = document.createElement('script')
    let settled = false
    const finish = (error?: Error, library?: Maps3DLibrary) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      // Keep a no-op callback for a late script response after a timeout.
      scope.seoulGoogleMapsReady = () => {}
      if (error) { script.remove(); reject(error) }
      else resolve(library!)
    }
    const timeout = window.setTimeout(() => finish(new Error('GOOGLE_MAPS_TIMEOUT')), 20000)
    scope.gm_authFailure = () => {
      window.dispatchEvent(new Event('seoul-google-maps-error'))
      finish(new Error('GOOGLE_MAPS_AUTH_FAILED'))
    }
    scope.seoulGoogleMapsReady = () => {
      if (!scope.google?.maps) { finish(new Error('GOOGLE_MAPS_UNAVAILABLE')); return }
      scope.google.maps.importLibrary('maps3d').then(library => finish(undefined, library), () => finish(new Error('GOOGLE_MAPS_UNAVAILABLE')))
    }
    const params = new URLSearchParams({
      key: import.meta.env.VITE_GOOGLE_MAPS_API_KEY.trim(),
      v: 'weekly', loading: 'async', libraries: 'maps3d', callback: 'seoulGoogleMapsReady',
    })
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`
    script.async = true
    script.onerror = () => finish(new Error('GOOGLE_MAPS_NETWORK_ERROR'))
    document.head.append(script)
  })
  return loading
}

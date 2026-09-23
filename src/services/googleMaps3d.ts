export const hasGoogleMapsKey = Boolean(import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim())

export interface Camera3D {
  center: { lat: number; lng: number; altitude: number }
  range: number
  tilt: number
  heading: number
}
export interface GoogleMap3D extends HTMLElement {
  center: Camera3D['center']
  range: number
  tilt: number
  heading: number
  flyCameraTo(options: { endCamera: Camera3D; durationMillis: number }): void
  stopCameraAnimation(): void
}
interface Maps3DLibrary {
  Map3DElement: new (options: Camera3D & { mode: string; gestureHandling: string; description: string }) => GoogleMap3D
  Marker3DInteractiveElement: new (options: Record<string, unknown>) => HTMLElement
  Polyline3DElement: new (options: Record<string, unknown>) => HTMLElement
  MapMode: { HYBRID: string }
  AltitudeMode: { CLAMP_TO_GROUND: string }
}
type MapsWindow = Window & {
  google?: { maps: { importLibrary(name: 'maps3d'): Promise<Maps3DLibrary> } }
  seoulGoogleMapsReady?: () => void
  gm_authFailure?: () => void
}
let loading: Promise<Maps3DLibrary> | undefined

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

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as maplibregl from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { ExpressionSpecification, GeoJSONSource, Map as MapLibreMap, MapGeoJSONFeature, Marker as MapLibreMarker } from 'maplibre-gl'
import { getTouristStation, type TouristRoute } from '../data/touristRoutes'
import { castBuildingShadow } from '../utils/buildingShadow'
import type { LonLat } from '../services/bikeRoute'
import type { PublicCamera } from '../services/publicCctv'
import 'maplibre-gl/dist/maplibre-gl.css'

maplibregl.setWorkerUrl(maplibreWorkerUrl)

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'
const IMAGERY_ATTRIBUTION = 'Imagery © Esri. Sources: Esri, Vantor, Earthstar Geographics, and the GIS User Community.'
const SATELLITE_SURFACES = new Set(['park', 'landuse', 'landcover', 'water', 'aeroway', 'building'])
const EMPTY_SHADOWS: GeoJSON.FeatureCollection<GeoJSON.Polygon> = { type: 'FeatureCollection', features: [] }

function getFeatureRings(feature: MapGeoJSONFeature): number[][][] {
  if (feature.geometry.type === 'Polygon') return [feature.geometry.coordinates[0] as number[][]]
  if (feature.geometry.type === 'MultiPolygon') return feature.geometry.coordinates.map(polygon => polygon[0] as number[][])
  return []
}

function makeBuildingShadows(features: MapGeoJSONFeature[], sunElevation: number, shadowAzimuth: number): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  const output: GeoJSON.Feature<GeoJSON.Polygon>[] = []
  const seen = new Set<string>()
  for (const feature of features) {
    const properties = feature.properties ?? {}
    const levels = Number(properties['building:levels'] ?? properties.levels)
    const rawHeight = Number(properties.render_height ?? properties.height ?? (Number.isFinite(levels) ? levels * 3 : 8))
    const height = Number.isFinite(rawHeight) && rawHeight > 0 ? Math.min(rawHeight, 120) : 8
    for (const ring of getFeatureRings(feature)) {
      const footprint = ring as [number, number][]
      const first = footprint[0]
      if (!first || footprint.length < 4) continue
      const key = `${String(feature.id ?? '')}:${first[0].toFixed(5)}:${first[1].toFixed(5)}`
      if (seen.has(key)) continue
      seen.add(key)
      const shadow = castBuildingShadow(footprint, height, sunElevation, shadowAzimuth)
      if (shadow) output.push({ type: 'Feature', properties: { buildingKey: key }, geometry: { type: 'Polygon', coordinates: [shadow] } })
    }
  }
  return { type: 'FeatureCollection', features: output }
}

export function MapLibreRoute3D({ viewMode, route, routePath, cctvCameras, showCctv, panRequest, locale, userLocation, selectedStop, onSelectStop, onHoverStop, shadowAzimuth, sunElevation, fallback }: {
  viewMode: 'city' | 'map'
  route: TouristRoute
  routePath: LonLat[] | null
  cctvCameras: PublicCamera[]
  showCctv: boolean
  panRequest: { direction: 'left' | 'right'; serial: number } | null
  locale: 'en' | 'ko'
  userLocation: { lat: number; lng: number } | null
  selectedStop: number | null
  onSelectStop: (index: number) => void
  onHoverStop: (index: number | null) => void
  shadowAzimuth: number
  sunElevation: number
  fallback: ReactNode
}) {
  const host = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markersRef = useRef<MapLibreMarker[]>([])
  const cctvMarkersRef = useRef<MapLibreMarker[]>([])
  const userMarkerRef = useRef<MapLibreMarker | null>(null)
  const shadowAzimuthRef = useRef(shadowAzimuth)
  const sunElevationRef = useRef(sunElevation)
  const updateBuildingShadowsRef = useRef<() => void>(() => {})
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [satellite, setSatellite] = useState(() => viewMode === 'city')
  shadowAzimuthRef.current = shadowAzimuth
  sunElevationRef.current = sunElevation
  const initialCenter = useRef<maplibregl.LngLatLike | null>(null)
  const isFlatMap = viewMode === 'map'
  const points = useMemo(() => route.stops.map(stop => {
    const station = getTouristStation(stop.stationId)
    return { lat: station.lat, lng: station.lng }
  }), [route])
  const linePoints = useMemo(() => routePath ?? points.map(point => [point.lng, point.lat] as LonLat), [routePath, points])
  if (initialCenter.current === null) initialCenter.current = [points[0].lng, points[0].lat]

  useEffect(() => {
    if (!host.current) return
    let disposed = false
    let failed = false
    let timeout = 0
    let shadowUpdateTimeout = 0
    let lastShadowSignature = ''
    const map = new maplibregl.Map({
      container: host.current,
      style: STYLE_URL,
      center: initialCenter.current ?? [points[0].lng, points[0].lat],
      zoom: 14,
      pitch: isFlatMap ? 0 : 64,
      bearing: isFlatMap ? 0 : -10,
      maxPitch: 75,
      attributionControl: {},
      canvasContextAttributes: { antialias: true },
    })
    mapRef.current = map
    const updateBuildingShadows = () => {
      if (!map.isStyleLoaded() || !map.getLayer('building-3d')) return
      const source = map.getSource('tour-building-shadows') as GeoJSONSource | undefined
      if (!source) return
      const features = sunElevationRef.current > 0
        ? map.queryRenderedFeatures({ layers: ['building-3d'] })
        : []
      const data = makeBuildingShadows(features, sunElevationRef.current, shadowAzimuthRef.current)
      const shadowFootprints = data.features.map(feature => String(feature.properties?.buildingKey ?? '')).join(';')
      const signature = `${sunElevationRef.current.toFixed(2)}:${shadowAzimuthRef.current.toFixed(1)}:${shadowFootprints}`
      if (signature === lastShadowSignature) return
      lastShadowSignature = signature
      source.setData(data)
    }
    updateBuildingShadowsRef.current = updateBuildingShadows
    map.on('idle', updateBuildingShadows)
    map.on('moveend', updateBuildingShadows)
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: !isFlatMap }), 'top-right')
    const fail = () => {
      if (disposed || failed) return
      failed = true
      window.clearTimeout(timeout)
      markersRef.current.forEach(marker => marker.remove())
      markersRef.current = []
      cctvMarkersRef.current.forEach(marker => marker.remove())
      cctvMarkersRef.current = []
      userMarkerRef.current?.remove()
      userMarkerRef.current = null
      map.remove()
      mapRef.current = null
      setStatus('error')
    }
    timeout = window.setTimeout(() => {
      if (!map.isStyleLoaded()) fail()
    }, 25000)
    map.once('load', () => {
      if (disposed || failed) return
      window.clearTimeout(timeout)
      try {
        map.addSource('tour-imagery', {
          type: 'raster',
          tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
          tileSize: 256,
          maxzoom: 19,
          attribution: IMAGERY_ATTRIBUTION,
        })
        map.addLayer({
          id: 'tour-imagery',
          type: 'raster',
          source: 'tour-imagery',
          layout: { visibility: isFlatMap ? 'none' : 'visible' },
          paint: { 'raster-opacity': 1, 'raster-fade-duration': 250 },
        }, 'park')
        const layers = map.getStyle().layers
        if (!isFlatMap) {
          for (const layer of layers) {
            const sourceLayer = 'source-layer' in layer ? layer['source-layer'] : undefined
            if (layer.id === 'background' || layer.id === 'natural_earth' || (layer.type === 'fill' && SATELLITE_SURFACES.has(sourceLayer ?? ''))) {
              map.setLayoutProperty(layer.id, 'visibility', 'none')
            }
          }
        }
        map.addSource('tour-route-line', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        const buildingLayer = layers.find(layer => layer.id === 'building-3d')?.id
        const routeLayer = {
          id: 'tour-route-line',
          type: 'line' as const,
          source: 'tour-route-line',
          layout: { 'line-cap': 'round' as const, 'line-join': 'round' as const },
          paint: {
            'line-color': '#04bd83',
            'line-width': ['interpolate', ['linear'], ['zoom'], 11, 3, 17, 6] as ExpressionSpecification,
            'line-opacity': 1,
          },
        }
        const routeCasing = {
          id: 'tour-route-casing',
          type: 'line' as const,
          source: 'tour-route-line',
          layout: { 'line-cap': 'round' as const, 'line-join': 'round' as const },
          paint: {
            'line-color': '#f5f5ed',
            'line-width': ['interpolate', ['linear'], ['zoom'], 11, 7, 17, 11] as ExpressionSpecification,
            'line-opacity': 0.96,
          },
        }
        map.addSource('tour-building-shadows', { type: 'geojson', data: EMPTY_SHADOWS })
        const shadowFill = {
          id: 'tour-building-shadow-fill',
          type: 'fill' as const,
          source: 'tour-building-shadows',
          paint: { 'fill-color': '#24362f', 'fill-opacity': 0.36, 'fill-antialias': true },
        }
        const shadowOutline = {
          id: 'tour-building-shadow-outline',
          type: 'line' as const,
          source: 'tour-building-shadows',
          paint: { 'line-color': '#162820', 'line-width': 1.15, 'line-opacity': 0.78 },
        }
        if (buildingLayer) {
          map.addLayer(shadowFill, buildingLayer)
          map.addLayer(shadowOutline, buildingLayer)
          map.addLayer(routeCasing, buildingLayer)
          map.addLayer(routeLayer, buildingLayer)
        } else {
          map.addLayer(shadowFill)
          map.addLayer(shadowOutline)
          map.addLayer(routeCasing)
          map.addLayer(routeLayer)
        }
        setStatus('ready')
        shadowUpdateTimeout = window.setTimeout(updateBuildingShadows, 350)
      } catch {
        fail()
      }
    })
    map.on('error', event => {
      if (event.error && !map.isStyleLoaded()) fail()
    })
    return () => {
      disposed = true
      window.clearTimeout(timeout)
      window.clearTimeout(shadowUpdateTimeout)
      map.off('idle', updateBuildingShadows)
      map.off('moveend', updateBuildingShadows)
      updateBuildingShadowsRef.current = () => {}
      markersRef.current.forEach(marker => marker.remove())
      markersRef.current = []
      cctvMarkersRef.current.forEach(marker => marker.remove())
      cctvMarkersRef.current = []
      userMarkerRef.current?.remove()
      userMarkerRef.current = null
      if (!failed) map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => { updateBuildingShadowsRef.current() }, [shadowAzimuth, sunElevation, status])

  useEffect(() => {
    const map = mapRef.current
    if (!map || status !== 'ready') return
    userMarkerRef.current?.remove()
    userMarkerRef.current = null
    if (!userLocation) return
    const element = document.createElement('div')
    element.className = 'tour-user-location-marker'
    element.setAttribute('role', 'img')
    element.setAttribute('aria-label', locale === 'ko' ? '내 위치' : 'You are here')
    element.title = locale === 'ko' ? '내 위치' : 'You are here'
    userMarkerRef.current = new maplibregl.Marker({ element, anchor: 'center' })
      .setLngLat([userLocation.lng, userLocation.lat]).addTo(map)
  }, [locale, status, userLocation])

  useEffect(() => {
    const map = mapRef.current
    if (!map || status !== 'ready') return
    const routeSource = map.getSource('tour-route-line') as GeoJSONSource | undefined
    routeSource?.setData({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: linePoints },
    })
    markersRef.current.forEach(marker => marker.remove())
    markersRef.current = []
    route.stops.forEach((stop, index) => {
      const label = locale === 'ko' ? stop.placeKo : stop.place
      const element = document.createElement('button')
      element.type = 'button'
      element.className = 'tour-3d-stop-marker'
      element.setAttribute('aria-label', `${index + 1}. ${label}`)
      element.title = label
      const number = document.createElement('b')
      number.textContent = String(index + 1)
      const name = document.createElement('span')
      name.textContent = label
      element.append(number, name)
      element.addEventListener('click', () => onSelectStop(index))
      element.addEventListener('mouseenter', () => onHoverStop(index))
      element.addEventListener('focus', () => onHoverStop(index))
      element.addEventListener('blur', () => onHoverStop(null))
      markersRef.current.push(new maplibregl.Marker({ element, anchor: 'bottom' })
        .setLngLat([points[index].lng, points[index].lat])
        .addTo(map))
    })
  }, [linePoints, locale, onHoverStop, onSelectStop, points, route, status])

  useEffect(() => {
    const map = mapRef.current
    if (!map || status !== 'ready') return
    markersRef.current.forEach((marker, index) => {
      marker.getElement().classList.toggle('is-selected', selectedStop === index)
    })
    if (selectedStop !== null) {
      const point = points[selectedStop]
      map.flyTo({ center: [point.lng, point.lat], zoom: 17.1, pitch: isFlatMap ? 0 : 67, bearing: isFlatMap ? 0 : -18, duration: 1100, essential: false })
      return
    }
    const bounds = new maplibregl.LngLatBounds()
    linePoints.forEach(point => bounds.extend(point))
    map.fitBounds(bounds, { padding: { top: 66, right: 72, bottom: 66, left: 72 }, maxZoom: 14.2, pitch: isFlatMap ? 0 : 58, bearing: isFlatMap ? 0 : -8, duration: 480 })
  }, [isFlatMap, linePoints, points, selectedStop, status])

  useEffect(() => {
    const map = mapRef.current
    if (!map || status !== 'ready') return
    cctvMarkersRef.current.forEach(marker => marker.remove())
    cctvMarkersRef.current = []
    if (!showCctv) return
    cctvCameras.forEach(camera => {
      const label = camera.purpose || (locale === 'ko' ? '공공 CCTV' : 'Public CCTV')
      const element = document.createElement('button')
      element.type = 'button'
      element.className = 'tour-cctv-map-marker'
      element.setAttribute('aria-label', `${label}: ${camera.name}`)
      element.title = `${label} · ${camera.name}`
      element.textContent = 'C'

      const popupContent = document.createElement('div')
      popupContent.className = 'tour-cctv-popup'
      const heading = document.createElement('strong')
      heading.textContent = label
      const name = document.createElement('div')
      name.textContent = camera.name
      const address = document.createElement('div')
      address.textContent = camera.address || (locale === 'ko' ? '주소 정보 없음' : 'Address not listed')
      const metadata = document.createElement('small')
      metadata.textContent = `${locale === 'ko' ? '카메라' : 'Cameras'} ${camera.cameras || '—'} · ${camera.resolution || '—'} · ${camera.direction || '—'}`
      const date = document.createElement('small')
      date.textContent = `${locale === 'ko' ? '자료 기준일' : 'Data date'} ${camera.updatedAt || '—'}`
      const notice = document.createElement('small')
      notice.textContent = locale === 'ko'
        ? '공개 설치 위치 정보입니다. 실시간 영상 주소는 제공되지 않습니다.'
        : 'Public installation record; no live video URL is provided.'
      popupContent.append(heading, name, address, metadata, date, notice)
      const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, maxWidth: '300px' }).setDOMContent(popupContent)
      cctvMarkersRef.current.push(new maplibregl.Marker({ element, anchor: 'bottom' })
        .setLngLat([camera.lng, camera.lat])
        .setPopup(popup)
        .addTo(map))
    })
  }, [cctvCameras, locale, showCctv, status])

  useEffect(() => {
    const map = mapRef.current
    if (!map || status !== 'ready' || !panRequest) return
    map.panBy([panRequest.direction === 'left' ? 260 : -260, 0], { duration: 420 })
  }, [panRequest, status])

  useEffect(() => {
    const map = mapRef.current
    if (!map || status !== 'ready' || !map.getLayer('tour-imagery')) return
    map.setLayoutProperty('tour-imagery', 'visibility', satellite ? 'visible' : 'none')
    map.getStyle().layers.forEach(layer => {
      const sourceLayer = 'source-layer' in layer ? layer['source-layer'] : undefined
      if (layer.id === 'background' || layer.id === 'natural_earth' || (layer.type === 'fill' && SATELLITE_SURFACES.has(sourceLayer ?? ''))) {
        map.setLayoutProperty(layer.id, 'visibility', satellite ? 'none' : 'visible')
      }
    })
  }, [satellite, status])

  if (status === 'error') return <>
    <p className="tour-earth-notice" role="status">{locale === 'ko'
      ? '3D 지도 타일을 불러오지 못해 기본 코스 지도를 표시합니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요.'
      : 'The 3D map could not load, so the basic route map is shown. Check your connection and try again.'}</p>
    <div className="tour-map-error-fallback">{fallback}</div>
  </>

  return <div className={`tour-maplibre-3d${isFlatMap ? ' tour-maplibre-2d' : ''}`}>
    {status === 'loading' && <div className="tour-maplibre-fallback">{fallback}</div>}
    <div className="tour-maplibre-host" ref={host} style={{ visibility: status === 'loading' ? 'hidden' : 'visible' }} role="region" aria-label={locale === 'ko' ? `${route.titleKo} ${isFlatMap ? '2D 지도' : '위성 3D 지도'}` : `${route.title} ${isFlatMap ? '2D map' : '3D aerial map'}`} />
    {!isFlatMap && <button className="tour-map-style-toggle" type="button" aria-label={locale === 'ko' ? '위성 사진 배경 전환' : 'Toggle satellite imagery'} aria-pressed={satellite} onClick={() => setSatellite(value => !value)}>
      {locale === 'ko' ? '위성 사진' : 'Satellite'}
    </button>}
    {status === 'loading' && <p className="google-route-loading" role="status">{locale === 'ko' ? '도시 3D 지도를 불러오는 중…' : 'Loading the 3D city map…'}</p>}
  </div>
}

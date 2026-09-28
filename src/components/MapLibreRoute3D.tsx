import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { ExpressionSpecification, GeoJSONSource, Map as MapLibreMap, Marker as MapLibreMarker } from 'maplibre-gl'
import { getTouristStation, type TouristRoute } from '../data/touristRoutes'
import type { ShadowCoordinate } from '../utils/solarShadow'
import 'maplibre-gl/dist/maplibre-gl.css'

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'
const IMAGERY_ATTRIBUTION = 'Imagery © Esri. Sources: Esri, Vantor, Earthstar Geographics, and the GIS User Community.'
const SATELLITE_SURFACES = new Set(['park', 'landuse', 'landcover', 'water', 'aeroway', 'building'])

export function MapLibreRoute3D({ route, locale, selectedStop, onSelectStop, onHoverStop, shadowPolygon, fallback }: {
  route: TouristRoute
  locale: 'en' | 'ko'
  selectedStop: number | null
  onSelectStop: (index: number) => void
  onHoverStop: (index: number | null) => void
  shadowPolygon: ShadowCoordinate[] | null
  fallback: ReactNode
}) {
  const host = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markersRef = useRef<MapLibreMarker[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [satellite, setSatellite] = useState(true)
  const initialCenter = useRef<maplibregl.LngLatLike | null>(null)
  const points = useMemo(() => route.stops.map(stop => {
    const station = getTouristStation(stop.stationId)
    return { lat: station.lat, lng: station.lng }
  }), [route])
  const boundsKey = points.map(({ lat, lng }) => `${lat},${lng}`).join('|')
  if (initialCenter.current === null) initialCenter.current = [points[0].lng, points[0].lat]

  useEffect(() => {
    if (!host.current) return
    let disposed = false
    let failed = false
    let timeout = 0
    const map = new maplibregl.Map({
      container: host.current,
      style: STYLE_URL,
      center: initialCenter.current ?? [points[0].lng, points[0].lat],
      zoom: 14,
      pitch: 64,
      bearing: -10,
      maxPitch: 75,
      attributionControl: {},
      canvasContextAttributes: { antialias: true },
    })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')
    const fail = () => {
      if (disposed || failed) return
      failed = true
      window.clearTimeout(timeout)
      markersRef.current.forEach(marker => marker.remove())
      markersRef.current = []
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
          layout: { visibility: 'visible' },
          paint: { 'raster-opacity': 1, 'raster-fade-duration': 250 },
        }, 'park')
        const layers = map.getStyle().layers
        for (const layer of layers) {
          const sourceLayer = 'source-layer' in layer ? layer['source-layer'] : undefined
          if (layer.id === 'background' || layer.id === 'natural_earth' || (layer.type === 'fill' && SATELLITE_SURFACES.has(sourceLayer ?? ''))) {
            map.setLayoutProperty(layer.id, 'visibility', 'none')
          }
        }
        map.addSource('tour-route-line', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addSource('tour-solar-shadow', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        const buildingLayer = layers.find(layer => layer.id === 'building-3d')?.id
        const shadowLayer = {
          id: 'tour-solar-shadow',
          type: 'fill' as const,
          source: 'tour-solar-shadow',
          paint: { 'fill-color': '#28342e', 'fill-opacity': 0.46, 'fill-outline-color': '#d0bd83' },
        }
        const routeLayer = {
          id: 'tour-route-line',
          type: 'line' as const,
          source: 'tour-route-line',
          layout: { 'line-cap': 'round' as const, 'line-join': 'round' as const },
          paint: {
            'line-color': '#04bd83',
            'line-width': ['interpolate', ['linear'], ['zoom'], 11, 2, 17, 5] as ExpressionSpecification,
            'line-opacity': 0.9,
            'line-dasharray': [2, 1.5],
          },
        }
        if (buildingLayer) map.addLayer(shadowLayer, buildingLayer)
        else map.addLayer(shadowLayer)
        if (buildingLayer) map.addLayer(routeLayer, buildingLayer)
        else map.addLayer(routeLayer)
        setStatus('ready')
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
      markersRef.current.forEach(marker => marker.remove())
      markersRef.current = []
      if (!failed) map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || status !== 'ready') return
    const routeSource = map.getSource('tour-route-line') as GeoJSONSource | undefined
    routeSource?.setData({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: points.map(point => [point.lng, point.lat] as [number, number]) },
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
  }, [locale, onHoverStop, onSelectStop, points, route, status])

  useEffect(() => {
    const source = mapRef.current?.getSource('tour-solar-shadow') as GeoJSONSource | undefined
    if (!source || status !== 'ready') return
    source.setData({
      type: 'FeatureCollection',
      features: shadowPolygon ? [{
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [shadowPolygon] },
      }] : [],
    })
  }, [shadowPolygon, status])

  useEffect(() => {
    const map = mapRef.current
    if (!map || status !== 'ready') return
    markersRef.current.forEach((marker, index) => {
      marker.getElement().classList.toggle('is-selected', selectedStop === index)
    })
    if (selectedStop !== null) {
      const point = points[selectedStop]
      map.flyTo({ center: [point.lng, point.lat], zoom: 17.1, pitch: 67, bearing: -18, duration: 1100, essential: false })
      return
    }
    const bounds = new maplibregl.LngLatBounds()
    points.forEach(point => bounds.extend([point.lng, point.lat] as [number, number]))
    map.fitBounds(bounds, { padding: { top: 66, right: 72, bottom: 66, left: 72 }, maxZoom: 14.2, pitch: 58, bearing: -8, duration: 480 })
  }, [boundsKey, points, selectedStop, status])

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
    {fallback}
  </>

  return <div className="tour-maplibre-3d">
    <div className="tour-maplibre-host" ref={host} role="region" aria-label={locale === 'ko' ? `${route.titleKo} 위성 3D 지도` : `${route.title} 3D aerial map`} />
    <button className="tour-map-style-toggle" type="button" aria-label={locale === 'ko' ? '위성 사진 배경 전환' : 'Toggle satellite imagery'} aria-pressed={satellite} onClick={() => setSatellite(value => !value)}>
      {locale === 'ko' ? '위성 사진' : 'Satellite'}
    </button>
    {status === 'loading' && <p className="google-route-loading" role="status">{locale === 'ko' ? '도시 3D 지도를 불러오는 중…' : 'Loading the 3D city map…'}</p>}
  </div>
}

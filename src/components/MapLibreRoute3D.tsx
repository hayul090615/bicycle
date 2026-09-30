import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as maplibregl from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { ExpressionSpecification, GeoJSONSource, Map as MapLibreMap, MapGeoJSONFeature, Marker as MapLibreMarker } from 'maplibre-gl'
import { getTouristStation, type TourSeason, type TouristRoute } from '../data/touristRoutes'
import { castBuildingShadow } from '../utils/buildingShadow'
import type { LonLat } from '../services/bikeRoute'
import type { PublicCamera } from '../services/publicCctv'
import type { RouteBikeLane, RouteCondition, RouteRestaurant } from '../services/routeConditions'
import type { NearbyBikeStation } from '../services/nearbyBikes'
import riderSpriteUrl from '../assets/map-riders.png'
import 'maplibre-gl/dist/maplibre-gl.css'

maplibregl.setWorkerUrl(maplibreWorkerUrl)

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'
const IMAGERY_ATTRIBUTION = 'Imagery © Esri. Sources: Esri, Vantor, Earthstar Geographics, and the GIS User Community.'
const SATELLITE_SURFACES = new Set(['park', 'landuse', 'landcover', 'water', 'aeroway', 'building'])
const EMPTY_SHADOWS: GeoJSON.FeatureCollection<GeoJSON.Polygon> = { type: 'FeatureCollection', features: [] }
const EMPTY_LINE: GeoJSON.FeatureCollection<GeoJSON.LineString> = { type: 'FeatureCollection', features: [] }
const SEASON_BUILDING_COLORS: Record<TourSeason, string> = {
  spring: '#c5bbb8', summer: '#b6bab1', autumn: '#c6b6a5', winter: '#bcc7ca',
}

function samplePath(path: LonLat[], count: number): LonLat[] {
  if (path.length < 2) return []
  const distances = [0]
  for (let index = 1; index < path.length; index++) {
    const [startLng, startLat] = path[index - 1]
    const [endLng, endLat] = path[index]
    distances.push(distances[index - 1] + Math.hypot((endLng - startLng) * 88_000, (endLat - startLat) * 111_000))
  }
  const total = distances[distances.length - 1]
  if (!total) return []
  return Array.from({ length: count }, (_, step) => {
    const target = total * (step + 1) / (count + 1)
    let index = 1
    while (index < distances.length - 1 && distances[index] < target) index++
    const ratio = (target - distances[index - 1]) / Math.max(1, distances[index] - distances[index - 1])
    return [path[index - 1][0] + (path[index][0] - path[index - 1][0]) * ratio,
      path[index - 1][1] + (path[index][1] - path[index - 1][1]) * ratio] as LonLat
  })
}

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

export function MapLibreRoute3D({ viewMode, route, routePath, accessPath, accessEstimated, walkPath, pickupStation, bikeLanes, showBikeLanes, season, routeConditions, restaurants, showCourse, showRestaurants, showRoadInfo, showRiders, cctvCameras, showCctv, locationFocusRequest, rotationRequest, locale, userLocation, selectedStop, onSelectStop, onHoverStop, shadowAzimuth, sunElevation, fallback }: {
  viewMode: 'city' | 'map'
  route: TouristRoute
  routePath: LonLat[] | null
  accessPath: LonLat[] | null
  accessEstimated: boolean
  walkPath: LonLat[] | null
  pickupStation: NearbyBikeStation | null
  bikeLanes: RouteBikeLane[]
  showBikeLanes: boolean
  season: TourSeason
  routeConditions: RouteCondition[]
  restaurants: RouteRestaurant[]
  showCourse: boolean
  showRestaurants: boolean
  showRoadInfo: boolean
  showRiders: boolean
  cctvCameras: PublicCamera[]
  showCctv: boolean
  locationFocusRequest: number
  rotationRequest: { direction: 'left' | 'right'; serial: number } | null
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
  const peopleMarkersRef = useRef<MapLibreMarker[]>([])
  const conditionMarkersRef = useRef<MapLibreMarker[]>([])
  const restaurantMarkersRef = useRef<MapLibreMarker[]>([])
  const cctvMarkersRef = useRef<MapLibreMarker[]>([])
  const cctvPopupRef = useRef<maplibregl.Popup | null>(null)
  const userMarkerRef = useRef<MapLibreMarker | null>(null)
  const pickupMarkerRef = useRef<MapLibreMarker | null>(null)
  const lastLocationFocusRequestRef = useRef(0)
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
      peopleMarkersRef.current.forEach(marker => marker.remove())
      peopleMarkersRef.current = []
      conditionMarkersRef.current.forEach(marker => marker.remove())
      conditionMarkersRef.current = []
      restaurantMarkersRef.current.forEach(marker => marker.remove())
      restaurantMarkersRef.current = []
      cctvMarkersRef.current.forEach(marker => marker.remove())
      cctvMarkersRef.current = []
      userMarkerRef.current?.remove()
      userMarkerRef.current = null
      pickupMarkerRef.current?.remove()
      pickupMarkerRef.current = null
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
        map.addSource('tour-access-line', { type: 'geojson', data: EMPTY_LINE })
        map.addSource('tour-walk-line', { type: 'geojson', data: EMPTY_LINE })
        map.addSource('tour-bike-lanes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
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
        const accessCasing = { id: 'tour-access-casing', type: 'line' as const, source: 'tour-access-line',
          layout: { 'line-cap': 'round' as const, 'line-join': 'round' as const },
          paint: { 'line-color': '#fffdf5', 'line-width': 10, 'line-opacity': .98 } }
        const accessLine = { id: 'tour-access-solid', type: 'line' as const, source: 'tour-access-line',
          layout: { 'line-cap': 'round' as const, 'line-join': 'round' as const, visibility: 'none' as const },
          paint: { 'line-color': '#2479db', 'line-width': 6, 'line-opacity': 1 } }
        const accessDashed = { id: 'tour-access-dashed', type: 'line' as const, source: 'tour-access-line',
          layout: { 'line-cap': 'round' as const, 'line-join': 'round' as const, visibility: 'none' as const },
          paint: { 'line-color': '#2479db', 'line-width': 6, 'line-opacity': 1, 'line-dasharray': [1.5, 1.2] } }
        const walkLine = { id: 'tour-walk-line', type: 'line' as const, source: 'tour-walk-line',
          layout: { 'line-cap': 'round' as const, 'line-join': 'round' as const },
          paint: { 'line-color': '#506b7b', 'line-width': 4, 'line-opacity': 1, 'line-dasharray': [1.2, 1.2] } }
        const bikeLaneCasing = { id: 'tour-bike-lanes-casing', type: 'line' as const, source: 'tour-bike-lanes',
          layout: { 'line-cap': 'round' as const, 'line-join': 'round' as const },
          paint: { 'line-color': '#fffdf4', 'line-width': 7, 'line-opacity': .9 } }
        const bikeLaneLine = { id: 'tour-bike-lanes-line', type: 'line' as const, source: 'tour-bike-lanes',
          layout: { 'line-cap': 'round' as const, 'line-join': 'round' as const },
          paint: { 'line-color': '#22a9c8', 'line-width': 4, 'line-opacity': .95, 'line-dasharray': [2, 1.4] } }
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
          map.addLayer(accessCasing, buildingLayer)
          map.addLayer(accessLine, buildingLayer)
          map.addLayer(accessDashed, buildingLayer)
          map.addLayer(walkLine, buildingLayer)
          map.addLayer(bikeLaneCasing, buildingLayer)
          map.addLayer(bikeLaneLine, buildingLayer)
        } else {
          map.addLayer(shadowFill)
          map.addLayer(shadowOutline)
          map.addLayer(routeCasing)
          map.addLayer(routeLayer)
          map.addLayer(accessCasing)
          map.addLayer(accessLine)
          map.addLayer(accessDashed)
          map.addLayer(walkLine)
          map.addLayer(bikeLaneCasing)
          map.addLayer(bikeLaneLine)
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
      peopleMarkersRef.current.forEach(marker => marker.remove())
      peopleMarkersRef.current = []
      conditionMarkersRef.current.forEach(marker => marker.remove())
      conditionMarkersRef.current = []
      restaurantMarkersRef.current.forEach(marker => marker.remove())
      restaurantMarkersRef.current = []
      userMarkerRef.current?.remove()
      userMarkerRef.current = null
      pickupMarkerRef.current?.remove()
      pickupMarkerRef.current = null
      if (!failed) map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => { updateBuildingShadowsRef.current() }, [shadowAzimuth, sunElevation, status])

  useEffect(() => {
    const map = mapRef.current
    if (!map || status !== 'ready') return
    if (map.getLayer('building-3d')) {
      map.setPaintProperty('building-3d', 'fill-extrusion-color', SEASON_BUILDING_COLORS[season])
      map.setPaintProperty('building-3d', 'fill-extrusion-opacity', .96)
      map.setPaintProperty('building-3d', 'fill-extrusion-vertical-gradient', true)
    }
  }, [season, status])

  useEffect(() => {
    const map = mapRef.current
    if (!map || status !== 'ready') return
    const source = map.getSource('tour-access-line') as GeoJSONSource | undefined
    source?.setData(accessPath && accessPath.length >= 2
      ? { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: accessPath } }
      : EMPTY_LINE)
    map.setLayoutProperty('tour-access-solid', 'visibility', showCourse && accessPath && !accessEstimated ? 'visible' : 'none')
    map.setLayoutProperty('tour-access-dashed', 'visibility', showCourse && accessPath && accessEstimated ? 'visible' : 'none')
  }, [accessPath, accessEstimated, showCourse, status])

  useEffect(() => {
    const map = mapRef.current
    if (!map || status !== 'ready') return
    const source = map.getSource('tour-walk-line') as GeoJSONSource | undefined
    source?.setData(walkPath && walkPath.length >= 2
      ? { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: walkPath } }
      : EMPTY_LINE)
  }, [status, walkPath])

  useEffect(() => {
    const map = mapRef.current
    if (!map || status !== 'ready') return
    const source = map.getSource('tour-bike-lanes') as GeoJSONSource | undefined
    source?.setData({
      type: 'FeatureCollection',
      features: bikeLanes.map(lane => ({
        type: 'Feature',
        properties: { kind: lane.kind },
        geometry: { type: 'LineString', coordinates: lane.points },
      })),
    })
    const visibility = showBikeLanes ? 'visible' : 'none'
    map.setLayoutProperty('tour-bike-lanes-casing', 'visibility', visibility)
    map.setLayoutProperty('tour-bike-lanes-line', 'visibility', visibility)
  }, [bikeLanes, showBikeLanes, status])

  useEffect(() => {
    const map = mapRef.current
    if (!map || status !== 'ready') return
    peopleMarkersRef.current.forEach(marker => marker.remove())
    conditionMarkersRef.current.forEach(marker => marker.remove())
    peopleMarkersRef.current = []
    conditionMarkersRef.current = []
    if (showRiders && !isFlatMap && routePath && routePath.length >= 2) {
      const routeLength = routePath.reduce((total, point, index) => index === 0 ? 0 : total + Math.hypot(
        (point[0] - routePath[index - 1][0]) * 88_000, (point[1] - routePath[index - 1][1]) * 111_000), 0)
      const riderCount = Math.max(2, Math.min(7, Math.floor(routeLength / 1800)))
      peopleMarkersRef.current = samplePath(routePath, riderCount).map(([lng, lat], index) => {
        const element = document.createElement('span')
        element.className = `tour-map-person tour-map-person--${index % 3}`
        element.style.backgroundImage = `url("${riderSpriteUrl}")`
        element.setAttribute('role', 'img')
        element.setAttribute('aria-label', locale === 'ko' ? 'AI로 만든 따릉이 이용자 이미지' : 'AI-generated illustrative rider')
        element.title = locale === 'ko' ? 'AI 생성 이미지 · 실제 이용자 아님' : 'AI generated · illustrative, not a live person'
        return new maplibregl.Marker({ element, anchor: 'bottom' }).setLngLat([lng, lat]).addTo(map)
      })
    }
    conditionMarkersRef.current = showRoadInfo ? routeConditions.map(condition => {
      const element = document.createElement('div')
      element.className = `tour-road-event tour-road-event--${condition.kind}`
      const label = condition.kind === 'signal'
        ? locale === 'ko' ? '지도에 기록된 교통 신호등' : 'Mapped traffic signal'
        : `${condition.kind === 'uphill' ? (locale === 'ko' ? '오르막' : 'Uphill') : (locale === 'ko' ? '내리막' : 'Downhill')} ${condition.grade}%`
      element.setAttribute('role', 'img')
      element.setAttribute('aria-label', label)
      element.title = label
      element.textContent = condition.kind === 'signal' ? '' : `${condition.kind === 'uphill' ? '↗' : '↘'} ${condition.grade}%`
      return new maplibregl.Marker({ element, anchor: 'center' }).setLngLat([condition.lng, condition.lat]).addTo(map)
    }) : []
    let frame = 0
    const updateVisibility = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        const zoom = map.getZoom()
        const hasBuildings = !isFlatMap && Boolean(map.getLayer('building-3d'))
        const isBlocked = (marker: MapLibreMarker) => {
          if (!hasBuildings) return false
          const pixel = map.project(marker.getLngLat())
          return map.queryRenderedFeatures(pixel, { layers: ['building-3d'] }).length > 0
        }
        peopleMarkersRef.current.forEach(marker => {
          const visible = zoom >= 16.9 && !isBlocked(marker)
          const scale = Math.max(24, Math.min(50, 24 + (zoom - 16.9) * 15))
          marker.getElement().style.width = `${scale}px`
          marker.getElement().style.height = `${scale * 1.85}px`
          marker.getElement().style.display = visible ? '' : 'none'
        })
        conditionMarkersRef.current.forEach(marker => {
          marker.getElement().style.display = zoom >= 14.5 && !isBlocked(marker) ? '' : 'none'
        })
        markersRef.current.forEach(marker => {
          marker.getElement().style.display = isBlocked(marker) ? 'none' : ''
        })
      })
    }
    map.on('zoom', updateVisibility)
    map.on('move', updateVisibility)
    map.on('idle', updateVisibility)
    updateVisibility()
    return () => {
      window.cancelAnimationFrame(frame)
      map.off('zoom', updateVisibility)
      map.off('move', updateVisibility)
      map.off('idle', updateVisibility)
      peopleMarkersRef.current.forEach(marker => marker.remove())
      conditionMarkersRef.current.forEach(marker => marker.remove())
      peopleMarkersRef.current = []
      conditionMarkersRef.current = []
    }
  }, [isFlatMap, linePoints, locale, routeConditions, routePath, showRiders, showRoadInfo, status])

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
    pickupMarkerRef.current?.remove()
    pickupMarkerRef.current = null
    if (!pickupStation) return
    const element = document.createElement('div')
    element.className = 'tour-pickup-marker'
    element.textContent = '🚲'
    const label = locale === 'ko' ? `${pickupStation.name} · 대여 가능 ${pickupStation.available ?? '확인 전'}대` : `${pickupStation.name} · ${pickupStation.available ?? 'unknown'} bikes available`
    element.setAttribute('role', 'img')
    element.setAttribute('aria-label', label)
    element.title = label
    pickupMarkerRef.current = new maplibregl.Marker({ element, anchor: 'bottom' })
      .setLngLat([pickupStation.lng, pickupStation.lat]).addTo(map)
  }, [locale, pickupStation, status])

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
    if (showCourse) route.stops.forEach((stop, index) => {
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
  }, [linePoints, locale, onHoverStop, onSelectStop, points, route, showCourse, status])

  useEffect(() => {
    const map = mapRef.current
    if (!map || status !== 'ready') return
    const visibility = showCourse ? 'visible' : 'none'
    map.setLayoutProperty('tour-route-casing', 'visibility', visibility)
    map.setLayoutProperty('tour-route-line', 'visibility', visibility)
  }, [showCourse, status])

  useEffect(() => {
    const map = mapRef.current
    if (!map || status !== 'ready') return
    markersRef.current.forEach((marker, index) => {
      marker.getElement().classList.toggle('is-selected', selectedStop === index)
    })
    if (locationFocusRequest > 0 && selectedStop === null && userLocation) return
    if (accessPath && accessPath.length >= 2) {
      const bounds = new maplibregl.LngLatBounds()
      ;(selectedStop === null ? [...linePoints, ...accessPath, ...(walkPath ?? [])] : [...accessPath, ...(walkPath ?? [])]).forEach(point => bounds.extend(point))
      map.fitBounds(bounds, { padding: { top: 72, right: 72, bottom: 72, left: 72 }, maxZoom: 16.2, pitch: isFlatMap ? 0 : 55, duration: 480 })
      return
    }
    if (selectedStop !== null) {
      const point = points[selectedStop]
      map.flyTo({ center: [point.lng, point.lat], zoom: 17.1, pitch: isFlatMap ? 0 : 67, bearing: isFlatMap ? 0 : -18, duration: 1100, essential: false })
      return
    }
    const bounds = new maplibregl.LngLatBounds()
    linePoints.forEach(point => bounds.extend(point))
    map.fitBounds(bounds, { padding: { top: 48, right: 52, bottom: 48, left: 52 }, maxZoom: 15, pitch: isFlatMap ? 0 : 58, bearing: isFlatMap ? 0 : -8, duration: 480 })
  }, [accessPath, isFlatMap, linePoints, locationFocusRequest, points, selectedStop, status, userLocation, walkPath])

  useEffect(() => {
    const map = mapRef.current
    if (!map || status !== 'ready' || locationFocusRequest === 0 || locationFocusRequest === lastLocationFocusRequestRef.current || !userLocation) return
    lastLocationFocusRequestRef.current = locationFocusRequest
    map.flyTo({
      center: [userLocation.lng, userLocation.lat],
      zoom: 16,
      pitch: isFlatMap ? 0 : 62,
      bearing: isFlatMap ? 0 : -12,
      duration: 600,
      essential: false,
    })
  }, [isFlatMap, locationFocusRequest, status, userLocation])

  useEffect(() => {
    const map = mapRef.current
    if (!map || status !== 'ready') return
    const sourceId = 'tour-cctv-data'
    const clusterLayerId = 'tour-cctv-clusters'
    const countLayerId = 'tour-cctv-count'
    const pointLayerId = 'tour-cctv-points'
    if (!showCctv) {
      cctvPopupRef.current?.remove()
      cctvPopupRef.current = null
      for (const layerId of [clusterLayerId, countLayerId, pointLayerId]) {
        if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', 'none')
      }
      return
    }
    const data: GeoJSON.FeatureCollection<GeoJSON.Point> = {
      type: 'FeatureCollection',
      features: cctvCameras.map(camera => ({
        type: 'Feature',
        id: camera.id,
        properties: { ...camera },
        geometry: { type: 'Point', coordinates: [camera.lng, camera.lat] },
      })),
    }
    const source = map.getSource(sourceId) as GeoJSONSource | undefined
    if (source) source.setData(data)
    else {
      map.addSource(sourceId, { type: 'geojson', data, cluster: true, clusterRadius: 48, clusterMaxZoom: 16, maxzoom: 18 })
      map.addLayer({
        id: clusterLayerId,
        type: 'circle',
        source: sourceId,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': ['step', ['get', 'point_count'], '#7155a6', 20, '#604493', 100, '#4c347e'],
          'circle-radius': ['step', ['get', 'point_count'], 15, 20, 19, 100, 23],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
          'circle-opacity': .94,
        },
      })
      map.addLayer({
        id: countLayerId,
        type: 'symbol',
        source: sourceId,
        filter: ['has', 'point_count'],
        layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 11, 'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'] },
        paint: { 'text-color': '#ffffff' },
      })
      map.addLayer({
        id: pointLayerId,
        type: 'circle',
        source: sourceId,
        filter: ['!', ['has', 'point_count']],
        minzoom: 12,
        paint: { 'circle-color': '#7155a6', 'circle-radius': 5, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 },
      })
    }
    for (const layerId of [clusterLayerId, countLayerId, pointLayerId]) {
      if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', 'visible')
    }
    const openCameraPopup = (event: maplibregl.MapMouseEvent) => {
      const feature = map.queryRenderedFeatures(event.point, { layers: [pointLayerId] })[0]
      if (!feature) return
      const properties = feature.properties ?? {}
      const popupContent = document.createElement('div')
      popupContent.className = 'tour-cctv-popup'
      const heading = document.createElement('strong')
      heading.textContent = String(properties.purpose || (locale === 'ko' ? '공공 CCTV' : 'Public CCTV'))
      const name = document.createElement('div')
      name.textContent = String(properties.name || '')
      const address = document.createElement('div')
      address.textContent = String(properties.address || (locale === 'ko' ? '주소 정보 없음' : 'Address not listed'))
      const metadata = document.createElement('small')
      metadata.textContent = `${locale === 'ko' ? '카메라' : 'Cameras'} ${String(properties.cameras || '—')} · ${String(properties.resolution || '—')} · ${String(properties.direction || '—')}`
      const date = document.createElement('small')
      date.textContent = `${locale === 'ko' ? '자료 기준일' : 'Data date'} ${String(properties.updatedAt || '—')}`
      const notice = document.createElement('small')
      notice.textContent = locale === 'ko'
        ? '공개 설치 위치 정보입니다. 실시간 영상 주소는 제공되지 않습니다.'
        : 'Public installation record; no live video URL is provided.'
      popupContent.append(heading, name, address, metadata, date, notice)
      const coordinates = (feature.geometry as GeoJSON.Point).coordinates as [number, number]
      cctvPopupRef.current?.remove()
      cctvPopupRef.current = new maplibregl.Popup({ closeButton: true, closeOnClick: true, maxWidth: '300px' })
        .setLngLat(coordinates).setDOMContent(popupContent).addTo(map)
    }
    const zoomCluster = (event: maplibregl.MapMouseEvent) => {
      const feature = map.queryRenderedFeatures(event.point, { layers: [clusterLayerId] })[0]
      if (!feature) return
      const coordinates = (feature.geometry as GeoJSON.Point).coordinates as [number, number]
      map.easeTo({ center: coordinates, zoom: Math.min(map.getZoom() + 2.2, 19), duration: 350 })
    }
    const setPointer = () => { map.getCanvas().style.cursor = 'pointer' }
    const clearPointer = () => { map.getCanvas().style.cursor = '' }
    map.on('click', clusterLayerId, zoomCluster)
    map.on('click', pointLayerId, openCameraPopup)
    map.on('mouseenter', clusterLayerId, setPointer)
    map.on('mouseleave', clusterLayerId, clearPointer)
    map.on('mouseenter', pointLayerId, setPointer)
    map.on('mouseleave', pointLayerId, clearPointer)
    return () => {
      map.off('click', clusterLayerId, zoomCluster)
      map.off('click', pointLayerId, openCameraPopup)
      map.off('mouseenter', clusterLayerId, setPointer)
      map.off('mouseleave', clusterLayerId, clearPointer)
      map.off('mouseenter', pointLayerId, setPointer)
      map.off('mouseleave', pointLayerId, clearPointer)
    }
  }, [cctvCameras, locale, showCctv, status])

  useEffect(() => {
    const map = mapRef.current
    if (!map || status !== 'ready') return
    restaurantMarkersRef.current.forEach(marker => marker.remove())
    restaurantMarkersRef.current = []
    if (!showRestaurants) return
    restaurants.forEach(place => {
      const element = document.createElement('button')
      element.type = 'button'
      element.className = `tour-restaurant-map-marker tour-restaurant-map-marker--${place.kind}`
      const kindLabel = place.kind === 'cafe' ? (locale === 'ko' ? '카페' : 'Cafe') : (locale === 'ko' ? '음식점' : 'Restaurant')
      element.setAttribute('aria-label', `${place.name} · ${kindLabel}`)
      element.title = place.name
      element.textContent = place.kind === 'cafe' ? '☕' : '식'
      const popupContent = document.createElement('div')
      popupContent.className = 'tour-restaurant-popup'
      const name = document.createElement('strong')
      name.textContent = place.name
      const category = document.createElement('small')
      category.textContent = `${kindLabel}${place.cuisine ? ` · ${place.cuisine}` : ''}`
      const source = document.createElement('small')
      source.textContent = locale === 'ko' ? 'OpenStreetMap 지도 등록 정보' : 'OpenStreetMap map listing'
      popupContent.append(name, category, source)
      const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, maxWidth: '260px' }).setDOMContent(popupContent)
      restaurantMarkersRef.current.push(new maplibregl.Marker({ element, anchor: 'bottom' })
        .setLngLat([place.lng, place.lat])
        .setPopup(popup)
        .addTo(map))
    })
  }, [locale, restaurants, showRestaurants, status])

  useEffect(() => {
    const map = mapRef.current
    if (!map || status !== 'ready' || !rotationRequest) return
    const turn = rotationRequest.direction === 'left' ? -32 : 32
    const bearing = ((map.getBearing() + turn) % 360 + 360) % 360
    map.rotateTo(bearing, { duration: 420 })
  }, [rotationRequest, status])

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

  return <div className={`tour-maplibre-3d tour-scene-${season}${isFlatMap ? ' tour-maplibre-2d' : ''}`}>
    {status === 'loading' && <div className="tour-maplibre-fallback">{fallback}</div>}
    <div className="tour-maplibre-host" ref={host} style={{ visibility: status === 'loading' ? 'hidden' : 'visible' }} role="region" aria-label={locale === 'ko' ? `${route.titleKo} ${isFlatMap ? '2D 지도' : '위성 3D 지도'}` : `${route.title} ${isFlatMap ? '2D map' : '3D aerial map'}`} />
    {!isFlatMap && <button className="tour-map-style-toggle" type="button" aria-label={locale === 'ko' ? '위성 사진 배경 전환' : 'Toggle satellite imagery'} aria-pressed={satellite} onClick={() => setSatellite(value => !value)}>
      {locale === 'ko' ? '위성 사진' : 'Satellite'}
    </button>}
    {status === 'loading' && <p className="google-route-loading" role="status">{locale === 'ko'
      ? isFlatMap ? '일반 지도를 불러오는 중…' : '도시 3D 지도를 불러오는 중…'
      : isFlatMap ? 'Loading the street map…' : 'Loading the 3D city map…'}</p>}
  </div>
}

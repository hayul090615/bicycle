import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as maplibregl from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { ExpressionSpecification, GeoJSONSource, Map as MapLibreMap, MapGeoJSONFeature, Marker as MapLibreMarker, SkySpecification } from 'maplibre-gl'
import { getTouristStation, type TourSeason, type TouristRoute } from '../data/touristRoutes'
import { castBuildingShadow } from '../utils/buildingShadow'
import { createCyclistMarker } from './cyclistMarker'
import { createFoodGuideMarker } from './foodGuideMarker'
import { sampleRouteAtIntervals } from '../utils/routeMapSamples'
import type { LonLat } from '../services/bikeRoute'
import type { PublicCamera } from '../services/publicCctv'
import type { NearbyBikeStation } from '../services/nearbyBikes'
import type { RouteAmenity, RouteBikeLane, RouteCondition, RouteRestaurant } from '../services/routeConditions'
import { createRouteMotion } from '../services/routeMotion'
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
const SEASON_SKIES: Record<TourSeason, SkySpecification> = {
  spring: { 'sky-color': '#9bbbd0', 'horizon-color': '#f0d5d2', 'sky-horizon-blend': 0.72, 'horizon-fog-blend': 0.22, 'atmosphere-blend': 0.5 },
  summer: { 'sky-color': '#78abc5', 'horizon-color': '#f1dfa9', 'sky-horizon-blend': 0.74, 'horizon-fog-blend': 0.2, 'atmosphere-blend': 0.48 },
  autumn: { 'sky-color': '#98acb7', 'horizon-color': '#e8c18f', 'sky-horizon-blend': 0.7, 'horizon-fog-blend': 0.24, 'atmosphere-blend': 0.48 },
  winter: { 'sky-color': '#a7c4d2', 'horizon-color': '#e2eaf0', 'sky-horizon-blend': 0.76, 'horizon-fog-blend': 0.2, 'atmosphere-blend': 0.46 },
}
const SEASON_NIGHT_SKIES: Record<TourSeason, SkySpecification> = {
  spring: { 'sky-color': '#101b36', 'horizon-color': '#76566e', 'sky-horizon-blend': .78, 'horizon-fog-blend': .26, 'atmosphere-blend': .56 },
  summer: { 'sky-color': '#081a32', 'horizon-color': '#3d6975', 'sky-horizon-blend': .8, 'horizon-fog-blend': .22, 'atmosphere-blend': .5 },
  autumn: { 'sky-color': '#17172f', 'horizon-color': '#885e55', 'sky-horizon-blend': .76, 'horizon-fog-blend': .3, 'atmosphere-blend': .58 },
  winter: { 'sky-color': '#07172c', 'horizon-color': '#637e9c', 'sky-horizon-blend': .82, 'horizon-fog-blend': .24, 'atmosphere-blend': .5 },
}
type MapWeather = 'sunny' | 'cloudy' | 'rainy'
function mapSky(season: TourSeason, weather: MapWeather, night: boolean): SkySpecification {
  const seasonal = night ? SEASON_NIGHT_SKIES[season] : SEASON_SKIES[season]
  if (night && weather === 'rainy') return { ...seasonal, 'sky-color': '#101821', 'horizon-color': '#394956', 'horizon-fog-blend': .42, 'atmosphere-blend': .68 }
  if (night && weather === 'cloudy') return { ...seasonal, 'sky-color': '#162235', 'horizon-fog-blend': .38, 'atmosphere-blend': .64 }
  if (weather === 'rainy') return { ...seasonal, 'sky-color': '#728393', 'horizon-color': '#9ca9b2', 'sky-horizon-blend': .84, 'horizon-fog-blend': .34, 'atmosphere-blend': .68 }
  if (weather === 'cloudy') return { ...seasonal, 'sky-color': '#91a0a8', 'horizon-color': '#bdc3bf', 'sky-horizon-blend': .8, 'horizon-fog-blend': .3, 'atmosphere-blend': .56 }
  return seasonal
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

function samplePathWithBearing(path: LonLat[], count: number): Array<{ point: LonLat; bearing: number }> {
  if (path.length < 2 || count < 1) return []
  const segmentLengths: number[] = []
  let total = 0
  for (let index = 1; index < path.length; index++) {
    const [startLng, startLat] = path[index - 1]
    const [endLng, endLat] = path[index]
    const length = Math.hypot((endLng - startLng) * 88_000, (endLat - startLat) * 111_000)
    segmentLengths.push(length)
    total += length
  }
  if (!total) return []
  return Array.from({ length: count }, (_, step) => {
    let remaining = total * (step + 1) / (count + 1)
    let segment = 0
    while (segment < segmentLengths.length - 1 && remaining > segmentLengths[segment]) {
      remaining -= segmentLengths[segment]
      segment++
    }
    const [startLng, startLat] = path[segment]
    const [endLng, endLat] = path[segment + 1]
    const length = Math.max(1, segmentLengths[segment])
    const ratio = remaining / length
    const point: LonLat = [startLng + (endLng - startLng) * ratio, startLat + (endLat - startLat) * ratio]
    const meanLat = (startLat + endLat) / 2 * Math.PI / 180
    const bearing = (Math.atan2((endLng - startLng) * Math.cos(meanLat), endLat - startLat) * 180 / Math.PI + 360) % 360
    return { point, bearing }
  })
}

function offsetFromRoute([lng, lat]: LonLat, bearing: number, meters: number): LonLat {
  const side = (bearing + 90) * Math.PI / 180
  const latitude = lat + Math.cos(side) * meters / 111_000
  const longitude = lng + Math.sin(side) * meters / (111_000 * Math.cos(lat * Math.PI / 180))
  return [longitude, latitude]
}

function bearingToDestination(start: { lat: number; lng: number }, end: { lat: number; lng: number }): number {
  const latitude1 = start.lat * Math.PI / 180
  const latitude2 = end.lat * Math.PI / 180
  const longitudeDelta = (end.lng - start.lng) * Math.PI / 180
  const y = Math.sin(longitudeDelta) * Math.cos(latitude2)
  const x = Math.cos(latitude1) * Math.sin(latitude2) - Math.sin(latitude1) * Math.cos(latitude2) * Math.cos(longitudeDelta)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
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

export function MapLibreRoute3D({ viewMode, route, routePath, accessPath, accessEstimated, walkPath, pickupStation, bikeLanes, showBikeLanes, amenities, showAmenities, bikeStations, showBikeStations, season, weather, nightSky, routeConditions, restaurants, showCourse, showRestaurants, showRoadInfo, showRiders, cctvCameras, showCctv, showShadows, locationFocusRequest, rotationRequest, onFoodGuideOpen, locale, userLocation, selectedStop, onSelectStop, onHoverStop, shadowAzimuth, sunElevation, fallback }: {
  viewMode: 'city' | 'satellite' | 'map'
  route: TouristRoute
  routePath: LonLat[] | null
  accessPath: LonLat[] | null
  accessEstimated: boolean
  walkPath: LonLat[] | null
  pickupStation: NearbyBikeStation | null
  bikeLanes: RouteBikeLane[]
  showBikeLanes: boolean
  amenities: RouteAmenity[]
  showAmenities: boolean
  bikeStations: NearbyBikeStation[]
  showBikeStations: boolean
  season: TourSeason
  weather: MapWeather
  nightSky: boolean
  routeConditions: RouteCondition[]
  restaurants: RouteRestaurant[]
  showCourse: boolean
  showRestaurants: boolean
  showRoadInfo: boolean
  showRiders: boolean
  cctvCameras: PublicCamera[]
  showCctv: boolean
  showShadows: boolean
  locationFocusRequest: number
  rotationRequest: { direction: 'left' | 'right' | 'up' | 'down'; serial: number } | null
  onFoodGuideOpen: (point: LonLat) => void
  locale: 'en' | 'ko'
  userLocation: { lat: number; lng: number; heading?: number } | null
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
  const treeMarkersRef = useRef<MapLibreMarker[]>([])
  const foodGuideMarkersRef = useRef<MapLibreMarker[]>([])
  const conditionMarkersRef = useRef<MapLibreMarker[]>([])
  const restaurantMarkersRef = useRef<MapLibreMarker[]>([])
  const cctvMarkersRef = useRef<MapLibreMarker[]>([])
  const cctvPopupRef = useRef<maplibregl.Popup | null>(null)
  const userMarkerRef = useRef<MapLibreMarker | null>(null)
  const pickupMarkerRef = useRef<MapLibreMarker | null>(null)
  const lastLocationFocusRequestRef = useRef(0)
  const shadowAzimuthRef = useRef(shadowAzimuth)
  const sunElevationRef = useRef(sunElevation)
  const nightSkyRef = useRef(nightSky)
  const updateBuildingShadowsRef = useRef<() => void>(() => {})
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [satellite, setSatellite] = useState(() => viewMode !== 'map')
  shadowAzimuthRef.current = shadowAzimuth
  sunElevationRef.current = sunElevation
  nightSkyRef.current = nightSky
  const initialCenter = useRef<maplibregl.LngLatLike | null>(null)
  const is3DView = viewMode === 'city'
  const isFlatMap = !is3DView
  const showSatellite = viewMode === 'satellite' || (viewMode === 'city' && satellite)
  const points = useMemo(() => route.stops.map(stop => {
    const station = getTouristStation(stop.stationId)
    return { lat: station.lat, lng: station.lng }
  }), [route])
  const linePoints = useMemo(() => routePath ?? points.map(point => [point.lng, point.lat] as LonLat), [routePath, points])
  if (initialCenter.current === null) initialCenter.current = [126.978, 37.5665]

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
      zoom: 11.2,
      maxBounds: [[126.75, 37.40], [127.19, 37.72]],
      pitch: is3DView ? 68 : 0,
      bearing: is3DView ? -10 : 0,
      maxZoom: 23,
      maxPitch: 85,
      attributionControl: {},
      canvasContextAttributes: { antialias: true },
    })
    mapRef.current = map
    const updateBuildingShadows = () => {
      if (!map.isStyleLoaded() || !map.getLayer('building-3d')) return
      const source = map.getSource('tour-building-shadows') as GeoJSONSource | undefined
      if (!source) return
      const features = is3DView && !nightSkyRef.current && sunElevationRef.current > 0
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
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: is3DView }), 'top-right')
    const fail = () => {
      if (disposed || failed) return
      failed = true
      window.clearTimeout(timeout)
      markersRef.current.forEach(marker => marker.remove())
      markersRef.current = []
      peopleMarkersRef.current.forEach(marker => marker.remove())
      peopleMarkersRef.current = []
      treeMarkersRef.current.forEach(marker => marker.remove())
      treeMarkersRef.current = []
      foodGuideMarkersRef.current.forEach(marker => marker.remove())
      foodGuideMarkersRef.current = []
      foodGuideMarkersRef.current.forEach(marker => marker.remove())
      foodGuideMarkersRef.current = []
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
        if (is3DView) map.setSky(mapSky(season, weather, nightSky))
        map.addSource('tour-imagery', {
          type: 'raster',
          tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
          tileSize: 256,
          maxzoom: 23,
          attribution: IMAGERY_ATTRIBUTION,
        })
        map.addLayer({
          id: 'tour-imagery',
          type: 'raster',
          source: 'tour-imagery',
          layout: { visibility: showSatellite ? 'visible' : 'none' },
          paint: { 'raster-opacity': 1, 'raster-fade-duration': 100 },
        }, 'park')
        const layers = map.getStyle().layers
        if (showSatellite) {
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
            'line-color': '#ff3b30',
            'line-width': ['interpolate', ['linear'], ['zoom'], 11, 5, 17, 10] as ExpressionSpecification,
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
            'line-width': ['interpolate', ['linear'], ['zoom'], 11, 10, 17, 15] as ExpressionSpecification,
            'line-opacity': 0.96,
          },
        }
        if (map.getLayer('building-3d')) map.setLayoutProperty('building-3d', 'visibility', is3DView ? 'visible' : 'none')
        const accessCasing = { id: 'tour-access-casing', type: 'line' as const, source: 'tour-access-line',
          layout: { 'line-cap': 'round' as const, 'line-join': 'round' as const },
          paint: { 'line-color': '#fffdf5', 'line-width': 14, 'line-opacity': .98 } }
        const accessLine = { id: 'tour-access-solid', type: 'line' as const, source: 'tour-access-line',
          layout: { 'line-cap': 'round' as const, 'line-join': 'round' as const, visibility: 'none' as const },
          paint: { 'line-color': '#ff3b30', 'line-width': 8, 'line-opacity': 1 } }
        const accessDashed = { id: 'tour-access-dashed', type: 'line' as const, source: 'tour-access-line',
          layout: { 'line-cap': 'round' as const, 'line-join': 'round' as const, visibility: 'none' as const },
          paint: { 'line-color': '#ff3b30', 'line-width': 8, 'line-opacity': 1, 'line-dasharray': [1.5, 1.2] } }
        const walkLine = { id: 'tour-walk-line', type: 'line' as const, source: 'tour-walk-line',
          layout: { 'line-cap': 'round' as const, 'line-join': 'round' as const },
          paint: { 'line-color': '#506b7b', 'line-width': 4, 'line-opacity': 1, 'line-dasharray': [1.2, 1.2] } }
        const bikeLaneCasing = { id: 'tour-bike-lanes-casing', type: 'line' as const, source: 'tour-bike-lanes',
          layout: { 'line-cap': 'round' as const, 'line-join': 'round' as const },
          paint: { 'line-color': '#fffdf4', 'line-width': 7, 'line-opacity': .9 } }
        const bikeLaneLine = { id: 'tour-bike-lanes-line', type: 'line' as const, source: 'tour-bike-lanes',
          layout: { 'line-cap': 'round' as const, 'line-join': 'round' as const },
          paint: { 'line-color': '#2585a6', 'line-width': 4, 'line-opacity': .98, 'line-dasharray': [2, 1.4] } }
        map.addSource('tour-building-shadows', { type: 'geojson', data: EMPTY_SHADOWS })
        const shadowFill = {
          id: 'tour-building-shadow-fill',
          type: 'fill' as const,
          source: 'tour-building-shadows',
          layout: { visibility: is3DView && showShadows ? 'visible' as const : 'none' as const },
          paint: { 'fill-color': '#24362f', 'fill-opacity': 0.36, 'fill-antialias': true },
        }
        const shadowOutline = {
          id: 'tour-building-shadow-outline',
          type: 'line' as const,
          source: 'tour-building-shadows',
          layout: { visibility: is3DView && showShadows ? 'visible' as const : 'none' as const },
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
      treeMarkersRef.current.forEach(marker => marker.remove())
      treeMarkersRef.current = []
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
    if (!map || status !== 'ready' || !showBikeStations) return
    const markers = bikeStations.map(station => {
      const element = document.createElement('span')
      element.className = 'tour-live-bike-marker'
      const count = document.createElement('span')
      count.textContent = station.available === null ? '–' : String(station.available)
      element.append(count)
      element.title = `${station.name} · ${station.available ?? '—'} ${locale === 'ko' ? '대 대여 가능' : 'bikes available'}`
      element.setAttribute('role', 'img')
      element.setAttribute('aria-label', element.title)
      return new maplibregl.Marker({ element, anchor: 'bottom' }).setLngLat([station.lng, station.lat]).addTo(map)
    })
    return () => markers.forEach(marker => marker.remove())
  }, [bikeStations, locale, showBikeStations, status])

  useEffect(() => {
    const map = mapRef.current
    if (!map || status !== 'ready' || !showAmenities) return
    const glyphs: Record<RouteAmenity['kind'], string> = { pump: '🔧', water: '💧', toilet: '🚻', convenience: '🏪' }
    const labels = locale === 'ko' ? { pump: '공기주입기', water: '음수대', toilet: '화장실', convenience: '편의점' }
      : { pump: 'Bike pump', water: 'Water', toilet: 'Toilet', convenience: 'Shop' }
    const shortLabels = locale === 'ko' ? { pump: '공기', water: '물', toilet: '화장실', convenience: '편의점' }
      : { pump: 'Air', water: 'Water', toilet: 'WC', convenience: 'Shop' }
    const markers = amenities.map(amenity => {
      const element = document.createElement('span')
      element.className = `tour-amenity-icon tour-amenity-icon--${amenity.kind}`
      element.innerHTML = `<span>${glyphs[amenity.kind]}</span><b>${shortLabels[amenity.kind]}</b>`
      element.title = `${labels[amenity.kind]}${amenity.name ? ` · ${amenity.name}` : ''}`
      element.setAttribute('role', 'img')
      element.setAttribute('aria-label', element.title)
      return new maplibregl.Marker({ element, anchor: 'center' }).setLngLat([amenity.lng, amenity.lat]).addTo(map)
    })
    return () => markers.forEach(marker => marker.remove())
  }, [amenities, locale, showAmenities, status])

  useEffect(() => {
    const map = mapRef.current
    if (!map || status !== 'ready') return
    const visibility = is3DView && showShadows && !nightSky ? 'visible' : 'none'
    for (const layerId of ['tour-building-shadow-fill', 'tour-building-shadow-outline']) {
      if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', visibility)
    }
  }, [is3DView, nightSky, showShadows, status])

  useEffect(() => {
    const map = mapRef.current
    if (!map || status !== 'ready') return
    if (is3DView) map.setSky(mapSky(season, weather, nightSky))
    if (map.getLayer('tour-imagery')) map.setPaintProperty('tour-imagery', 'raster-brightness-max', nightSky && is3DView ? .62 : 1)
  }, [is3DView, nightSky, season, status, weather])

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
    treeMarkersRef.current.forEach(marker => marker.remove())
    foodGuideMarkersRef.current.forEach(marker => marker.remove())
    conditionMarkersRef.current.forEach(marker => marker.remove())
    peopleMarkersRef.current = []
    treeMarkersRef.current = []
    foodGuideMarkersRef.current = []
    conditionMarkersRef.current = []
    let riderFrame = 0
    const sceneryPath = routePath && routePath.length >= 2 ? routePath : linePoints
    if (sceneryPath.length >= 2) {
      const motion = createRouteMotion(sceneryPath)
      const routeLength = sceneryPath.reduce((total, point, index) => index === 0 ? 0 : total + Math.hypot(
        (point[0] - sceneryPath[index - 1][0]) * 88_000, (point[1] - sceneryPath[index - 1][1]) * 111_000), 0)
      if (showRiders) {
        const riderCount = Math.max(8, Math.min(14, Math.round(routeLength / 1400)))
        peopleMarkersRef.current = samplePath(sceneryPath, riderCount).map(([lng, lat], index) => {
          const element = createCyclistMarker(index, locale)
          return new maplibregl.Marker({ element, anchor: 'bottom' }).setLngLat([lng, lat]).addTo(map)
        })
        if (motion) {
          const startedAt = performance.now()
          let lastUpdate = 0
          const moveRiders = (now: number) => {
            if (now - lastUpdate < 45) { riderFrame = window.requestAnimationFrame(moveRiders); return }
            lastUpdate = now
            const traveled = (now - startedAt) / 1000 * 3.2 / motion.lengthMeters
            peopleMarkersRef.current.forEach((marker, index) => {
              const position = motion.pointAt(traveled + index / riderCount)
              marker.setLngLat(position.point)
              marker.getElement().style.setProperty('--rider-heading', `${position.bearing}deg`)
            })
            riderFrame = window.requestAnimationFrame(moveRiders)
          }
          riderFrame = window.requestAnimationFrame(moveRiders)
        }
      }
      if (showCourse) {
        foodGuideMarkersRef.current = sampleRouteAtIntervals(sceneryPath, 100).map(({ point }, index) => {
          const element = createFoodGuideMarker(locale, index, () => onFoodGuideOpen(point))
          return new maplibregl.Marker({ element, anchor: 'bottom' }).setLngLat(point).addTo(map)
        })
      }
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
        const hasBuildings = is3DView && Boolean(map.getLayer('building-3d'))
        const isBlocked = (marker: MapLibreMarker) => {
          if (!hasBuildings) return false
          const pixel = map.project(marker.getLngLat())
          const { width, height } = map.getContainer().getBoundingClientRect()
          if (pixel.x < 0 || pixel.y < 0 || pixel.x > width || pixel.y > height) return true
          return map.queryRenderedFeatures(pixel, { layers: ['building-3d'] }).length > 0
        }
        peopleMarkersRef.current.forEach(marker => {
          const visible = zoom >= 11.5 && !(zoom >= 16 && isBlocked(marker))
          const scale = Math.max(25, Math.min(46, 30 + (zoom - 14) * 4))
          marker.getElement().style.width = `${scale}px`
          marker.getElement().style.height = `${scale * 1.85}px`
          marker.getElement().style.display = visible ? '' : 'none'
        })
        treeMarkersRef.current.forEach(marker => {
          const visible = zoom >= 11.5
          const scale = Math.max(19, Math.min(36, 22 + (zoom - 14) * 3))
          marker.getElement().style.width = `${scale}px`
          marker.getElement().style.height = `${scale * 1.48}px`
          marker.getElement().style.display = visible ? '' : 'none'
          marker.getElement().classList.toggle('is-close-view', zoom >= 15)
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
      window.cancelAnimationFrame(riderFrame)
      window.cancelAnimationFrame(frame)
      map.off('zoom', updateVisibility)
      map.off('move', updateVisibility)
      map.off('idle', updateVisibility)
      peopleMarkersRef.current.forEach(marker => marker.remove())
      treeMarkersRef.current.forEach(marker => marker.remove())
      foodGuideMarkersRef.current.forEach(marker => marker.remove())
      conditionMarkersRef.current.forEach(marker => marker.remove())
      peopleMarkersRef.current = []
      treeMarkersRef.current = []
      foodGuideMarkersRef.current = []
      conditionMarkersRef.current = []
    }
  }, [is3DView, linePoints, locale, onFoodGuideOpen, routeConditions, routePath, season, showCourse, showRiders, showRoadInfo, status])

  useEffect(() => {
    const map = mapRef.current
    if (!map || status !== 'ready') return
    userMarkerRef.current?.remove()
    userMarkerRef.current = null
    if (!userLocation) return
    const element = document.createElement('div')
    element.className = 'tour-user-location-marker'
    element.style.setProperty('--tour-user-heading', `${userLocation.heading ?? 0}deg`)
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
    const icon = document.createElement('span')
    icon.textContent = '🚲'
    const count = document.createElement('b')
    count.textContent = pickupStation.available === null ? '—' : String(pickupStation.available)
    element.append(icon, count)
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
    if (locationFocusRequest === 0 && selectedStop === null) return
    if (accessPath && accessPath.length >= 2) {
      const bounds = new maplibregl.LngLatBounds()
      ;(selectedStop === null ? [...linePoints, ...accessPath, ...(walkPath ?? [])] : [...accessPath, ...(walkPath ?? [])]).forEach(point => bounds.extend(point))
      map.fitBounds(bounds, { padding: { top: 72, right: 72, bottom: 72, left: 72 }, maxZoom: 16.2, pitch: isFlatMap ? 0 : 66, duration: 480 })
      return
    }
    if (selectedStop !== null) {
      const point = points[selectedStop]
      map.flyTo({ center: [point.lng, point.lat], zoom: 17.1, pitch: isFlatMap ? 0 : 68, bearing: isFlatMap ? 0 : -12, duration: 1100, essential: false })
      return
    }
    const bounds = new maplibregl.LngLatBounds()
    linePoints.forEach(point => bounds.extend(point))
    map.fitBounds(bounds, { padding: { top: 48, right: 52, bottom: 48, left: 52 }, maxZoom: 15, pitch: isFlatMap ? 0 : 66, bearing: isFlatMap ? 0 : -6, duration: 480 })
  }, [accessPath, isFlatMap, linePoints, locationFocusRequest, points, selectedStop, status, userLocation, walkPath])

  useEffect(() => {
    const map = mapRef.current
    if (!map || status !== 'ready' || locationFocusRequest === 0 || locationFocusRequest === lastLocationFocusRequestRef.current || !userLocation) return
    lastLocationFocusRequestRef.current = locationFocusRequest
    const destination = points[selectedStop ?? points.length - 1]
    const bounds = new maplibregl.LngLatBounds([userLocation.lng, userLocation.lat], [destination.lng, destination.lat])
    ;[...(walkPath ?? []), ...(accessPath ?? [])].forEach(point => bounds.extend(point))
    map.fitBounds(bounds, {
      padding: { top: 88, right: 88, bottom: 88, left: 88 },
      maxZoom: 16,
      pitch: is3DView ? 66 : 0,
      bearing: is3DView ? bearingToDestination(userLocation, destination) : 0,
      duration: 720,
      essential: false,
    })
  }, [accessPath, is3DView, locationFocusRequest, points, selectedStop, status, userLocation, walkPath])

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
    if (rotationRequest.direction === 'up' || rotationRequest.direction === 'down') {
      if (is3DView) {
      const pitch = Math.max(0, Math.min(85, map.getPitch() + (rotationRequest.direction === 'up' ? 15 : -15)))
        map.easeTo({ pitch, duration: 420 })
      } else {
        map.panBy([0, rotationRequest.direction === 'up' ? -120 : 120], { duration: 350 })
      }
      return
    }
    const turn = rotationRequest.direction === 'left' ? -32 : 32
    const bearing = ((map.getBearing() + turn) % 360 + 360) % 360
    map.rotateTo(bearing, { duration: 420 })
  }, [is3DView, rotationRequest, status])

  useEffect(() => {
    const map = mapRef.current
    if (!map || status !== 'ready' || !map.getLayer('tour-imagery')) return
    map.setLayoutProperty('tour-imagery', 'visibility', showSatellite ? 'visible' : 'none')
    map.getStyle().layers.forEach(layer => {
      const sourceLayer = 'source-layer' in layer ? layer['source-layer'] : undefined
      if (layer.id === 'background' || layer.id === 'natural_earth' || (layer.type === 'fill' && SATELLITE_SURFACES.has(sourceLayer ?? ''))) {
        map.setLayoutProperty(layer.id, 'visibility', showSatellite ? 'none' : 'visible')
      }
    })
  }, [showSatellite, status])

  if (status === 'error') return <>
    <p className="tour-earth-notice" role="status">{locale === 'ko'
      ? '3D 지도 타일을 불러오지 못해 기본 코스 지도를 표시합니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요.'
      : 'The 3D map could not load, so the basic route map is shown. Check your connection and try again.'}</p>
    <div className="tour-map-error-fallback">{fallback}</div>
  </>

  const mapModeLabel = viewMode === 'city' ? (locale === 'ko' ? '위성 3D 지도' : '3D aerial map')
    : viewMode === 'satellite' ? (locale === 'ko' ? '2D 위성 지도' : '2D satellite map')
      : (locale === 'ko' ? '평면 지도' : 'Flat map')

  return <div className={`tour-maplibre-3d tour-scene-${season}${isFlatMap ? ' tour-maplibre-2d' : ''}${viewMode === 'satellite' ? ' tour-maplibre-satellite' : ''}`}>
    {status === 'loading' && <div className="tour-maplibre-fallback">{fallback}</div>}
    <div className="tour-maplibre-host" ref={host} style={{ visibility: status === 'loading' ? 'hidden' : 'visible' }} role="region" aria-label={`${locale === 'ko' ? route.titleKo : route.title} ${mapModeLabel}`} />
    {is3DView && nightSky && <div className={`tour-sky-stars tour-sky-stars--${season}`} aria-hidden="true"><i /></div>}
    {!isFlatMap && <button className="tour-map-style-toggle" type="button" aria-label={locale === 'ko' ? '위성 사진 배경 전환' : 'Toggle satellite imagery'} aria-pressed={satellite} onClick={() => setSatellite(value => !value)}>
      {locale === 'ko' ? '위성 사진' : 'Satellite'}
    </button>}
    {status === 'loading' && <p className="google-route-loading" role="status">{locale === 'ko'
      ? viewMode === 'city' ? '도시 3D 지도를 불러오는 중…' : viewMode === 'satellite' ? '2D 위성 지도를 불러오는 중…' : '평면 지도를 불러오는 중…'
      : viewMode === 'city' ? 'Loading the 3D city map…' : viewMode === 'satellite' ? 'Loading the 2D satellite map…' : 'Loading the flat map…'}</p>}
  </div>
}

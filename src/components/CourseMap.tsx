import { Fragment, memo, useEffect, useMemo, useRef, useState } from 'react'
import { divIcon, latLngBounds, type FitBoundsOptions, type LatLngExpression } from 'leaflet'
import { CircleMarker, GeoJSON, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import type { BikeStation, DistrictCourse, GeoPoint } from '../types/game'
import { getGeoPosition, getGeoRouteSlice } from '../utils/geoRoutePosition'
import type { StationDataStatus } from '../hooks/useBikeStations'
import { BIKE_IMAGE_PATH } from './BikeMarker'
import { districtFeatureMap, getFeatureCoordinates, type Coordinate, type DistrictGeoFeature } from '../data/districtGeoData'
import type { SeoulDistrict } from '../data/districtCourses'

interface CourseMapProps {
  course: DistrictCourse
  stationIndex: number
  segmentProgress: number
  isWrong: boolean
  errorPulse: number
  arrivalPulse: number
  dataStatus: StationDataStatus
  lightMode: boolean
  allDistrictStations: BikeStation[]
  playedStationIds: readonly string[]
}

const geoPoints = (course: DistrictCourse, index: number): GeoPoint[] => {
  const start = course.stations[index]
  const end = course.stations[index + 1]
  if (!end) return [{ lat: start.lat, lng: start.lng }]
  return [{ lat: start.lat, lng: start.lng }, ...(start.geoRouteToNext ?? []), { lat: end.lat, lng: end.lng }]
}

const toLatLngs = (points: GeoPoint[]): LatLngExpression[] => points.map(({ lat, lng }) => [lat, lng])

function expandDistrictFeature(feature: DistrictGeoFeature, scale = 1.1): DistrictGeoFeature {
  const coordinates = getFeatureCoordinates(feature)
  const centerLng = coordinates.reduce((sum, point) => sum + point[0], 0) / coordinates.length
  const centerLat = coordinates.reduce((sum, point) => sum + point[1], 0) / coordinates.length
  const expandRing = (ring: Coordinate[]) => ring.map(([lng, lat]) => [
    centerLng + (lng - centerLng) * scale,
    centerLat + (lat - centerLat) * scale,
  ] as Coordinate)

  if (feature.geometry.type === 'Polygon') {
    return {
      ...feature,
      geometry: { type: 'Polygon', coordinates: (feature.geometry.coordinates as Coordinate[][]).map(expandRing) },
    }
  }
  return {
    ...feature,
    geometry: { type: 'MultiPolygon', coordinates: (feature.geometry.coordinates as Coordinate[][][]).map((polygon) => polygon.map(expandRing)) },
  }
}

function FollowCourse({ course, stationIndex }: { course: DistrictCourse; stationIndex: number }) {
  const map = useMap()
  const courseZoomRef = useRef<number | null>(null)
  useEffect(() => {
    const visibleStations = course.stations.slice(stationIndex, Math.min(course.stations.length, stationIndex + 2))
    const bounds = latLngBounds(visibleStations.map((station) => [station.lat, station.lng]))
    map.invalidateSize({ animate: false })
    const options: FitBoundsOptions = {
      paddingTopLeft: [120, 145],
      paddingBottomRight: [120, 235],
      maxZoom: 16.75,
      animate: false,
    }
    if (stationIndex === 0 || courseZoomRef.current === null) {
      map.fitBounds(bounds, options)
      courseZoomRef.current = map.getZoom()
      return
    }
    map.flyTo(bounds.getCenter(), courseZoomRef.current, { animate: true, duration: .65 })
  }, [course, map, stationIndex])
  return null
}

function ZoomObserver({ onZoomChange }: { onZoomChange: (zoom: number) => void }) {
  const map = useMapEvents({
    zoomstart: () => map.getContainer().classList.add('map-is-zooming'),
    zoomend: () => {
      map.getContainer().classList.remove('map-is-zooming')
      onZoomChange(map.getZoom())
    },
  })
  useEffect(() => {
    onZoomChange(map.getZoom())
    return () => map.getContainer().classList.remove('map-is-zooming')
  }, [map, onZoomChange])
  return null
}

const DistrictBaseLayer = memo(function DistrictBaseLayer({ feature, lightMode }: { feature: DistrictGeoFeature; lightMode: boolean }) {
  const expandedFeature = useMemo(() => expandDistrictFeature(feature), [feature])
  return <>
    <GeoJSON data={expandedFeature as never} interactive={false}
      style={{ color: lightMode ? '#fff4dc' : '#020e12', weight: 8, opacity: .72, fillColor: lightMode ? '#4d63a8' : '#0d5260', fillOpacity: lightMode ? .08 : .22 }} />
    <GeoJSON data={expandedFeature as never} interactive={false}
      style={{ color: lightMode ? '#e66a00' : '#ffb547', weight: 3.2, opacity: 1, dashArray: '9 7', fillColor: lightMode ? '#4d63a8' : '#0d5260', fillOpacity: lightMode ? .06 : .12 }} />
  </>
})

const statusText: Record<StationDataStatus, string> = {
  snapshot: '서울시 공식 데이터 · 2026.06',
  loading: '서울시 API 연결 중…',
  live: '서울시 API 최신 데이터',
  fallback: 'API 연결 실패 · 공식 스냅샷',
}

export function CourseMap({ course, stationIndex, segmentProgress, isWrong, errorPulse, arrivalPulse, dataStatus, lightMode, allDistrictStations, playedStationIds }: CourseMapProps) {
  const [mapZoom, setMapZoom] = useState(13)
  const current = course.stations[stationIndex]
  const districtFeature = districtFeatureMap[course.district as SeoulDistrict]
  const next = course.stations[stationIndex + 1]
  const currentPath = geoPoints(course, stationIndex)
  const position = getGeoPosition(currentPath, segmentProgress)
  const facing = !next || next.lng >= current.lng ? 1 : -1
  const courseStationIds = useMemo(() => new Set(course.stations.map((station) => station.id)), [course.stations])
  const playedIds = useMemo(() => new Set(playedStationIds), [playedStationIds])
  const backgroundStations = useMemo(
    () => allDistrictStations.filter((station) => !courseStationIds.has(station.id)),
    [allDistrictStations, courseStationIds],
  )
  const bikeIcon = useMemo(() => divIcon({
    className: `bike-map-marker ${isWrong ? 'bike-map-marker--wrong' : ''} ${arrivalPulse > 0 && segmentProgress === 0 ? 'bike-map-marker--arriving' : ''}`,
    html: `<span class="bike-map-halo"><img src="${BIKE_IMAGE_PATH}" alt="" style="transform:scaleX(${facing})" /></span>`,
    iconSize: [48, 48],
    // 자전거는 좌표 위쪽, 대여소명은 아래쪽에 두어 서로 가리지 않는다.
    iconAnchor: [24, 43],
  }), [arrivalPulse, errorPulse, facing, isWrong, segmentProgress])

  return <section className="course-map-card course-map-card--real" aria-label="실제 따릉이 대여소 지도">
    <div className="map-caption map-caption--overlay">
      <span className={`data-status data-status--${dataStatus}`}>{statusText[dataStatus]}</span>
      <span><i className="legend-dot legend-dot--boundary" />코스 구역</span>
      <span><i className="legend-dot legend-dot--next-course" />다음 코스</span>
      <span><i className="legend-dot legend-dot--played" />플레이 완료</span>
      <span><i className="legend-dot legend-dot--route" />남은 코스</span>
      <span><i className="legend-dot legend-dot--done" />통과</span>
      <span><i className="legend-dot legend-dot--active" />이동 중</span>
    </div>
    <MapContainer className={`leaflet-course-map ${mapZoom <= 12.5 ? 'map-zoom--far' : mapZoom <= 14 ? 'map-zoom--medium' : 'map-zoom--near'}`} center={[current.lat, current.lng]} zoom={13} zoomSnap={.25} preferCanvas
      dragging touchZoom doubleClickZoom scrollWheelZoom
      boxZoom keyboard zoomControl={false}>
      <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' />
      <FollowCourse course={course} stationIndex={stationIndex} />
      <ZoomObserver onZoomChange={setMapZoom} />
      <DistrictBaseLayer feature={districtFeature} lightMode={lightMode} />
      {backgroundStations.map((station) => {
        const played = playedIds.has(station.id)
        return <CircleMarker key={`background-${station.id}`} center={[station.lat, station.lng]} radius={played ? 3.5 : 3}
          interactive={false} pathOptions={{
            color: played ? (lightMode ? '#527f77' : '#6a9f98') : (lightMode ? '#c86b00' : '#ffb547'),
            fillColor: played ? (lightMode ? '#9abbb4' : '#446b68') : 'transparent',
            fillOpacity: played ? .72 : 0,
            opacity: .82,
            weight: played ? 1.5 : 2,
          }} />
      })}
      {course.stations.slice(0, -1).map((station, index) => {
        const points = geoPoints(course, index)
        const passed = index < stationIndex
        const active = index === stationIndex
        return <Fragment key={`route-${station.id}`}>
          <Polyline positions={toLatLngs(points)} pathOptions={{ color: lightMode ? '#5946c9' : '#39c8ff', weight: 6, opacity: .92, lineCap: 'round', lineJoin: 'round' }} />
          {passed && <Polyline positions={toLatLngs(points)} pathOptions={{ color: lightMode ? '#00a982' : '#54ffb2', weight: 7, lineCap: 'round', lineJoin: 'round' }} />}
          {active && <Polyline positions={toLatLngs(getGeoRouteSlice(points, segmentProgress))} pathOptions={{ color: lightMode ? '#ffce35' : '#f0ff54', weight: 9, lineCap: 'round', lineJoin: 'round' }} />}
        </Fragment>
      })}

      {course.stations.map((station, index) => {
        const active = index === stationIndex
        const passed = index < stationIndex
        const labelStep = mapZoom <= 12.5 ? 6 : mapZoom <= 14 ? 3 : 1
        const showLabel = active || index === 0 || index === course.stations.length - 1 || index % labelStep === 0
        return <CircleMarker key={`course-${station.id}`} center={[station.lat, station.lng]} radius={active ? 8 : 6}
          pathOptions={{
            color: active ? (lightMode ? '#9b7500' : '#f0ff54') : (lightMode ? '#fff' : '#d7f5ff'),
            fillColor: passed ? (lightMode ? '#00a982' : '#54ffb2') : active ? (lightMode ? '#ffce35' : '#203c49') : (lightMode ? '#5946c9' : '#238ab0'),
            fillOpacity: 1,
            weight: 3,
          }}>
          {showLabel && <Tooltip permanent direction={active ? 'bottom' : index % 2 === 0 ? 'left' : 'right'}
              offset={active ? [0, 12] : index % 2 === 0 ? [-8, 0] : [8, 0]}
              className={`route-station-name ${active ? 'route-station-name--active' : ''}`}>
              {station.typingName ?? station.name}
            </Tooltip>}
        </CircleMarker>
      })}

      <Marker key={`bike-${errorPulse}-${arrivalPulse}`} position={[position.lat, position.lng]} icon={bikeIcon} zIndexOffset={1000} />
    </MapContainer>
  </section>
}

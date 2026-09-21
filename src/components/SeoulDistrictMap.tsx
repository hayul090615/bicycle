import { seoulDistrictGeoData } from '../data/districtGeoData'
import { hanRiverPolygons } from '../data/hanRiverGeometry'
import { districtDifficultyMap, type SeoulDistrict } from '../data/districtCourses'
import { featureToSvgPath, getFeatureLabelPoint, projectCoordinate, SEOUL_MAP_VIEWBOX } from '../utils/districtSvg'

interface SeoulDistrictMapProps {
  selected: SeoulDistrict | null
  onSelect: (district: SeoulDistrict) => void
  playedStationCounts: Partial<Record<SeoulDistrict, number>>
}

const riverPolygonToSvgPath = (rings: (readonly [number, number])[][]) => rings.map((ring) => ring.map((coordinate, index) => {
  const [x, y] = projectCoordinate(coordinate as [number, number])
  return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
}).join(' ') + ' Z').join(' ')

export function SeoulDistrictMap({ selected, onSelect, playedStationCounts }: SeoulDistrictMapProps) {
  return <div className="seoul-map-wrap">
    <svg className="seoul-district-map" viewBox={SEOUL_MAP_VIEWBOX} role="img" aria-label="서울 25개 자치구 선택 지도">
      <defs>
        <clipPath id="seoul-river-clip" clipPathUnits="userSpaceOnUse">
          {seoulDistrictGeoData.features.map((feature) => <path key={`clip-${feature.properties.name}`} d={featureToSvgPath(feature)} />)}
        </clipPath>
      </defs>
      {seoulDistrictGeoData.features.map((feature) => {
        const district = feature.properties.name
        const isSelected = selected === district
        return <g key={district} className={`seoul-district ${isSelected ? 'seoul-district--selected' : ''}`}>
          <path d={featureToSvgPath(feature)} tabIndex={0} role="button" aria-label={`${district} 코스 선택`}
            aria-pressed={isSelected} onClick={() => onSelect(district)}
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(district) } }} />
        </g>
      })}
      <g clipPath="url(#seoul-river-clip)">
        {hanRiverPolygons.map((polygon, index) => <path key={`han-river-${index}`} className="han-river-area"
          d={riverPolygonToSvgPath(polygon.slice(0, 1))} />)}
      </g>
      <g className="seoul-district-boundaries" aria-hidden="true">
        {seoulDistrictGeoData.features.map((feature) => <path key={`boundary-${feature.properties.name}`} d={featureToSvgPath(feature)} />)}
      </g>
      {seoulDistrictGeoData.features.map((feature) => {
        const district = feature.properties.name
        const [labelX, labelY] = getFeatureLabelPoint(feature)
        const isSelected = selected === district
        const difficulty = districtDifficultyMap[district]
        const playedCount = playedStationCounts[district] ?? 0
        return <g key={`label-${district}`} className={`seoul-district-label ${isSelected ? 'seoul-district-label--selected' : ''}`} aria-hidden="true">
          <text x={labelX} y={labelY} textAnchor="middle">{district}</text>
          <g className={`district-difficulty district-difficulty--${difficulty === '쉬움' ? 'easy' : difficulty === '보통' ? 'normal' : 'hard'}`}>
            <rect x={labelX - 14} y={labelY + 4} width="28" height="11" rx="5.5" />
            <text x={labelX} y={labelY + 12} textAnchor="middle">{difficulty}</text>
          </g>
          {playedCount > 0 && <g className="district-played-marker">
            <circle cx={labelX + 18} cy={labelY + 9.5} r="5.2" />
            <text x={labelX + 18} y={labelY + 11.5} textAnchor="middle">✓</text>
          </g>}
        </g>
      })}
    </svg>
    <p className="map-help"><span>●</span> 지도에서 자치구를 선택하세요 <small>한강 수면 © OpenStreetMap contributors</small></p>
  </div>
}

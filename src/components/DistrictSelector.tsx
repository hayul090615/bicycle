import { allBikeStations, districtCourses, SEOUL_DISTRICTS, type SeoulDistrict } from '../data/districtCourses'
import { SeoulDistrictMap } from './SeoulDistrictMap'
import { BIKE_IMAGE_PATH } from './BikeMarker'
import { TextPractice } from './TextPractice'
import { useEffect, useState } from 'react'
import { SiteDialog, type SiteDialogKind } from './SiteDialog'
import { siteAuth } from '../services/siteAuth'

interface DistrictSelectorProps {
  selected: SeoulDistrict | null
  onSelect: (district: SeoulDistrict) => void
  onStart: () => void
  onOpenTextPractice: () => void
  onOpenTours: () => void
  highScore: number
  playedStations: Partial<Record<SeoulDistrict, string[]>>
}

export function DistrictSelector({ selected, onSelect, onStart, onOpenTextPractice, onOpenTours, highScore, playedStations }: DistrictSelectorProps) {
  const [activeTab, setActiveTab] = useState('타자 연습')
  const [dialog, setDialog] = useState<SiteDialogKind | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  useEffect(() => {
    if (!siteAuth) return
    let active = true
    void siteAuth.auth.getSession().then(({ data }) => { if (active) setUserEmail(data.session?.user.email ?? null) })
    const { data: { subscription } } = siteAuth.auth.onAuthStateChange((_event, session) => setUserEmail(session?.user.email ?? null))
    return () => { active = false; subscription.unsubscribe() }
  }, [])
  const course = selected ? districtCourses[selected] : undefined
  const stationCount = selected ? allBikeStations.filter((station) => station.district === selected).length : 0
  const playedCount = selected ? (playedStations[selected]?.length ?? 0) : 0
  const playedStationCounts = Object.fromEntries(
    Object.entries(playedStations).map(([district, ids]) => [district, ids?.length ?? 0]),
  ) as Partial<Record<SeoulDistrict, number>>
  const mainTabs = ['타자 연습', '타자 학습', '필사']
  const selectMainTab = (tab: string) => {
    setActiveTab(tab)
    if (tab === '타자 연습') return
    if (tab === '필사') { onOpenTextPractice(); return }
    setDialog('learn')
  }

  return <main className="start-screen start-screen--map">
    <div className="city-bike-backdrop" aria-hidden="true">
      <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
        <path className="city-road city-road--left" d="M-90 850 C120 760 42 610 215 500 C345 417 208 278 350 -55" />
        <path className="city-route city-route--left" d="M-90 850 C120 760 42 610 215 500 C345 417 208 278 350 -55" />
        <path className="city-road city-road--right" d="M1690 780 C1465 720 1575 570 1395 470 C1268 398 1408 220 1270 -55" />
        <path className="city-route city-route--right" d="M1690 780 C1465 720 1575 570 1395 470 C1268 398 1408 220 1270 -55" />

        <g className="city-cloud city-cloud--one">
          <ellipse cx="105" cy="125" rx="58" ry="22" /><circle cx="78" cy="113" r="25" /><circle cx="119" cy="105" r="34" /><circle cx="153" cy="121" r="23" />
        </g>
        <g className="city-cloud city-cloud--two city-decoration--secondary">
          <ellipse cx="1480" cy="155" rx="64" ry="23" /><circle cx="1447" cy="143" r="25" /><circle cx="1490" cy="131" r="36" /><circle cx="1528" cy="151" r="22" />
        </g>

        <g className="city-tree city-tree--left">
          <path d="M105 690v82" /><circle cx="105" cy="655" r="44" /><circle cx="72" cy="678" r="31" /><circle cx="139" cy="681" r="34" />
        </g>
        <g className="city-tree city-tree--right city-decoration--secondary">
          <path d="M1495 620v94" /><circle cx="1495" cy="580" r="49" /><circle cx="1457" cy="606" r="34" /><circle cx="1534" cy="607" r="36" />
        </g>

        <g className="city-sign city-sign--left city-decoration--secondary">
          <path d="M258 178v126" /><path d="M217 184h84l-13 26 13 26h-84z" />
        </g>
        <g className="city-sign city-sign--right">
          <path d="M1378 690v126" /><path d="M1337 696h84l-13 26 13 26h-84z" />
        </g>

        <g className="city-bike city-bike--left">
          <circle cx="180" cy="430" r="37" /><circle cx="286" cy="430" r="37" />
          <path d="M180 430l44-68 38 68h-82l66-43 40 43m-62-68l-12-25h28m22 50l17-37h24" />
        </g>
        <g className="city-bike city-bike--right city-decoration--secondary">
          <circle cx="1330" cy="330" r="32" /><circle cx="1422" cy="330" r="32" />
          <path d="M1330 330l39-59 32 59h-71l58-38 34 38m-53-59l-10-22h25m17 43l15-32h21" />
        </g>
      </svg>
    </div>
    <header className="start-topbar">
      <div className="start-brand"><span className="brand-bike">🚲</span><div><b>서울 타자 라이딩</b><small>SEOUL TYPING RIDE</small></div></div>
      <nav className="typing-main-nav" aria-label="주 메뉴">
        {mainTabs.map((tab) => <button key={tab} type="button" className={activeTab === tab ? 'is-active' : ''} aria-current={activeTab === tab ? 'page' : undefined} onClick={() => selectMainTab(tab)}>{tab}</button>)}
      </nav>
      <div className="start-top-actions">
        <div className="typing-account-actions">
          {userEmail && <span className="typing-account-email">{userEmail}</span>}
          {!userEmail && <button type="button" onClick={() => setDialog('login')}>로그인</button>}
          {!userEmail && <button type="button" onClick={() => setDialog('signup')}>회원가입</button>}
          <button type="button" onClick={() => setDialog('logout')}>로그아웃</button>
        </div>
        <div className="start-record"><button type="button" className="start-tour-button" onClick={onOpenTours}>English city rides ↗</button><span>나의 최고 점수</span><strong>{highScore.toLocaleString()}</strong></div>
      </div>
    </header>

    <section className="start-map-layout">
      <div className="district-map-panel">
        <div className="district-map-heading">
          <div><span className="step-number">01</span><h2>자치구를 선택하세요</h2></div>
          <div className="district-map-tools">
            <span className="difficulty-legend difficulty-legend--easy">쉬움</span>
            <span className="difficulty-legend difficulty-legend--normal">보통</span>
            <span className="difficulty-legend difficulty-legend--hard">어려움</span>
            <button className="random-district-button" onClick={() => onSelect(SEOUL_DISTRICTS[Math.floor(Math.random() * SEOUL_DISTRICTS.length)])}>↻ 랜덤 선택</button>
          </div>
        </div>
        <div className="start-bike-decor" aria-hidden="true">
          <img src={BIKE_IMAGE_PATH} alt="" />
          <div>
            <b>{selected ? `${selected} 1·2·3차 코스` : '자치구별 1·2·3차 코스'}</b>
            <small>{selected && course ? `1차 ${course.stations.length}곳 · 완주 후 2·3차` : '대여소를 세 코스로 나눠 달려요'}</small>
          </div>
        </div>
        <SeoulDistrictMap selected={selected} onSelect={onSelect} playedStationCounts={playedStationCounts} />
        <div className={`map-selection-bar ${selected ? 'is-visible' : ''}`} aria-live="polite">
          {selected && course ? <>
            <div><span>선택한 지역</span><strong>{selected}</strong><small>전체 {stationCount}곳 · 플레이한 대여소 {playedCount}곳 · 다음 코스 {course.stations.length}개 지점</small></div>
            <button className="button button--primary" onClick={onStart}>{selected} 코스 시작 <span>→</span></button>
          </> : <p>지도 위 자치구에 마우스를 올리고 선택해 주세요.</p>}
        </div>
      </div>
      <TextPractice district={selected} onDistrictChange={onSelect} embedded />
    </section>
    {dialog && <SiteDialog kind={dialog} userEmail={userEmail} onClose={() => setDialog(null)} onChangeKind={setDialog} />}
  </main>
}

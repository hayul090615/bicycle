import { useEffect, useMemo, useState } from 'react'
import { SEOUL_DISTRICTS, type SeoulDistrict } from '../data/districtCourses'
import { romanizeHangul, toCharacters } from '../utils/hangul'

const TEXT_KEY_PREFIX = 'seoul-district-writing-v1-'

const districtPoems: Record<string, string> = {
  강남구: '유리 빌딩에 저녁빛이 내려앉고\n바쁜 거리 사이로 바람이 지난다\n페달을 밟으며 오늘을 천천히 읽는다.',
  강동구: '강가에 저녁 물결이 반짝이고\n나무 그늘 아래 자전거가 쉰다\n느린 바람이 하루를 데려간다.',
  강북구: '북쪽 산자락에 구름이 걸리고\n골목마다 초록 숨결이 번진다\n한 걸음씩 마음이 가벼워진다.',
  강서구: '넓은 하늘 아래 길이 이어지고\n강바람이 자전거 곁을 스친다\n먼 풍경까지 오늘의 문장이 된다.',
  관악구: '산길의 초록이 창가에 머물고\n오르막 끝에 햇살이 기다린다\n숨 고르며 나만의 속도로 간다.',
  광진구: '강물 위로 다리가 길게 놓이고\n저녁 바람이 물빛을 흔든다\n두 바퀴 따라 풍경이 흐른다.',
  구로구: '오래된 골목과 새 길이 만나\n사람들의 하루가 천천히 쌓인다\n익숙한 길에도 이야기는 새롭다.',
  금천구: '산 아래 작은 길을 따라가면\n하루의 소음이 멀어지고\n저녁 구름이 마음에 내려온다.',
  노원구: '나무 사이로 햇살이 쏟아지고\n산책길에 웃음소리가 번진다\n가벼운 바람을 따라 달린다.',
  도봉구: '도봉산 능선에 구름이 머물고\n돌담길에는 고요가 내려앉는다\n천천히 가도 풍경은 충분하다.',
  동대문구: '오래된 이름과 새로운 발걸음\n시장 골목에 온기가 번지고\n도시의 리듬을 글자로 옮긴다.',
  동작구: '언덕 너머 강물이 빛나고\n저녁노을이 다리 위에 머문다\n한 박자 쉬어 다시 출발한다.',
  마포구: '강바람 실은 노래가 골목을 돌고\n불빛 아래 하루가 깨어난다\n리듬을 따라 글자를 이어 쓴다.',
  서대문구: '낮은 담장 위로 잎이 흔들리고\n오래된 길에 햇살이 번진다\n걸음마다 새로운 문장이 열린다.',
  서초구: '나무 그늘 길게 드리운 길\n바람은 한강 쪽으로 흘러가고\n마음도 그 흐름에 몸을 맡긴다.',
  성동구: '강과 숲 사이로 길이 이어져\n도시의 빛과 초록이 나란하다\n오늘의 풍경을 한 줄 적는다.',
  성북구: '언덕 위 골목에 저녁이 오고\n담장 너머 불빛 하나 켜진다\n느린 페달에 하루가 담긴다.',
  송파구: '호수의 물결에 하늘이 비치고\n공원 길에는 발걸음이 모인다\n맑은 바람을 따라 달려간다.',
  양천구: '익숙한 동네 길을 지나\n나무와 햇살이 나란히 걷는다\n작은 순간을 오래 기억한다.',
  영등포구: '강가에 도시의 불빛이 번지고\n다리 아래 물결은 쉬지 않는다\n페달 소리로 밤을 건넌다.',
  용산구: '언덕에서 강을 바라보면\n서로 다른 풍경이 한눈에 모인다\n지나온 길도 한 편의 시가 된다.',
  은평구: '산자락 바람이 골목을 돌아\n초록빛 하루가 창문에 머문다\n천천히 두드리며 길을 나선다.',
  종로구: '오래된 지붕 위로 햇빛이 번지고\n돌길에는 많은 시간이 흐른다\n한 글자씩 오늘을 기록한다.',
  중구: '높은 빌딩 사이 좁은 골목에도\n저마다의 하루가 켜져 있고\n밤길은 조용히 다음 장을 연다.',
  중랑구: '천을 따라 바람이 흘러가고\n산책길에는 초록이 이어진다\n물소리에 맞춰 마음을 적는다.',
}

function starterText(district: string) {
  return districtPoems[district] ?? `바람이 머무는 ${district}\n오늘의 길 위에 나만의 이야기를 씁니다.\n천천히 두드린 글자마다 새로운 풍경이 열립니다.`
}

function readText(district: string) {
  try { return localStorage.getItem(`${TEXT_KEY_PREFIX}${district}`) ?? starterText(district) }
  catch { return starterText(district) }
}

export function TextPractice({ district: initialDistrict, onDistrictChange, onBack }: { district: SeoulDistrict | null; onDistrictChange: (district: SeoulDistrict) => void; onBack: () => void }) {
  const [district, setDistrict] = useState<SeoulDistrict>(initialDistrict ?? SEOUL_DISTRICTS[0])
  const key = `${TEXT_KEY_PREFIX}${district}`
  const [target, setTarget] = useState(() => readText(initialDistrict ?? SEOUL_DISTRICTS[0]))
  const [typed, setTyped] = useState('')
  useEffect(() => {
    try { localStorage.setItem(key, target) } catch { /* local saving is optional */ }
  }, [key, target])

  const targetCharacters = useMemo(() => toCharacters(target), [target])
  const typedCharacters = toCharacters(typed)
  let validPrefix = 0
  while (validPrefix < typedCharacters.length && validPrefix < targetCharacters.length && typedCharacters[validPrefix] === targetCharacters[validPrefix]) validPrefix += 1
  const isComplete = targetCharacters.length > 0 && validPrefix === targetCharacters.length
  const accuracy = typedCharacters.length === 0 ? 100 : Math.round(
    typedCharacters.reduce((sum, character, index) => sum + Number(character === targetCharacters[index]), 0) / typedCharacters.length * 100,
  )

  return <main className="text-practice-screen">
    <header className="text-practice-topbar">
      <div className="start-brand"><span className="brand-bike">🚲</span><div><b>서울 타자 라이딩</b><small>SEOUL TYPING RIDE</small></div></div>
      <button className="button button--ghost" onClick={onBack}>← 자치구 선택</button>
    </header>
    <section className="text-practice-content">
      <div className="text-practice-heading"><label className="text-practice-label" htmlFor="practice-district">연습할 자치구</label>
        <select id="practice-district" className="text-practice-district" value={district} onChange={(event) => {
          const nextDistrict = event.target.value as SeoulDistrict
          setDistrict(nextDistrict); onDistrictChange(nextDistrict); setTarget(readText(nextDistrict)); setTyped('')
        }}>{SEOUL_DISTRICTS.map((name) => <option key={name} value={name}>{name}</option>)}</select>
        <h1>이 구의 시로 타자 연습</h1><p>구마다 다른 글감이 준비되어 있어요. 직접 쓴 시도 구별로 저장됩니다.</p></div>
      <label className="text-practice-label" htmlFor="practice-prompt">연습할 글감</label>
      <textarea id="practice-prompt" className="text-practice-prompt" value={target} maxLength={1200}
        onChange={(event) => { setTarget(event.target.value); setTyped('') }} spellCheck={false} />
      <div className="text-practice-stats"><span>{targetCharacters.length}자</span><span>정확도 {accuracy}%</span><span>{Math.round(validPrefix / Math.max(targetCharacters.length, 1) * 100)}% 완료</span></div>
      <div className={`text-practice-target ${isComplete ? 'is-complete' : ''}`} aria-label="따라 입력할 문장">
        {targetCharacters.map((character, index) => <span key={index} className={index < validPrefix ? 'is-matched' : index < typedCharacters.length ? 'is-mismatch' : ''}>{character}</span>)}
      </div>
      <label className="text-practice-label" htmlFor="practice-input">여기에 입력하세요</label>
      <textarea id="practice-input" className="text-practice-input" value={typed} onChange={(event) => setTyped(event.target.value)}
        placeholder="위 글감을 보고 그대로 입력해 보세요." spellCheck={false} autoCapitalize="off" autoCorrect="off" />
      <div className="text-practice-footer"><span>{romanizeHangul(target.slice(0, validPrefix))}</span><button className="button button--ghost" onClick={() => setTyped('')}>다시 시작</button></div>
      {isComplete && <p className="text-practice-complete" role="status">완료했어요! 다른 문장을 써서 계속 연습할 수 있습니다.</p>}
    </section>
  </main>
}

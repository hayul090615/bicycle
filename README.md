https://seoul-ttareungi-typing.vercel.app
# 서울 타자 라이딩

서울의 따릉이 코스를 달리며 다음 대여소 이름을 입력하는 반응형 한글 타자 웹게임입니다.

영어 관광 안내는 시작 화면의 **English city rides** 버튼 또는 `/?lang=en`에서 열립니다. 상단 언어 버튼으로 한국어와 영어를 전환할 수 있습니다. 관광·운동·야경·봄·여름·가을·겨울 코스에 공식 따릉이 대여소를 연결했습니다. 날짜·서울 현지 시간을 바꾸면 [NOAA 태양 위치 계산식](https://gml.noaa.gov/grad/solcalc/solareqns.PDF)에 따른 그림자 방향과 1m 물체의 예상 그림자 길이가 바뀝니다. 건물·나무·날씨에 따른 실제 그늘은 계산하지 않습니다. 코스 지도 선은 대여소를 잇는 참고 표시이며 주행 경로 안내가 아닙니다. CCTV와 자전거 전용차로 단속 정보는 [서울 TOPIS CCTV 지도](https://topis.seoul.go.kr/map/openCctvMap.do)와 [서울시 공개 단속 현황](https://news.seoul.go.kr/traffic/archives/35252)으로 연결됩니다.

서울 열린데이터광장의 **2026년 6월 공식 따릉이 대여소 정보**로 서울 25개 자치구 코스를 모두 플레이할 수 있습니다. 시작 화면의 서울 행정구역 지도에서 구 경계를 직접 선택하며, 게임 지도에는 선택한 구의 대여소만 표시됩니다.

## 주요 기능

- 서울 25개 자치구 선택 및 준비 상태 표시
- 서울 25개 구별 실제 따릉이 대여소 코스
- 클릭 가능한 서울 자치구 경계 SVG 지도
- Leaflet + OpenStreetMap 실제 지도
- 서울 열린데이터광장 API 및 공식 데이터 스냅샷
- 시작 전 3초 카운트다운과 180초 제한 시간
- 완성된 한글 음절 단위 자전거 이동
- 정확한 목표 앞부분과 일치할 때만 전진
- 백스페이스 입력에 따른 이전 위치 복귀
- 한글 IME 조합 및 Enter 중복 입력 대응
- 꺾인 폴리라인을 따라 움직이는 자전거 위치 계산
- 점수, 정확도, 콤보, 진행률 및 분당 타수 집계
- 일시 정지와 입력 포커스 자동 복원
- 완주 및 시간 종료 결과 화면
- 브라우저 `localStorage` 최고 점수 저장
- 모바일·태블릿·데스크톱 반응형 화면
- 키보드 포커스와 `prefers-reduced-motion` 접근성 지원

## 기술 구성

- Vite
- React
- TypeScript
- CSS
- Leaflet, React-Leaflet, OpenStreetMap 지도 타일
- 서울시 `tbCycleStationInfo` Open API

## 시작하기

Node.js와 npm이 설치되어 있어야 합니다.

```bash
npm install
npm run dev
```

개발 서버가 출력하는 주소로 접속합니다. 기본 주소는 다음과 같습니다.

```text
http://localhost:5173
```

Windows PowerShell의 실행 정책 때문에 `npm.ps1` 실행이 차단되는 환경에서는 다음 명령을 사용합니다.

```powershell
npm.cmd install
npm.cmd run dev
```

## 프로덕션 빌드

```bash
npm run build
npm run preview
```

빌드 결과물은 `dist/`에 생성됩니다.

## 서울시 대여소 API 연결

프로젝트에는 2026년 6월 공식 파일에서 추출한 서울 대여소 2,789곳의 스냅샷이 포함되어 있어 API 키가 없어도 실제 대여소가 표시됩니다. 실행할 때 최신 API 데이터로 갱신하려면 `.env.example`을 복사해 `.env.local`을 만들고 서울 열린데이터광장에서 발급받은 키를 입력합니다.

```env
VITE_SEOUL_API_KEY=발급받은_인증키
```

개발 서버를 다시 시작하면 최대 1,000건씩 전체 대여소를 가져온 뒤 현재 선택한 구의 대여소만 지도에 표시합니다. API 호출이 실패하면 포함된 공식 스냅샷으로 자동 복귀합니다.

개발 서버와 Vite 미리보기 서버는 `/seoul-api` 요청을 서울시 API로 프록시합니다. 별도 호스팅 서비스에 배포할 때도 같은 경로를 프록시하도록 구성해야 합니다.

## 게임 방법

1. 서울 지도에서 플레이할 자치구를 선택합니다.
2. `라이딩 시작` 버튼을 누릅니다.
3. 카운트다운이 끝나면 화면에 표시된 다음 대여소 이름을 입력합니다.
4. 정확하게 입력한 완성형 한글 음절 수만큼 자전거가 이동합니다.
5. 오타가 있으면 자전거는 마지막 정상 위치에 머뭅니다.
6. 백스페이스로 맞는 글자를 지우면 해당 글자 수만큼 이전 위치로 돌아갑니다.
7. 마지막 지점까지 도착하거나 제한 시간이 끝나면 결과가 표시됩니다.

## 프로젝트 구조

```text
src/
├─ components/
│  ├─ BikeMarker.tsx
│  ├─ Countdown.tsx
│  ├─ CourseMap.tsx
│  ├─ DistrictSelector.tsx
│  ├─ GameHeader.tsx
│  ├─ GameResult.tsx
│  └─ TypingInput.tsx
├─ data/
│  ├─ districtCourses.ts
│  ├─ districtGeoData.ts
│  ├─ seoulBikeStations.json
│  └─ seoulDistricts.geojson
├─ hooks/
│  ├─ useBikeStations.ts
│  ├─ useGameTimer.ts
│  └─ useTypingGame.ts
├─ services/
│  └─ seoulBikeApi.ts
├─ styles/
│  └─ global.css
├─ types/
│  └─ game.ts
├─ utils/
│  ├─ hangul.ts
│  └─ routePosition.ts
├─ App.tsx
└─ main.tsx
```

## 데이터와 지도 출처

- [서울 열린데이터광장 공공자전거 따릉이 대여소 정보](https://data.seoul.go.kr/dataList/OA-13252/F/1/datasetView.do)
- [OpenStreetMap](https://www.openstreetmap.org/copyright)

OpenStreetMap 지도 타일은 화면에 표시되는 영역만 요청하며, 지도 오른쪽 아래의 저작자 표시를 유지합니다.

## 코스 데이터

코스 데이터는 `src/data/districtCourses.ts`에 있습니다.

```ts
interface Station {
  id: string
  name: string
  typingName?: string
  lat: number
  lng: number
  geoRouteToNext?: { lat: number; lng: number }[]
}

interface DistrictCourse {
  district: string
  title: string
  description: string
  durationSeconds: number
  isSample: boolean
  stations: Station[]
}
```

- `stations`의 첫 항목은 출발점, 마지막 항목은 도착점입니다.
- `lat`, `lng`는 Leaflet 지도에서 사용하는 실제 위도와 경도입니다.
- `typingName`은 긴 공식 대여소명을 게임에서 입력하기 쉽게 만든 별칭입니다.
- `geoRouteToNext`에는 다음 지점까지의 꺾인 경로 경유점을 순서대로 넣을 수 있습니다.

## 구별 코스 구성 변경하기

1. `src/data/districtCourses.ts`에서 원하는 자치구의 대여소 선택 규칙을 변경합니다.
2. API의 대여소 ID와 이름을 `Station.id`, `Station.name`으로 변환합니다.
3. 공식 위도·경도를 `lat`, `lng`에 넣습니다.
4. 자전거 도로 경로가 있다면 각 지점의 `geoRouteToNext` 경유점으로 변환합니다.
5. 공식 데이터 코스의 `isSample`을 `false`로 설정합니다.
6. 기본 구현은 각 구에서 실제 대여소 21곳을 연결해 20개 대여소명을 입력합니다. 은평구는 지정된 첫 6곳 이후 주변 실제 대여소를 이어 붙입니다.

## 이미지 교체

현재 자전거 이미지는 `public/bike.svg`입니다. PNG 이미지로 교체하려면 파일을 `public/bike.png`에 넣고 `src/components/BikeMarker.tsx`의 `BIKE_IMAGE_PATH`를 다음처럼 변경합니다.

```ts
export const BIKE_IMAGE_PATH = '/bike.png'
```

## 최고 점수 저장

최고 점수는 브라우저의 다음 `localStorage` 키에 저장됩니다.

```text
seoul-typing-bike-high-score
```

브라우저 저장 데이터를 삭제하면 최고 점수도 초기화됩니다.

현재 공개 사이트: https://seoul-ttareungi-typing.vercel.app/
GitHub Pages 주소: https://hayul090615.github.io/bicycle/

# 서울 타자 라이딩

서울의 따릉이 코스를 달리며 다음 대여소 이름을 입력하는 반응형 한글 타자 웹게임입니다.

사이트 첫 화면에서 서울 따릉이 관광 지도가 바로 열립니다. 지도 옆에서 **내 위치로 가까운 코스 찾기** 또는 테마별 코스 버튼을 사용할 수 있고, 모바일에서는 지도 아래에 버튼이 배치됩니다. 선택한 코스는 자전거 경로 서비스가 제공하는 길을 선으로 표시하며, 연결이 되지 않으면 경유지 사이를 직선으로 연결합니다. 실제 주행 전에는 표지와 길 상태를 확인하세요. 타자 게임은 관광 화면 오른쪽 위의 **Typing game** 버튼 또는 `/bicycle/?page=typing`에서 열립니다. 관광 화면은 `/bicycle/?lang=en`에서 영어로, `/bicycle/?lang=ko`에서 한국어로 볼 수 있습니다. 관광·운동·야경 코스와 봄·여름·가을·겨울 코스를 공식 따릉이 대여소에 연결했습니다. 계절 코스는 네 가지 풍경 카드로 구분하고, 지도에는 날짜나 시간을 고르는 패널 없이 서울의 현재 태양 위치와 지도 건물 윤곽·높이로 예상 그림자 영역을 표시합니다. 선택한 경로에서 500m 이내에 설치 위치가 공개된 CCTV만 지도에 표시하며, 실시간 영상은 제공하지 않습니다. CCTV와 자전거 전용차로 단속 정보는 [서울 TOPIS CCTV 지도](https://topis.seoul.go.kr/map/openCctvMap.do)와 [서울시 공개 단속 현황](https://news.seoul.go.kr/traffic/archives/35252)으로 연결됩니다.

서울 열린데이터광장의 **2026년 6월 공식 따릉이 대여소 정보**로 서울 25개 자치구 코스를 모두 플레이할 수 있습니다. 시작 화면의 서울 행정구역 지도에서 구 경계를 직접 선택하며, 게임 지도에는 선택한 구의 대여소만 표시됩니다.

## 주요 기능

- 서울 25개 자치구 선택 및 준비 상태 표시
- 서울 25개 구별 실제 따릉이 대여소 코스
- 클릭 가능한 서울 자치구 경계 SVG 지도
- Leaflet + OpenStreetMap 실제 지도
- 2D·3D 관광 지도에 현재 태양 위치와 건물 윤곽·높이로 계산한 그림자 영역 표시
- 봄·여름·가을·겨울 지도 풍경과 계절별 코스 카드
- 현재 위치 기준 가까운 따릉이 대여소, 실시간 잔여 자전거 수, 대여소까지 도보 및 목적지까지 자전거 경로
- 자전거도로, CCTV, 신호등·경사, 음식점 지도 레이어와 접을 수 있는 코스 패널
- 선택한 코스와 현재 위치에서 이어지는 경로 주변 500m 이내 공공 CCTV만 표시
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

## 서울시 따릉이 실시간 대여정보

지도에는 서울 열린데이터광장의 실시간 따릉이 대여정보를 안전한 서버 경로로 요청합니다. Vercel 프로젝트의 **Settings → Environment Variables**에 `SEOUL_BIKE_API_KEY`를 만들고 발급받은 키를 등록한 뒤 Production에 배포하세요. 키 이름에 `VITE_`를 붙이지 마세요. `VITE_` 변수는 브라우저 코드에 포함됩니다. 설정하지 않았거나 API를 사용할 수 없을 때는 대여소 위치 스냅샷을 보여 주고, 잔여 대수는 `—`로 표시합니다.

로컬에서 Vercel API를 함께 실행하려면 `.env.local`에 서버 전용 변수 `SEOUL_BIKE_API_KEY`를 설정하고 `vercel dev`를 사용합니다. 일반 `npm run dev`는 Vercel 서버리스 API 경로를 실행하지 않습니다.

개발 서버를 다시 시작하면 최대 1,000건씩 전체 대여소를 가져온 뒤 현재 선택한 구의 대여소만 지도에 표시합니다. API 호출이 실패하면 포함된 공식 스냅샷으로 자동 복귀합니다.

개발 서버와 Vite 미리보기 서버는 `/seoul-api` 요청을 서울시 API로 프록시합니다. 별도 호스팅 서비스에 배포할 때도 같은 경로를 프록시하도록 구성해야 합니다.

## 로그인 및 회원가입 연결

로그인·회원가입은 Supabase Auth를 사용합니다. Supabase 프로젝트를 만든 뒤 Project URL과 공개 anon/publishable key를 로컬 `.env.local`과 GitHub Actions 설정에 넣어야 활성화됩니다. GitHub 저장소의 **Settings → Secrets and variables → Actions**에서 `VITE_SUPABASE_URL`을 variable로, `VITE_SUPABASE_ANON_KEY`를 secret으로 등록합니다. Service role key는 브라우저에 공개하면 안 되므로 사용하지 않습니다.

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

## 관광 코스와 입체 지도

- **최근 변경 내역 (2026-09-30):** `나무길 보기`를 누르거나 지도 위 나무 표식을 선택하면 해당 코스 구간을 3D로 확대합니다. 위성 사진은 Esri World Imagery가 제공하는 세부 타일 단계(최대 23단계)까지 요청해 확대 시 도로와 주변 모습이 덜 뭉개지도록 했습니다.
- 태블릿과 모바일에서 지도 세로 영역을 넓혀 코스 경로를 더 크게 볼 수 있도록 조정했습니다. 화면 높이에 맞춰 지도 크기가 바뀝니다.
- 현재 선택한 주행 코스와 내 위치에서 목적지까지의 이동 경로는 빨간색으로 표시하고, 자전거도로 레이어는 청록색으로 구분합니다.
- 지도 설정에 계절·나무 구간·건물 그림자 표시·CCTV를 모았습니다. 경로 선은 확대해도 도로와 구분되도록 굵은 빨간색과 밝은 외곽선으로 강조하고, 출발지·도착지·거리·예상 시간을 지도 위쪽에 크게 표시합니다.
- 첫 화면의 지도 옆에서 위치 기반 추천 또는 테마별 코스를 선택하고, 아래에서 출발 전 햇빛·CCTV 정보를 확인합니다. 선택한 코스는 `/bicycle/?lang=en&route=yeouido`처럼 주소에 남습니다.
- 경유지를 선택하면 지도와 **Google Earth에서 보기** 링크가 같은 좌표로 바뀝니다. Google Earth는 새 탭으로 열립니다.
- **Earth용 코스 받기**는 모든 경유지와 연결선을 담은 KML 파일입니다. Google Earth에 파일을 가져와 사용하세요. 연결선은 실제 자전거 길안내가 아닙니다.
- 기본 **위성 3D** 화면은 MapLibre GL, OpenFreeMap/OpenStreetMap의 건물 높이 자료, Esri 항공·위성 사진을 겹쳐 표시합니다. 위성 사진은 제공 서비스의 타일 세부 단계에 맞춰 최대 23단계까지 확대합니다. 실제 사진 해상도는 지역별 항공 촬영 자료에 따라 달라질 수 있습니다. 건물 모양은 실제 촬영 3D 모델이 아니며, 지역별 건물 높이 자료 범위에 따라 달라집니다. 지도 안에서 일반 지도로 바꿀 수 있습니다.
- 선택 사항인 **Google 3D**는 Google Maps JavaScript API를 사용하며, Google Earth 웹 앱을 iframe으로 넣은 것이 아닙니다.
- **카카오 지도**는 2D 기본 지도로 선택할 수 있으며, 한국어 장소 지도 위에 코스·경유지·공공 CCTV를 표시합니다. 건물 그림자와 3D 건물은 위성 3D 보기에서 확인하세요.

카카오 지도를 활성화하려면:

1. 카카오디벨로퍼스에서 앱을 만들고 **카카오맵 사용 설정**을 켭니다.
2. 앱의 **플랫폼 키 → JavaScript 키 → JavaScript SDK 도메인**에 `https://hayul090615.github.io`와 로컬 개발용 `http://localhost:5173`을 등록합니다.
3. JavaScript 키를 GitHub 저장소 시크릿 `VITE_KAKAO_MAP_KEY`에 등록합니다. 로컬 개발에서는 `.env.local`에 같은 변수 이름을 사용하세요. 브라우저용 키는 페이지 번들에서 확인될 수 있으므로 사용할 도메인을 제한하세요.

사이트 안에서 Google 3D 선택지를 활성화하려면:

1. 결제가 설정된 Google Cloud 프로젝트에서 Maps JavaScript API를 활성화합니다.
2. 브라우저 API 키를 발급하고 HTTP 리퍼러 제한에 `https://hayul090615.github.io/*`를, API 제한에 Maps JavaScript API를 설정합니다. 로컬 개발 도메인은 필요할 때만 별도로 허용하세요.
3. GitHub Actions 저장소 시크릿 `VITE_GOOGLE_MAPS_API_KEY`에 등록하고 Pages 워크플로를 다시 실행합니다. 로컬에서는 `.env.local`에 같은 변수 이름으로 설정합니다. 브라우저용 키는 번들에서 공개되므로 도메인/API 제한이 필요합니다.
4. 실제 키로 지도 초기화, 경유지 이동, 사용량을 확인합니다. 키가 없거나 Google 지도에 오류가 발생하면 위성 3D 지도와 Google Earth 링크를 사용할 수 있습니다.

두 지도는 경유지 연결을 보여주는 코스 미리보기입니다. 실제 자전거 길안내가 아니므로 출발 전에 현장 자전거도로와 통행 제한을 확인하세요. Google 3D 건물 제공 범위도 지역별로 다릅니다.

자료·기술: [MapLibre GL JS 3D 건물](https://maplibre.org/maplibre-gl-js/docs/examples/display-buildings-in-3d/), [OpenFreeMap](https://openfreemap.org/), [Esri World Imagery 출처](https://support.esri.com/en-us/knowledge-base/what-is-the-correct-way-to-cite-an-arcgis-online-basema-000012040), [Google Maps 3D 시작하기](https://developers.google.com/maps/documentation/javascript/3d/get-started), [Google API 키 설정](https://developers.google.com/maps/documentation/javascript/get-api-key).

## 최신 화면 개선 (2026-09-30)

- 경로 위 사람 표시는 지도 크기에 맞는 간결한 자전거 아이콘으로 바꾸고, 3D 카메라 기울기를 낮춰 가까운 건물의 원근 왜곡을 줄였습니다.
- 카카오·2D/3D·Google 3D 경로에 나무 표식을 배치하고, 가을 코스에서는 가까이 확대했을 때 나무 아래로 짧은 낙엽 효과가 보입니다. 봄·여름·겨울에는 낙엽이 떨어지지 않습니다.
- 선택한 주행 경로는 굵은 빨간색, 기존 자전거 도로는 청록색으로 계속 구분합니다. 지도 카메라 화살표는 금색 계열로 대비를 높였습니다.
- 지도 위에 코스 선택 → 지도 확인 → 주변 따릉이 찾기의 3단계 안내를 추가하고, 지도 설정과 경로 정보의 색·간격·버튼을 차분한 호텔식 톤으로 정리했습니다.
- 지도 모드 버튼을 하나의 선택 메뉴로 정리하고 지도를 세로로 더 길게 확장했습니다. 지도 기울기는 위아래 화살표로 0°~85° 범위에서 조절하고, 좌우 회전은 360° 이어집니다.
- 나무 표시는 전체 자전거 경로를 따라 약 55m 간격으로 놓으며, 라이더 표시는 약 12km/h 속도로 경로를 반복해서 이동합니다.

## 최신 지도 UI 업데이트 (2026-09-30)

+ 지도 높이를 이전 화면 크기로 복구해 브라우저 높이에 맞게 표시합니다.
+ 경로 나무 간격을 약 260m로 넓혀 밀도를 낮췄습니다. 3D·카카오 지도에서 경로를 따라 움직이는 자전거 이용자는 더 크고 잘 보이게 표시합니다.
+ 지도 보기 드롭다운을 밝은 메뉴와 짙은 글자 조합으로 고정해 다크 모드에서도 선택 항목을 읽을 수 있게 했습니다.
+ 지도 설정과 체크 항목을 둥근 모서리, 라임색 포인트, 선택 상태 표시로 정돈했습니다.

## 맛집 가이드 업데이트 (2026-09-30)

+ 지도에 요리사 가이드 버튼을 추가했습니다. 내 위치를 켠 상태로 코스 경유지에 가까워지면 추천 패널이 자동으로 열리고, 언제든 버튼으로 다시 볼 수 있습니다.
+ 경로 주변 음식점 중 가까운 곳 6개까지 거리와 함께 보여주고, 맛집 표시도 지도에 켜집니다.
+ 대표 메뉴 참고 사진과 네이버 블로그·Instagram·TikTok 검색 링크를 카드에 추가했습니다. 링크는 각 플랫폼의 공개 검색 결과를 엽니다.

## 경로 가이드·날씨 지도 업데이트 (2026-09-30)

+ 지도 위 왼쪽 중앙에 맛집 가이드 버튼을 고정해 바로 찾을 수 있게 했습니다.
+ 나무는 경로 시작·중간·끝을 포함해 약 260m 간격으로 두고, 요리사 안내 핀은 100m 간격으로 표시합니다. 핀을 누르면 그 위치 주변 맛집을 보여줍니다.
+ 지도 설정에서 햇볕·흐림·비 날씨 표현을 선택할 수 있고, 3D 하늘 색과 지도 위 날씨 효과가 바뀝니다.

## 화면 고정·요리사 표식 개선 (2026-09-30)

+ 관광 지도 화면을 브라우저 한 화면에 고정하고, 아래로 이어지던 부가 영역을 접어 지도에 더 넓은 공간을 배정했습니다.
+ 코스와 대여소는 오른쪽 패널에서만 스크롤되며, 모바일에서는 지도 위 슬라이드 패널로 열립니다.
+ 경로를 따라 표시되는 요리사 맛집 핀의 크기와 대비를 높여 지도에서 쉽게 찾을 수 있게 했습니다.

## 지도 화면 빠른 필터 디자인 (2026-09-30)

+ 참고 이미지처럼 지도 위에 둥근 빠른 필터를 배치해 코스·맛집·자전거도로·CCTV 표시를 바로 켜고 끌 수 있습니다.
+ 지도 종류 선택을 상단 도구막대에서 지도 위 오른쪽으로 옮겨 지도 화면에서 바로 바꿀 수 있게 했습니다.

## 한국어 시작·지도 도구막대 (2026-09-30)

+ 언어 파라미터가 없는 첫 방문은 한국어로 시작하도록 기본 언어를 변경했습니다.
+ 코스 목록, 지도 레이어, 계절·날씨·그림자 설정, 지도 종류, 로드뷰, 내 위치, 맛집 가이드를 지도의 세로 도구막대에 모았습니다.
+ 카카오 로드뷰 버튼을 누르면 선택한 경유지 또는 현재 위치 근처의 촬영 화면을 엽니다. 촬영 지점이 없는 곳은 안내 메시지를 표시합니다.

## 지도 도구 패널 겹침 수정 (2026-09-30)

+ 계절·날씨·나무·그림자 설정을 왼쪽 메뉴에서 열리는 고정 사이드 패널로 옮겨 지도 하단 버튼과 겹치지 않게 정리했습니다.
+ 코스·맛집·자전거도로·CCTV·내 위치 메뉴도 같은 패널에 열리며, 닫기 버튼으로 지도로 돌아갈 수 있습니다.
+ 맛집 추천과 로드뷰 패널이 지도 도구 패널과 동시에 겹쳐 열리지 않도록 동작을 정리했습니다.

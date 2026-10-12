# 코드 주석 안내

프로젝트에서 직접 관리하는 TypeScript·React·JavaScript 소스에는 파일의 역할과 주요 함수·처리 흐름을 한국어 주석으로 설명했습니다. CSS·HTML·SVG·SQL·배포 YAML에는 해당 형식에 맞는 주석을 사용했습니다. 설명 주석은 실행 코드를 비활성화하지 않습니다.

## 코드가 연결되는 순서

1. `index.html`이 `src/main.tsx`를 불러오고 React 화면을 연결합니다.
2. `src/App.tsx`가 지도 여행·타자 게임·인증 화면과 시작 애니메이션을 관리합니다.
3. 지도 여행은 `TouristGuide.tsx` → `TourRouteExplorer.tsx` → 지도 SDK 컴포넌트 순으로 연결됩니다.
4. `services/`는 외부 조회와 저장을, `hooks/`는 React 상태와 이벤트 수명을 관리합니다. `utils/`는 좌표·문자열·표시 계산을 담당합니다.
5. `api/`의 서버 함수는 서울시·네이버·방문 데이터베이스 요청을 중계합니다. 인증 키는 환경 변수에서 읽습니다.

## 주석 문법이 없는 설정·데이터 파일

JSON과 GeoJSON에는 주석 문법이 없으므로 파일 안에 `//` 또는 `/* */`를 넣지 않습니다. 각 파일의 역할은 아래에서 설명합니다.

| 파일 | 역할 |
| --- | --- |
| `package.json` | 프런트엔드 의존성과 개발·빌드·미리보기 명령을 정의합니다. |
| `api/package.json` | 서버 API의 실행 형식과 Express 의존성을 정의합니다. |
| `package-lock.json`, `api/package-lock.json` | 설치할 의존성 버전을 고정하는 npm 생성 파일입니다. 의존성을 바꾸면 npm으로 갱신합니다. |
| `tsconfig.json` | 앱과 Vite 설정의 TypeScript 프로젝트 참조를 연결합니다. |
| `tsconfig.app.json` | `src/`의 React·TypeScript 검사 옵션을 정의합니다. |
| `tsconfig.node.json` | Node 환경에서 사용하는 Vite 설정의 검사 옵션을 정의합니다. |
| `vercel.json` | Vercel 빌드·서버 API·페이지 경로 연결을 설정합니다. |
| `src/data/seoulBikeStations.json` | 대여소 스냅샷과 출처 날짜를 저장합니다. 지도·코스 생성의 기본 자료입니다. |
| `src/data/seoulDistricts.geojson` | 서울 자치구 이름과 Polygon/MultiPolygon 경계를 저장합니다. 좌표는 `[경도, 위도]` 순서입니다. |
| `public/datasets/seoul-cctv.json.gz` | CCTV 위치·출처 자료의 압축 JSON입니다. `scripts/build-seoul-cctv-data.mjs`로 생성합니다. |

## 환경 설정과 생성 결과

- `.env.example`은 필요한 환경 변수 이름의 예시이고 `.env.local`은 로컬 실행 설정입니다. 변수의 사용 지점은 `src/services/`, `api/`, 배포 워크플로의 주석에서 확인할 수 있습니다.
- `.gitignore`는 의존성·로컬 설정·빌드 결과 등 Git에서 제외할 경로를 정의합니다.
- `dist/`, `docs/assets/`와 배포용 `docs/index.html`은 생성된 결과물입니다. 기능 설명은 원본 소스에 작성하며 번들 파일은 직접 주석으로 수정하지 않습니다.
- `node_modules/`는 설치된 외부 라이브러리입니다. 라이브러리 소스를 직접 바꾸는 대신 이 프로젝트에서 호출하는 부분에 주석을 둡니다.
- PNG·압축 자료 같은 바이너리 파일에는 텍스트 주석을 삽입하지 않습니다.

## 길 안내와 도착 판정

- 실제 GPS 도착은 `useDestinationArrival.ts`에서 좌표의 정확도·관측 시각·연속 관측을 확인합니다.
- 로드뷰 위치는 실제 GPS와 별도로 관리합니다. 사진 전환 뒤 같은 촬영 지점을 다시 확인하고, 목적지 10m 이내이면서 경로가 6m 이하 남은 경우 축하 안내를 표시합니다.
- 지도에서 선택한 목적지 핀과 로드뷰의 이동 버튼은 별개입니다. 로드뷰의 파란 ‘도착’ 버튼과 상단 ‘도착’ 버튼은 목적지 주변 사진으로 이동한 다음 축하 안내를 표시합니다. 같은 목적지 안내를 닫은 뒤에도 버튼을 누르면 다시 확인할 수 있습니다.
- 다크 모드의 높낮이 제목과 ‘낮음 > 높음’ 문구는 `global.css`의 `.tour-screen--dark .tour-height-legend` 규칙으로 흰색을 적용합니다.

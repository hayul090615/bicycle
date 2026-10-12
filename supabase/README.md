# 방문 기록 연결

Supabase SQL Editor에서 `migrations/2026101201_site_visitors.sql`을 실행합니다.
`site_visitors`에 익명 방문 ID와 최초/최근 방문 시각, 방문 횟수를 저장합니다.
`/api/site-visit`는 첫 방문인지 원자적으로 확인하고 기록합니다.
방문 ID는 HttpOnly 쿠키로 유지하며 위치·검색어는 저장하지 않습니다.

GitHub 저장소의 Actions secrets에 다음 값을 설정하면 기존 배포 워크플로가 전달합니다.

- `SUPABASE_URL`: Supabase 프로젝트 URL
- `SUPABASE_SERVICE_ROLE_KEY`: 서버 전용 키
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`: 기존 로그인 서비스 연결값

서버 전용 키를 `VITE_` 변수에 넣으면 안 됩니다.
로그인한 계정의 방문 여부는 Supabase 사용자 메타데이터에도 저장합니다.
서버 연결이 없거나 응답하지 않으면 IndexedDB와 쿠키로 같은 브라우저의 재방문을 처리합니다.

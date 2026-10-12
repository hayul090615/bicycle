/**
 * 압축 CCTV 자료의 비동기 로딩·오류 상태를 관리한다. 전체 원본 목록을 반환하며 지도에 보낼 경로 주변 자료 선택은 탐색 화면에서 수행한다.
 */
import { useEffect, useState } from 'react'
import { loadPublicCctvBundle, type CameraBundle, type PublicCamera } from '../services/publicCctv'

const EMPTY_CAMERAS: PublicCamera[] = []

export function usePublicCctvData() {
  const [bundle, setBundle] = useState<CameraBundle | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    void loadPublicCctvBundle()
      .then(data => { if (active) setBundle(data) })
      .catch(() => { if (active) setError(true) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  // Return the complete source bundle; the route explorer clips it to the
  // currently selected journey before any markers are sent to a map renderer.
  return { cameras: bundle?.cameras ?? EMPTY_CAMERAS, loading, error, count: bundle?.count ?? 0, latestRecordDate: bundle?.latestRecordDate ?? '' }
}

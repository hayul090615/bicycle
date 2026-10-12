/**
 * CCTV 자료를 가져오는 동안 기다림과 오류 상태를 기억한다. 화면에서는 이 자료 중 현재 지도 중심 500m 안의 위치만 골라 쓴다.
 */
import { useEffect, useState } from 'react'
import { loadPublicCctvBundle, type CameraBundle, type PublicCamera } from '../services/publicCctv'

const EMPTY_CAMERAS: PublicCamera[] = []

export function usePublicCctvData() {
  // useState는 화면에 필요한 값을 기억한다. set으로 시작하는 함수를 부르면 새 값으로 화면도 바뀐다.
  const [bundle, setBundle] = useState<CameraBundle | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  // 화면이 열리거나 대괄호 안의 값이 바뀌면 실행한다. return 안의 함수는 이전 작업을 정리할 때 실행된다.
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

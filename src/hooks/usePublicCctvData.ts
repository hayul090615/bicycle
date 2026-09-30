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

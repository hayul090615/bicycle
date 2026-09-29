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

  // The map layers cluster the complete Seoul dataset instead of clipping it to
  // a small radius around the route or the rider.
  return { cameras: bundle?.cameras ?? EMPTY_CAMERAS, loading, error, count: bundle?.count ?? 0, latestRecordDate: bundle?.latestRecordDate ?? '' }
}

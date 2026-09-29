import { useEffect, useMemo, useState } from 'react'
import { getNearbyPublicCameras, loadPublicCctvBundle, type CameraBundle } from '../services/publicCctv'

export function usePublicCctvData(center: { lat: number; lng: number }) {
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

  const nearby = useMemo(() => bundle ? getNearbyPublicCameras(bundle.cameras, center) : [], [bundle, center])
  return { nearby, loading, error, count: bundle?.count ?? 0, latestRecordDate: bundle?.latestRecordDate ?? '' }
}

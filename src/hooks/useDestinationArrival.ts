import { useCallback, useEffect, useRef, useState } from 'react'

type Location = { lat: number; lng: number; accuracy?: number }

function gapMeters(first: Location, second: Location) {
  const scale = Math.PI / 180
  const latitude = (second.lat - first.lat) * scale
  const longitude = (second.lng - first.lng) * scale
  const angle = Math.sin(latitude / 2) ** 2 + Math.cos(first.lat * scale) * Math.cos(second.lat * scale) * Math.sin(longitude / 2) ** 2
  return 12_742_000 * Math.asin(Math.min(1, Math.sqrt(angle)))
}

export function useDestinationArrival({ destinationKey, destination, location, enabled }: {
  destinationKey: string | null
  destination: Location
  location: Location | null
  enabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const trip = useRef({ key: null as string | null, armed: false, nearbySince: null as number | null, arrived: false })
  useEffect(() => {
    if (trip.current.key !== destinationKey) {
      trip.current = { key: destinationKey, armed: false, nearbySince: null, arrived: false }
      setOpen(false)
    }
    const state = trip.current
    // Panorama movement and inaccurate GPS fixes must not count as arrival.
    if (!destinationKey || !enabled || !location || (location.accuracy ?? Infinity) > 40) {
      state.nearbySince = null
      return
    }
    if (state.arrived) return
    const distance = gapMeters(location, destination)
    if (distance >= 45) state.armed = true
    if (!state.armed || distance > 22) { state.nearbySince = null; return }
    const now = Date.now()
    if (state.nearbySince === null) state.nearbySince = now
    else if (now - state.nearbySince >= 1500) {
      state.arrived = true
      setOpen(true)
    }
  }, [destinationKey, destination.lat, destination.lng, enabled, location])
  const dismiss = useCallback(() => setOpen(false), [])
  return { open, dismiss }
}

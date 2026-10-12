import { useCallback, useEffect, useRef, useState } from 'react'

type Location = { lat: number; lng: number; accuracy?: number; timestamp?: number }

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
  const trip = useRef({ key: null as string | null, armed: false, nearbySince: null as number | null, arrived: false, lastFix: 0 })
  useEffect(() => {
    if (trip.current.key !== destinationKey) {
      trip.current = { key: destinationKey, armed: false, nearbySince: null, arrived: false, lastFix: 0 }
      setOpen(false)
    }
    const state = trip.current
    // Panorama movement and inaccurate GPS fixes must not count as arrival.
    if (!destinationKey || !enabled || !location
      || ![location.lat, location.lng, location.accuracy, location.timestamp, destination.lat, destination.lng].every(value => typeof value === 'number' && Number.isFinite(value))
      || location.accuracy! < 0 || location.accuracy! > 15
      || Date.now() - location.timestamp! > 15_000 || location.timestamp! > Date.now() + 1000) {
      state.nearbySince = null
      return
    }
    if (state.arrived) return
    // Heading changes, reopening a photo, or repeated cached coordinates are
    // not additional GPS observations.
    if (location.timestamp! <= state.lastFix) return
    if (location.timestamp! - state.lastFix > 10_000) state.nearbySince = null
    state.lastFix = location.timestamp!
    const distance = gapMeters(location, destination)
    if (distance >= 45) state.armed = true
    if (!state.armed || distance > 12 || distance + location.accuracy! > 20) { state.nearbySince = null; return }
    const now = location.timestamp!
    if (state.nearbySince === null) state.nearbySince = now
    else if (now - state.nearbySince >= 3000) {
      state.arrived = true
      setOpen(true)
    }
  }, [destinationKey, destination.lat, destination.lng, enabled, location])
  const dismiss = useCallback(() => setOpen(false), [])
  return { open, dismiss }
}

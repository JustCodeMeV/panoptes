import { useEffect, useState } from 'react'

export type Spot = { lat: number; lon: number; city?: string }

/** Rough guess before (or without) the IP lookup: the longitude of the browser's time zone. */
function fromTimeZone(): Spot {
  const lon = Math.max(-170, Math.min(170, -new Date().getTimezoneOffset() / 4))
  return { lat: 35, lon }
}

/**
 * Where the visitor is, from their IP address (GeoJS: free, no key, city-level at best).
 * Starts with a time-zone guess so the globe never waits on the network.
 */
export function useGeoIp(): Spot {
  const [spot, setSpot] = useState<Spot>(fromTimeZone)
  useEffect(() => {
    const ctl = new AbortController()
    fetch('https://get.geojs.io/v1/ip/geo.json', { signal: ctl.signal })
      .then((r) => r.json())
      .then((d: { latitude?: string; longitude?: string; city?: string }) => {
        const lat = Number(d.latitude)
        const lon = Number(d.longitude)
        if (Number.isFinite(lat) && Number.isFinite(lon)) setSpot({ lat, lon, city: d.city })
      })
      .catch(() => {})
    return () => ctl.abort()
  }, [])
  return spot
}

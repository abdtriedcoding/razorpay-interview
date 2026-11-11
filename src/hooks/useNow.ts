import { useEffect, useState } from 'react'

/**
 * Current time, refreshed on an interval. Components that derive time-based state
 * (e.g. Active -> Expired) re-render automatically as time passes.
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])

  return now
}

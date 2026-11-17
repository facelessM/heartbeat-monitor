import { useState, useEffect, useRef, useCallback } from 'react'
import type { Zone } from '../types'
import { getZone } from '../utils/hrCalculations'
import type { Phase } from './useSimulatedHR'

export interface SessionRecap {
  // Epoch ms when the session ended — also used as its stable id in history.
  endedAt: number
  durationMs: number
  sets: number
  avgHR: number
  maxHR: number
  // Time spent in each zone (ms), indexed to match the zones[] passed in.
  zoneMs: number[]
}

interface Args {
  live: boolean
  hr: number
  phase: Phase
  zones: Zone[]
}

// Accumulates workout stats off the live HR stream and, when a session ends,
// snapshots them into `recap` so the UI can show a summary. Everything is kept
// in refs so per-tick updates don't trigger re-renders — only the final
// snapshot and the dismiss do.
export function useSessionRecap({ live, hr, phase, zones }: Args) {
  const [recap, setRecap] = useState<SessionRecap | null>(null)

  const startRef = useRef<number | null>(null)
  const lastTickRef = useRef(0)
  // Zone index the elapsed interval should be attributed to (where we were
  // during it), or -1 when out of range.
  const lastZoneRef = useRef(-1)
  const sumRef = useRef(0)
  const countRef = useRef(0)
  const maxRef = useRef(0)
  const setsRef = useRef(0)
  const zoneMsRef = useRef<number[]>([])
  const prevPhaseRef = useRef<Phase>(phase)
  const prevLiveRef = useRef(false)

  // Start a session: zero the accumulators. Called when `live` rises.
  const begin = useCallback(() => {
    const now = Date.now()
    startRef.current = now
    lastTickRef.current = now
    lastZoneRef.current = -1
    sumRef.current = 0
    countRef.current = 0
    maxRef.current = 0
    setsRef.current = 0
    zoneMsRef.current = zones.map(() => 0)
    prevPhaseRef.current = phase
  }, [zones, phase])

  // On the rising/falling edge of `live`, start a fresh session or snapshot the
  // finished one.
  useEffect(() => {
    if (live && !prevLiveRef.current) {
      setRecap(null)
      begin()
    } else if (!live && prevLiveRef.current) {
      if (countRef.current > 0 && startRef.current != null) {
        setRecap({
          endedAt: Date.now(),
          durationMs: Date.now() - startRef.current,
          sets: setsRef.current,
          avgHR: Math.round(sumRef.current / countRef.current),
          maxHR: maxRef.current,
          zoneMs: zoneMsRef.current.slice(),
        })
      }
    }
    prevLiveRef.current = live
  }, [live, begin])

  // Sample on every HR change while live: attribute the elapsed interval to the
  // zone we were in, then fold the new reading into the running aggregates.
  useEffect(() => {
    if (!live) return
    const now = Date.now()
    const dt = now - lastTickRef.current
    if (lastZoneRef.current >= 0 && dt > 0) {
      zoneMsRef.current[lastZoneRef.current] += dt
    }
    lastTickRef.current = now

    const zone = getZone(hr, zones)
    lastZoneRef.current = zone ? zones.indexOf(zone) : -1

    sumRef.current += hr
    countRef.current += 1
    if (hr > maxRef.current) maxRef.current = hr
  }, [hr, live, zones])

  // Count a completed set each time the workout phase enters 'working'.
  useEffect(() => {
    if (live && phase === 'working' && prevPhaseRef.current !== 'working') {
      setsRef.current += 1
    }
    prevPhaseRef.current = phase
  }, [phase, live])

  const dismiss = useCallback(() => setRecap(null), [])

  return { recap, dismiss }
}

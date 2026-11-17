import { useState, useEffect, useRef, useCallback } from 'react'

export type Phase = 'idle' | 'working' | 'resting'

// After this long in the working phase the simulator stops behaving and drives
// the heart rate past safe levels. This lets us exercise the high-HR alert path
// and other danger-zone edge cases without needing a real sensor to misbehave.
const ESCALATE_AFTER_MS = 10_000

// Hard ceiling on the simulated heart rate (bpm), regardless of how long the
// escalation runs — keeps the demo from reporting implausible values.
const MAX_BPM = 180

export function useSimulatedHR(restingHR: number, workoutHR: number, maxHR: number) {
  const [hr, setHR] = useState(restingHR)
  const [phase, setPhase] = useState<Phase>('idle')
  const phaseRef = useRef<Phase>('idle')
  // Timestamp the current working phase began, so we know when to escalate.
  const workingSinceRef = useRef<number | null>(null)

  useEffect(() => { phaseRef.current = phase }, [phase])

  useEffect(() => {
    const tick = setInterval(() => {
      setHR(cur => {
        const p = phaseRef.current

        let target: number
        let upperCap: number
        if (p === 'working') {
          const since = workingSinceRef.current
          const elapsed = since == null ? 0 : Date.now() - since
          if (elapsed > ESCALATE_AFTER_MS) {
            // Edge-case stress test: ramp the target past maxHR and keep
            // climbing the longer the set runs, so the HR crosses into the
            // danger zone and beyond.
            const overSec = (elapsed - ESCALATE_AFTER_MS) / 1000
            const climb = maxHR + 8 + overSec * 4
            if (climb >= MAX_BPM) {
              // Once we'd hit the ceiling, hover just below it with a small
              // jitter instead of pinning flat at MAX_BPM.
              target = MAX_BPM - 1.5 + (Math.random() - 0.5) * 1.5
            } else {
              target = climb + (Math.random() - 0.5) * 6
            }
            upperCap = MAX_BPM
          } else {
            target = workoutHR + (Math.random() - 0.5) * 12
            upperCap = workoutHR + 15
          }
        } else {
          target = restingHR + (Math.random() - 0.5) * 6
          upperCap = workoutHR + 15
        }

        // Resting recovery eases down gently (lower = slower fall); working
        // ramps up quickly.
        const speed = p === 'working' ? 0.42 : 0.04
        const noise = (Math.random() - 0.5) * 1.5
        const next = cur + (target - cur) * speed + noise
        return Math.round(Math.max(restingHR - 5, Math.min(next, upperCap, MAX_BPM)))
      })
    }, 600)
    return () => clearInterval(tick)
  }, [restingHR, workoutHR, maxHR])

  const startSet = useCallback(() => {
    workingSinceRef.current = Date.now()
    setPhase('working')
  }, [])
  const startRest = useCallback(() => {
    workingSinceRef.current = null
    setPhase('resting')
  }, [])
  // Return to a clean idle state — used when the sensor/simulator stops so a
  // later restart begins fresh instead of resuming the old phase.
  const reset = useCallback(() => {
    workingSinceRef.current = null
    setPhase('idle')
    setHR(restingHR)
  }, [restingHR])

  return { hr, phase, startSet, startRest, reset }
}

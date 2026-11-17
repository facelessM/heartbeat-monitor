import { useEffect, useRef } from 'react'
import { Accelerometer } from 'expo-sensors'

// Accelerometer values are in g (≈1 total at rest from gravity). A brisk shake
// pushes the magnitude well past that.
const SHAKE_THRESHOLD_G = 1.8
const SHAKE_COOLDOWN_MS = 1200
const UPDATE_INTERVAL_MS = 100

/**
 * Calls `onShake` when the phone is shaken while `enabled` is true. Fully
 * offline (device accelerometer via expo-sensors).
 */
export function useShakeControl(enabled: boolean, onShake: () => void) {
  const onShakeRef = useRef(onShake)
  useEffect(() => {
    onShakeRef.current = onShake
  })

  useEffect(() => {
    if (!enabled) return
    let lastShake = 0
    Accelerometer.setUpdateInterval(UPDATE_INTERVAL_MS)
    const sub = Accelerometer.addListener(({ x, y, z }) => {
      const magnitude = Math.sqrt(x * x + y * y + z * z)
      if (magnitude < SHAKE_THRESHOLD_G) return
      const now = Date.now()
      if (now - lastShake < SHAKE_COOLDOWN_MS) return
      lastShake = now
      console.log(`[HeartBeat] shake detected (${magnitude.toFixed(2)}g)`)
      onShakeRef.current()
    })
    return () => sub.remove()
  }, [enabled])
}

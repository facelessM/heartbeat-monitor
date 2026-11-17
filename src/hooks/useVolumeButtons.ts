import { useEffect, useRef } from 'react'
import { VolumeManager } from 'react-native-volume-manager'

// The OS has no "volume button pressed" event — we only get volume *changes*.
// So we keep the volume parked at a mid-point baseline (leaving headroom in both
// directions), watch for changes, infer the direction, then snap back to the
// baseline so the next press can always register.
const BASELINE = 0.5
const EPSILON = 0.005

/**
 * Maps the hardware volume buttons to two callbacks while `enabled` is true:
 * volume-up fires `onUp`, volume-down fires `onDown`. The native volume HUD is
 * hidden while active and restored on cleanup.
 *
 * Requires a native build / dev client — the underlying native module is not
 * available in Expo Go.
 */
export function useVolumeButtons(enabled: boolean, onUp: () => void, onDown: () => void) {
  const onUpRef = useRef(onUp)
  const onDownRef = useRef(onDown)
  useEffect(() => {
    onUpRef.current = onUp
    onDownRef.current = onDown
  })

  useEffect(() => {
    if (!enabled) return
    let active = true
    let primed = false
    // Swallow the event produced by our own baseline writes.
    let ignoreNext = true
    let last = BASELINE

    VolumeManager.showNativeVolumeUI({ enabled: false }).catch(() => {})
    VolumeManager.getVolume()
      .then(({ volume }) => {
        if (active && !primed) {
          primed = true
          last = volume
        }
      })
      .catch(() => {})
    VolumeManager.setVolume(BASELINE, { showUI: false }).catch(() => {})

    const sub = VolumeManager.addVolumeListener(result => {
      if (!active) return
      const v = result.volume
      // Establish a starting reference without acting on it.
      if (!primed) {
        primed = true
        last = v
        return
      }
      // Ignore the change we caused by snapping back to the baseline.
      if (ignoreNext) {
        ignoreNext = false
        last = v
        return
      }
      const diff = v - last
      if (Math.abs(diff) < EPSILON) {
        last = v
        return
      }
      const direction = diff > 0 ? 'up' : 'down'
      if (direction === 'up') onUpRef.current()
      else onDownRef.current()
      // Re-park at the baseline so there's room to press either way next time.
      ignoreNext = true
      last = BASELINE
      VolumeManager.setVolume(BASELINE, { showUI: false }).catch(() => {})
    })

    return () => {
      active = false
      sub.remove()
      VolumeManager.showNativeVolumeUI({ enabled: true }).catch(() => {})
    }
  }, [enabled])
}

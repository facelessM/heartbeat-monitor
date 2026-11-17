import { useEffect, useRef } from 'react'
import {
  useAudioRecorder,
  RecordingPresets,
  setAudioModeAsync,
  requestRecordingPermissionsAsync,
} from 'expo-audio'

// Metering is in dBFS (0 = loudest, quiet room ≈ -50). A clap close to the phone
// spikes near the top, so we treat a jump past the (configurable) threshold as a
// clap, then re-arm only after the level drops this far below it.
const REARM_MARGIN_DB = 12
const CLAP_COOLDOWN_MS = 1200
const POLL_MS = 80
// Ignore everything for a moment after record() starts: the first metering
// samples on some Android devices read a momentary high value (and the
// recorder's gain ramp can briefly cross a sensitive threshold), which would
// otherwise fire a spurious clap the instant monitoring begins.
const WARMUP_MS = 500
// How often to report the live level to the UI meter.
const LEVEL_REPORT_MS = 120

// Set true to log live mic levels for tuning the threshold.
const DEBUG = false
const DEBUG_LOG_MS = 700

/**
 * Calls `onClap` on a loud clap while `enabled` is true. Uses the microphone's
 * loudness (recording metering) only — no speech recognition — so it works
 * offline on any device. `thresholdDb` (dBFS) sets sensitivity; enable DEBUG to
 * see live mic levels in the logs.
 */
export function useClapControl(
  enabled: boolean,
  onClap: () => void,
  thresholdDb: number,
  onLevel?: (db: number) => void,
) {
  const onClapRef = useRef(onClap)
  // Read the threshold live so moving the slider takes effect without restarting.
  const thresholdRef = useRef(thresholdDb)
  const onLevelRef = useRef(onLevel)
  useEffect(() => {
    onClapRef.current = onClap
    thresholdRef.current = thresholdDb
    onLevelRef.current = onLevel
  })

  const recorder = useAudioRecorder({
    ...RecordingPresets.LOW_QUALITY,
    isMeteringEnabled: true,
  })

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let poll: ReturnType<typeof setInterval> | null = null
    // Start disarmed: we only arm once metering has settled to a genuine
    // sub-threshold level, so a cold-start spike or the recorder's initial
    // ramp can't trigger a clap. The warm-up window backs this up by ignoring
    // all samples for the first WARMUP_MS.
    let armed = false
    let meteringStartedAt = 0
    let lastClap = 0
    let lastLog = 0
    let lastLevelReport = 0
    let peak = -160
    let sawMetering = false

    ;(async () => {
      try {
        const perm = await requestRecordingPermissionsAsync()
        if (cancelled) return
        if (!perm.granted) return
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true })
        if (cancelled) return
        // Must prepare before record(), or the recorder never actually starts.
        await recorder.prepareToRecordAsync({
          ...RecordingPresets.LOW_QUALITY,
          isMeteringEnabled: true,
        })
        if (cancelled) return
        recorder.record()

        poll = setInterval(() => {
          const status = recorder.getStatus()
          const db = typeof status.metering === 'number' ? status.metering : null
          const now = Date.now()

          if (db == null) {
            // Keep reporting (throttled) so we can see isRecording flip to true.
            if (now - lastLog > 1000) {
              lastLog = now
            }
            return
          }
          if (!sawMetering) meteringStartedAt = now
          sawMetering = true
          if (db > peak) peak = db
          const threshold = thresholdRef.current

          // Feed the live level to the UI meter (throttled).
          if (onLevelRef.current && now - lastLevelReport > LEVEL_REPORT_MS) {
            lastLevelReport = now
            onLevelRef.current(db)
          }

          if (DEBUG && now - lastLog > DEBUG_LOG_MS) {
            lastLog = now
            peak = -160
          }

          // During warm-up, only feed the meter — never arm or fire — so the
          // initial spike/ramp settles before we start listening for claps.
          if (now - meteringStartedAt < WARMUP_MS) return

          if (db >= threshold && armed) {
            armed = false
            if (now - lastClap < CLAP_COOLDOWN_MS) return
            lastClap = now
            onClapRef.current()
          } else if (db <= threshold - REARM_MARGIN_DB) {
            armed = true
          }
        }, POLL_MS)
      } catch (e) {
        console.error('[HeartBeat] clap setup failed:', e)
      }
    })()

    return () => {
      cancelled = true
      if (poll) clearInterval(poll)
      recorder.stop().catch(() => {})
      // Release the recording audio session so playback/alerts behave normally.
      setAudioModeAsync({ allowsRecording: false }).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])
}

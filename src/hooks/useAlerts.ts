import { useCallback, useEffect, useState } from 'react'
import { Platform, Vibration } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useAudioPlayer, setAudioModeAsync } from 'expo-audio'

export interface AlertSettings {
  vibration: boolean
  sound: boolean
  flash: boolean
  // Hands-free input controls — not alert channels, but they ride along in the
  // same persisted-settings object for convenience.
  volumeButtons: boolean
  shake: boolean
  clap: boolean
  // Clap detection threshold in dBFS (0 = loudest; lower = more sensitive).
  clapThreshold: number
}

// The boolean settings that the toggle switches flip.
export type AlertKind =
  | 'vibration'
  | 'sound'
  | 'flash'
  | 'volumeButtons'
  | 'shake'
  | 'clap'

const STORAGE_KEY = 'heartbeat.alertSettings'

export const CLAP_THRESHOLD_MIN = -30 // most sensitive
export const CLAP_THRESHOLD_MAX = -3 // least sensitive
const DEFAULT_CLAP_THRESHOLD = -6

const DEFAULT_SETTINGS: AlertSettings = {
  vibration: true,
  sound: true,
  flash: false,
  volumeButtons: true,
  shake: false,
  clap: false,
  clapThreshold: DEFAULT_CLAP_THRESHOLD,
}

// Severity tunes how insistent each alert is.
type Severity = 'high' | 'low'

// Vibration patterns are [wait, vibrate, wait, vibrate, ...] in ms. Android
// honors the full pattern; iOS ignores durations and gives a single buzz.
const VIBRATION_PATTERN: Record<Severity, number | number[]> = {
  high: [0, 120, 60, 120, 60, 120],
  low: 80,
}

// How many times to replay the tone, and the spacing between replays (ms).
const BEEP_REPEATS: Record<Severity, number> = { high: 3, low: 1 }
const BEEP_GAP_MS = 250

const SOUND_ASSETS = {
  high: require('../../assets/beep-high.wav'),
  low: require('../../assets/beep-low.wav'),
}

export function useAlerts() {
  const [settings, setSettings] = useState<AlertSettings>(DEFAULT_SETTINGS)
  const [loaded, setLoaded] = useState(false)

  // expo-audio players for the two beep tones. useAudioPlayer keeps each player
  // stable across renders and releases it automatically on unmount.
  const highPlayer = useAudioPlayer(SOUND_ASSETS.high)
  const lowPlayer = useAudioPlayer(SOUND_ASSETS.low)

  // Vibration is always available on a real device.
  const vibrationSupported = Platform.OS !== 'web'

  // Load persisted settings once on mount (AsyncStorage is async, unlike the
  // old synchronous localStorage initializer).
  useEffect(() => {
    let cancelled = false
    AsyncStorage.getItem(STORAGE_KEY)
      .then(raw => {
        if (cancelled) return
        if (raw) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) })
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Persist settings after the initial load (don't clobber storage on mount).
  useEffect(() => {
    if (!loaded) return
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings)).catch(() => {})
  }, [settings, loaded])

  // Allow the beeps to sound even when the device is in silent mode (iOS).
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {})
  }, [])

  const toggle = useCallback((kind: AlertKind) => {
    setSettings(prev => ({ ...prev, [kind]: !prev[kind] }))
  }, [])

  const setClapThreshold = useCallback((value: number) => {
    setSettings(prev => ({ ...prev, clapThreshold: Math.round(value) }))
  }, [])

  const playBeep = useCallback(
    (severity: Severity) => {
      const player = severity === 'high' ? highPlayer : lowPlayer
      if (!player) return
      const repeats = BEEP_REPEATS[severity]
      for (let i = 0; i < repeats; i++) {
        const fire = () => {
          // Rewind to the start, then play — replaying a finished player is a no-op otherwise.
          player.seekTo(0).then(() => player.play()).catch(() => {})
        }
        if (i === 0) fire()
        else setTimeout(fire, i * BEEP_GAP_MS)
      }
    },
    [highPlayer, lowPlayer],
  )

  // A short, light buzz used to confirm a hands-free control action (e.g. a
  // set/rest toggle) — distinct from the insistent alert patterns above. Always
  // available on a real device; independent of the alert-channel toggles.
  const confirm = useCallback(() => {
    if (vibrationSupported) Vibration.vibrate(25)
  }, [vibrationSupported])

  // Fires whichever alert channels are currently enabled.
  // Returns whether a flash was requested, so the UI can drive a visual cue.
  const fire = useCallback(
    (severity: Severity): { flash: boolean } => {
      if (settings.vibration && vibrationSupported) {
        Vibration.vibrate(VIBRATION_PATTERN[severity])
      }
      if (settings.sound) {
        playBeep(severity)
      }
      return { flash: settings.flash }
    },
    [settings, vibrationSupported, playBeep],
  )

  return { settings, toggle, setClapThreshold, fire, confirm, vibrationSupported }
}

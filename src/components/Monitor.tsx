import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake'
import type { HRProfile } from '../types'
import { getZone } from '../utils/hrCalculations'
import { useSimulatedHR } from '../hooks/useSimulatedHR'
import { useSessionRecap, type SessionRecap } from '../hooks/useSessionRecap'
import { useHeartRate } from '../hooks/useHeartRate'
import type { useAlerts } from '../hooks/useAlerts'
import { useVolumeButtons } from '../hooks/useVolumeButtons'
import { useShakeControl } from '../hooks/useShakeControl'
import { useClapControl } from '../hooks/useClapControl'
import { colors, shared } from '../theme'

interface Props {
  hrProfile: HRProfile
  // Alerts are owned by the tab shell so the monitor and the Settings tab share
  // one source of truth.
  alerts: ReturnType<typeof useAlerts>
  // Whether the Monitor tab is the active screen. Hands-free input controls are
  // gated on this so they don't fire (or grab the mic) while another tab is up;
  // the heart-rate session and alerts keep running regardless.
  active: boolean
  // Called once with the recap when a live session ends, to append it to history.
  onSessionEnd: (recap: SessionRecap) => void
}

// A full-screen page that slides up over the monitor — used for the session
// recap so it reads as its own screen rather than content stacked onto the
// live view.
function ModalPage({
  visible,
  title,
  onClose,
  closeLabel = 'Close',
  scroll = true,
  children,
}: {
  visible: boolean
  title: string
  onClose: () => void
  closeLabel?: string
  scroll?: boolean
  children: ReactNode
}) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={shared.screen}>
        <View style={styles.modalHeader}>
          <Text style={shared.appTitleSm}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={shared.btnGhostText}>{closeLabel}</Text>
          </Pressable>
        </View>
        {scroll ? (
          <ScrollView style={shared.screen} contentContainerStyle={styles.modalBody}>
            {children}
          </ScrollView>
        ) : (
          <View style={shared.screen}>{children}</View>
        )}
      </View>
    </Modal>
  )
}

// m:ss for session/zone durations.
const fmtDuration = (ms: number) => {
  const total = Math.round(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function Monitor({ hrProfile, alerts, active, onSessionEnd }: Props) {
  const ble = useHeartRate()
  const [simulating, setSimulating] = useState(false)

  const zone3 = hrProfile.zones[2]
  const workoutHR = Math.round((zone3.min + zone3.max) / 2)

  const sim = useSimulatedHR(hrProfile.restingHR, workoutHR, hrProfile.maxHR)
  const { phase, startSet, startRest, reset } = sim

  // Stopping the simulator or disconnecting the sensor mid-set must also clear
  // the workout phase, so the next session starts from a clean idle state
  // instead of resuming the old 'working'/'resting' phase.
  const stopSimulator = useCallback(() => {
    setSimulating(false)
    reset()
  }, [reset])

  const disconnect = useCallback(() => {
    ble.disconnect()
    reset()
  }, [ble, reset])

  const isConnected = ble.status === 'connected'
  // The monitor is "live" when a real device is connected OR the demo
  // simulator is running, so it works even without a sensor.
  const isLive = isConnected || simulating

  // While monitoring, the hardware volume buttons drive the workout: up starts a
  // set, down switches to rest — so you don't have to look at the screen mid-set.
  // Gated on `active` so the controls only respond while the Monitor tab is up.
  useVolumeButtons(active && isLive && alerts.settings.volumeButtons, startSet, startRest)

  // Single-gesture controls (shake/clap) just flip between the two phases.
  const toggleSet = useCallback(() => {
    if (phase === 'working') startRest()
    else startSet()
  }, [phase, startSet, startRest])

  // Hands-free controls (opt-in via settings). The clap meter/tuner lives on the
  // Settings tab; here clap only drives the set/rest toggle.
  useShakeControl(active && isLive && alerts.settings.shake, toggleSet)
  useClapControl(
    active && isLive && alerts.settings.clap,
    toggleSet,
    alerts.settings.clapThreshold,
  )

  // Build the on-screen tip from whichever hands-free controls are enabled.
  const handsFreeHints = [
    alerts.settings.volumeButtons && 'volume buttons',
    alerts.settings.shake && 'shake',
    alerts.settings.clap && 'clap',
  ].filter(Boolean) as string[]

  const hr = isConnected ? (ble.hr ?? hrProfile.restingHR) : sim.hr
  const displayHR = isConnected ? ble.hr : sim.hr

  // Accumulate workout stats while live; surface a recap when the session ends.
  const { recap, dismiss: dismissRecap } = useSessionRecap({
    live: isLive,
    hr,
    phase,
    zones: hrProfile.zones,
  })

  // Persist each finished session to history exactly once (recap is a fresh
  // object per session end; null between sessions).
  const savedRecapRef = useRef<SessionRecap | null>(null)
  useEffect(() => {
    if (recap && recap !== savedRecapRef.current) {
      savedRecapRef.current = recap
      onSessionEnd(recap)
    }
  }, [recap, onSessionEnd])

  const currentZone = getZone(hr, hrProfile.zones)
  const isReady = phase === 'resting' && hr <= hrProfile.recoveryTarget

  // Zone bar marker
  const zoneBarMin = hrProfile.zones[0].min
  const markerPct = Math.max(0, Math.min(100,
    (hr - zoneBarMin) / (hrProfile.maxHR - zoneBarMin) * 100
  ))

  // Recovery progress fill. Guard the denominator: if the recovery target is at
  // or above the working HR there's no span to recover across, so treat it as
  // fully recovered rather than dividing by zero/negative.
  const recoverySpan = workoutHR - hrProfile.recoveryTarget
  const recoveryFill = phase === 'resting'
    ? recoverySpan <= 0
      ? 100
      : 100 - Math.max(0, Math.min(100,
          (hr - hrProfile.recoveryTarget) / recoverySpan * 100
        ))
    : 0

  const getFeedback = (): { text: string; color: string } => {
    if (phase === 'idle') return { text: "Press Start Set when you're ready", color: '#8e8e93' }
    if (phase === 'working') {
      if (hr > hrProfile.zones[4].min) return { text: 'Ease up — heart rate is very high!', color: '#ef4444' }
      if (!currentZone) return { text: 'Warming up...', color: '#60a5fa' }
      if (currentZone.number >= 3) return { text: 'In the zone! Keep pushing.', color: currentZone.color }
      return { text: 'Getting up to speed...', color: '#fbbf24' }
    }
    if (isReady) return { text: 'Ready for next set!', color: '#34d399' }
    return {
      text: `Recovering... ${Math.max(0, hr - hrProfile.recoveryTarget)} bpm to go`,
      color: '#fbbf24',
    }
  }

  const feedback = getFeedback()
  const hrColor = currentZone?.color ?? (hr < hrProfile.zones[0].min ? '#8e8e93' : '#ef4444')

  // Training is loud and colorful; everything else (resting/idle) is muted, so
  // the current phase is obvious at a glance.
  const training = phase === 'working'
  const statusLabel = phase === 'working' ? 'TRAINING' : phase === 'resting' ? 'RESTING' : 'READY'

  // Alert triggering — fire on the rising edge of each event so we don't spam.
  const isTooHigh = isLive && phase === 'working' && hr > hrProfile.zones[4].min
  const prevTooHigh = useRef(false)
  const prevReady = useRef(false)
  const prevPhase = useRef(phase)
  // Lazy state initializer keeps a single stable Animated.Value across renders
  // without reading a ref during render.
  const [flashAnim] = useState(() => new Animated.Value(0))

  const triggerFlash = useCallback(() => {
    flashAnim.stopAnimation()
    flashAnim.setValue(0)
    Animated.sequence([
      Animated.timing(flashAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(flashAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
      Animated.timing(flashAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(flashAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start()
  }, [flashAnim])

  useEffect(() => {
    if (isTooHigh && !prevTooHigh.current) {
      if (alerts.fire('high').flash) triggerFlash()
    }
    prevTooHigh.current = isTooHigh
  }, [isTooHigh, alerts, triggerFlash])

  useEffect(() => {
    const ready = isLive && isReady
    if (ready && !prevReady.current) {
      if (alerts.fire('low').flash) triggerFlash()
    }
    prevReady.current = ready
  }, [isLive, isReady, alerts, triggerFlash])

  // Light haptic confirmation whenever the workout phase flips between set and
  // rest, so hands-free controls (volume buttons, shake, clap) give tactile
  // feedback without looking at the screen. Skip transitions into idle (e.g. a
  // reset/disconnect), which aren't user-initiated toggles.
  useEffect(() => {
    if (phase !== prevPhase.current && phase !== 'idle' && isLive) {
      alerts.confirm()
    }
    prevPhase.current = phase
  }, [phase, isLive, alerts])

  // Keep the screen awake while a session is live (sensor connected or
  // simulating), and release the lock as soon as monitoring stops or the
  // screen unmounts — otherwise the display can sleep mid-workout.
  useEffect(() => {
    if (!isLive) return
    activateKeepAwakeAsync().catch(() => {})
    return () => {
      deactivateKeepAwake().catch(() => {})
    }
  }, [isLive])

  return (
    <View style={shared.screen}>
      <ScrollView style={shared.screen} contentContainerStyle={shared.container}>
        <View style={styles.header}>
          <Text style={shared.appTitle}>HeartBeat Monitor</Text>
        </View>

        <ModalPage visible={recap != null} title="Session recap" onClose={dismissRecap}>
          {recap && (
            <View style={shared.card}>
            <View style={styles.recapGrid}>
              <View style={styles.recapStat}>
                <Text style={styles.recapStatValue}>{fmtDuration(recap.durationMs)}</Text>
                <Text style={styles.recapStatLabel}>Duration</Text>
              </View>
              <View style={styles.recapStat}>
                <Text style={styles.recapStatValue}>{recap.sets}</Text>
                <Text style={styles.recapStatLabel}>Sets</Text>
              </View>
              <View style={styles.recapStat}>
                <Text style={styles.recapStatValue}>{recap.avgHR}</Text>
                <Text style={styles.recapStatLabel}>Avg bpm</Text>
              </View>
              <View style={styles.recapStat}>
                <Text style={styles.recapStatValue}>{recap.maxHR}</Text>
                <Text style={styles.recapStatLabel}>Max bpm</Text>
              </View>
            </View>

            <Text style={shared.sectionLabel}>Time in zones</Text>
            {(() => {
              const peak = Math.max(1, ...recap.zoneMs)
              return hrProfile.zones.map((z, i) => {
                const ms = recap.zoneMs[i] ?? 0
                return (
                  <View key={z.number} style={styles.recapZoneRow}>
                    <View style={[styles.recapZoneDot, { backgroundColor: z.color }]} />
                    <Text style={styles.recapZoneLabel}>{z.label}</Text>
                    <View style={styles.recapBarTrack}>
                      <View
                        style={[
                          styles.recapBarFill,
                          { width: `${(ms / peak) * 100}%`, backgroundColor: z.color },
                        ]}
                      />
                    </View>
                    <Text style={styles.recapZoneTime}>{fmtDuration(ms)}</Text>
                  </View>
                )
              })
            })()}
            </View>
          )}
        </ModalPage>

        {!isLive ? (
          <View style={[shared.card, styles.bleCard]}>
            <Text style={shared.cardHeading}>Connect Device</Text>
            {ble.status === 'unsupported' ? (
              <Text style={[shared.muted, styles.centerText]}>
                Bluetooth isn't available on this device. Use the simulator below.
              </Text>
            ) : (
              <>
                <Text style={[shared.muted, styles.centerText]}>
                  Pair an ANT+/BLE heart rate monitor (Polar, Garmin, Wahoo, etc.) over Bluetooth.
                </Text>
                {ble.status === 'connecting' ? (
                  <Text style={styles.connecting}>Searching for device...</Text>
                ) : (
                  <Pressable
                    style={({ pressed }) => [shared.btnPrimary, styles.fullBtn, pressed && shared.pressed]}
                    onPress={ble.connect}
                  >
                    <Text style={shared.btnPrimaryText}>Connect via Bluetooth</Text>
                  </Pressable>
                )}
                {ble.error && <Text style={styles.bleError}>{ble.error}</Text>}
              </>
            )}

            <Text style={styles.divider}>OR</Text>
            <Pressable
              style={({ pressed }) => [shared.btnSecondary, styles.fullBtn, pressed && shared.pressed]}
              onPress={() => setSimulating(true)}
            >
              <Text style={shared.btnSecondaryText}>Simulate a sensor (demo)</Text>
            </Pressable>
            <Text style={[shared.muted, styles.centerText]}>
              No device needed — generates a realistic heart rate so you can try the app.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.bleChip}>
              <View style={styles.bleDot} />
              <Text style={styles.bleChipText}>
                {isConnected ? (ble.deviceName ?? 'Heart Rate Monitor') : 'Simulated sensor (demo)'}
                {isConnected && ble.contact === 'not-detected' && (
                  <Text style={styles.bleWarn}> · poor contact</Text>
                )}
              </Text>
              <Pressable onPress={isConnected ? disconnect : stopSimulator}>
                <Text style={styles.bleLink}>{isConnected ? 'disconnect' : 'stop'}</Text>
              </Pressable>
            </View>

            {/* Phase banner — loud when training, muted otherwise */}
            <View
              style={[
                styles.statusBanner,
                { backgroundColor: training ? hrColor : colors.surfaceRaised },
              ]}
            >
              <Text style={[styles.statusBannerText, { color: training ? '#000' : colors.muted }]}>
                {statusLabel}
              </Text>
            </View>

            {/* HR display */}
            <View
              style={[
                shared.card,
                styles.hrCard,
                { borderColor: training ? hrColor : colors.border },
              ]}
            >
              <Text style={[styles.hrNumber, { color: training ? hrColor : colors.muted }]}>
                {displayHR ?? '—'}
              </Text>
              <Text style={styles.hrUnit}>BPM</Text>
              <View
                style={[
                  styles.zoneTag,
                  { backgroundColor: training ? (currentZone?.color ?? '#3a3a3c') : colors.surfaceRaised },
                ]}
              >
                <Text style={[styles.zoneTagText, { color: training ? '#000' : colors.muted }]}>
                  {currentZone
                    ? `Z${currentZone.number} · ${currentZone.label}`
                    : hr < hrProfile.zones[0].min ? 'Resting' : 'Above max'}
                </Text>
              </View>
            </View>

            {/* Feedback */}
            <Text style={[styles.feedback, { color: feedback.color }]}>{feedback.text}</Text>

            {/* One phase-aware section: the training Zone bar, or the Recovery
                progress while resting. Fixed-height body so nothing below shifts. */}
            <View style={[shared.card, phase === 'idle' && styles.cardInactive]}>
              <View style={styles.phaseBody}>
                {phase === 'resting' ? (
                  <>
                    <Text style={shared.sectionLabel}>Recovery</Text>
                    <View style={styles.progressTrack}>
                      <View
                        style={{
                          height: '100%',
                          borderRadius: 8,
                          width: `${recoveryFill}%`,
                          backgroundColor: isReady ? '#34d399' : '#f97316',
                        }}
                      />
                    </View>
                    <Text style={shared.muted}>Target: {hrProfile.recoveryTarget} bpm</Text>
                  </>
                ) : (
                  <>
                    <Text style={shared.sectionLabel}>Zone</Text>
                    <View style={styles.zoneBarWrap}>
                      <View style={styles.zoneBar}>
                        {hrProfile.zones.map(zone => (
                          <View
                            key={zone.number}
                            style={{
                              flex: zone.max - zone.min + 1,
                              backgroundColor: zone.color,
                              opacity: currentZone?.number === zone.number ? 1 : 0.25,
                              borderRadius: 3,
                            }}
                          />
                        ))}
                      </View>
                      <View style={[styles.zoneMarker, { left: `${markerPct}%` }]} />
                    </View>
                    <View style={styles.zoneBarLabels}>
                      <Text style={styles.zoneBarLabelText}>{hrProfile.zones[0].min}</Text>
                      <Text style={styles.zoneBarLabelText}>{hrProfile.maxHR} bpm</Text>
                    </View>
                  </>
                )}
              </View>
            </View>

            {/* Single control — flips between starting a set and resting */}
            <Pressable
              onPress={toggleSet}
              style={({ pressed }) => [
                styles.bigBtn,
                training ? styles.bigBtnRest : styles.bigBtnStart,
                pressed && shared.pressed,
              ]}
            >
              <Text style={training ? styles.bigBtnTextRest : styles.bigBtnTextStart}>
                {training ? 'Rest' : 'Start Set'}
              </Text>
            </Pressable>
            {handsFreeHints.length > 0 && (
              <Text style={[shared.muted, styles.volumeHint]}>
                Tip: switch set/rest with {handsFreeHints.join(' · ')}
              </Text>
            )}
          </>
        )}
      </ScrollView>

      {/* Screen flash alert cue */}
      <Animated.View
        pointerEvents="none"
        style={[styles.flashOverlay, { opacity: flashAnim }]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  // Full-screen modal pages
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalBody: {
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 56,
    gap: 14,
  },
  // Session recap
  recapGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  recapStat: {
    width: '50%',
    paddingVertical: 8,
    gap: 2,
  },
  recapStatValue: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.text,
  },
  recapStatLabel: {
    fontSize: 12,
    color: colors.muted,
  },
  recapZoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recapZoneDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  recapZoneLabel: {
    width: 92,
    fontSize: 12,
    color: colors.text,
  },
  recapBarTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceRaised,
    overflow: 'hidden',
  },
  recapBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  recapZoneTime: {
    width: 44,
    textAlign: 'right',
    fontSize: 12,
    color: colors.muted,
    fontVariant: ['tabular-nums'],
  },
  // BLE card
  bleCard: {
    alignItems: 'center',
    paddingVertical: 36,
  },
  centerText: {
    textAlign: 'center',
  },
  fullBtn: {
    alignSelf: 'stretch',
  },
  connecting: {
    color: colors.muted,
    fontSize: 14,
  },
  bleError: {
    color: '#ef4444',
    fontSize: 13,
    marginTop: 4,
    textAlign: 'center',
  },
  divider: {
    color: colors.muted,
    fontSize: 11,
    letterSpacing: 2,
  },
  // BLE chip
  bleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bleDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#34d399',
  },
  bleChipText: {
    flex: 1,
    fontSize: 12,
    color: colors.muted,
  },
  bleWarn: {
    color: '#fbbf24',
  },
  bleLink: {
    color: colors.muted,
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  // HR display
  hrCard: {
    alignItems: 'center',
    paddingVertical: 32,
    borderWidth: 2,
  },
  hrNumber: {
    fontSize: 88,
    fontWeight: '800',
    lineHeight: 92,
    fontVariant: ['tabular-nums'],
  },
  hrUnit: {
    fontSize: 14,
    letterSpacing: 2,
    color: colors.muted,
  },
  zoneTag: {
    paddingVertical: 4,
    paddingHorizontal: 14,
    borderRadius: 20,
    marginTop: 4,
  },
  zoneTagText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000',
  },
  // Feedback
  feedback: {
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    minHeight: 22,
  },
  // Zone bar
  zoneBarWrap: {
    position: 'relative',
    paddingBottom: 14,
  },
  zoneBar: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 6,
    overflow: 'hidden',
    gap: 2,
  },
  zoneMarker: {
    position: 'absolute',
    top: -5,
    marginLeft: -1.5,
    width: 3,
    height: 20,
    backgroundColor: '#fff',
    borderRadius: 2,
  },
  zoneBarLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  zoneBarLabelText: {
    fontSize: 12,
    color: colors.muted,
  },
  // Recovery progress
  progressTrack: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: 8,
    height: 10,
    overflow: 'hidden',
  },
  // Phase banner
  statusBanner: {
    borderRadius: 12,
    paddingVertical: 8,
    alignItems: 'center',
  },
  statusBannerText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 3,
  },
  // Single control button
  bigBtn: {
    paddingVertical: 17,
    borderRadius: 14,
    alignItems: 'center',
  },
  bigBtnStart: {
    backgroundColor: '#ef4444',
  },
  bigBtnTextStart: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  bigBtnRest: {
    backgroundColor: '#3b82f6',
  },
  bigBtnTextRest: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  volumeHint: {
    textAlign: 'center',
    fontSize: 12,
  },
  cardInactive: {
    opacity: 0.5,
  },
  // Constant-height body so swapping Zone ↔ Recovery doesn't shift the layout.
  phaseBody: {
    minHeight: 80,
    gap: 12,
    justifyContent: 'center',
  },
  flashOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(239, 68, 68, 0.22)',
  },
})

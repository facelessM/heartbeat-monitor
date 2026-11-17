import { useState } from 'react'
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import Slider from '@react-native-community/slider'
import {
  useAlerts,
  type AlertKind,
  CLAP_THRESHOLD_MIN,
  CLAP_THRESHOLD_MAX,
} from '../hooks/useAlerts'
import { useClapControl } from '../hooks/useClapControl'
import { colors, shared } from '../theme'

const ALERT_OPTIONS: { kind: AlertKind; icon: string; label: string; desc: string }[] = [
  { kind: 'vibration', icon: '📳', label: 'Vibration', desc: 'Buzz on important alerts' },
  { kind: 'sound', icon: '🔊', label: 'Sound', desc: 'Audible beep on important alerts' },
  { kind: 'flash', icon: '⚡', label: 'Screen flash', desc: 'Flash the screen on alerts' },
]

// Hands-free ways to toggle between Set and Rest. `supported` falls back to true
// for sensor-based controls (available on virtually any device).
const HANDSFREE_OPTIONS: {
  kind: AlertKind
  icon: string
  label: string
  desc: string
  supported: boolean
}[] = [
  { kind: 'volumeButtons', icon: '🎚️', label: 'Volume buttons', desc: 'Volume Up = set · Volume Down = rest', supported: true },
  { kind: 'shake', icon: '📲', label: 'Shake to toggle', desc: 'Shake the phone to switch set/rest', supported: true },
  { kind: 'clap', icon: '👏', label: 'Clap to toggle', desc: 'Clap to switch set/rest', supported: true },
]

interface Props {
  alerts: ReturnType<typeof useAlerts>
  // Whether the Settings tab is the active screen — gates the clap-tuner mic so
  // it isn't recording in the background or fighting the monitor's listener.
  active: boolean
}

export function SettingsScreen({ alerts, active }: Props) {
  // Live mic level (dBFS) for the clap-sensitivity meter. Runs only while this
  // tab is showing and clap is enabled, so you can tune the threshold here.
  const [clapLevel, setClapLevel] = useState<number | null>(null)
  useClapControl(
    active && alerts.settings.clap,
    () => {},
    alerts.settings.clapThreshold,
    setClapLevel,
  )

  // Clap meter geometry — map dB onto the threshold axis [MIN..MAX] as percentages.
  const clapRange = CLAP_THRESHOLD_MAX - CLAP_THRESHOLD_MIN
  const pctOnAxis = (db: number) =>
    Math.max(0, Math.min(100, ((db - CLAP_THRESHOLD_MIN) / clapRange) * 100))
  const clapThresholdPct = pctOnAxis(alerts.settings.clapThreshold)
  const clapLevelPct = clapLevel == null ? 0 : pctOnAxis(clapLevel)
  const clapLevelActive = clapLevel != null && clapLevel >= alerts.settings.clapThreshold

  return (
    <ScrollView style={shared.screen} contentContainerStyle={styles.body}>
      <Text style={shared.appTitle}>Settings</Text>

      <View style={shared.card}>
        <Text style={shared.sectionLabel}>Alert settings</Text>
        <Text style={shared.muted}>
          Choose how you're notified when your heart rate spikes or you've recovered enough for
          the next set.
        </Text>
        <View style={styles.alertOptions}>
          {ALERT_OPTIONS.map((opt, i) => {
            const disabled = opt.kind === 'vibration' && !alerts.vibrationSupported
            return (
              <View
                key={opt.kind}
                style={[
                  styles.alertOption,
                  i > 0 && styles.alertOptionDivider,
                  disabled && styles.alertOptionDisabled,
                ]}
              >
                <Text style={styles.alertIcon}>{opt.icon}</Text>
                <View style={styles.alertText}>
                  <Text style={styles.alertLabel}>{opt.label}</Text>
                  <Text style={styles.alertDesc}>
                    {disabled ? 'Not supported on this device' : opt.desc}
                  </Text>
                </View>
                <Switch
                  value={alerts.settings[opt.kind] && !disabled}
                  disabled={disabled}
                  onValueChange={() => alerts.toggle(opt.kind)}
                  trackColor={{ false: colors.surfaceRaised, true: colors.accent }}
                  thumbColor="#fff"
                />
              </View>
            )
          })}
        </View>

        <Text style={[shared.sectionLabel, styles.voiceSectionLabel]}>Hands-free control</Text>
        <Text style={shared.muted}>
          Switch between Set and Rest without touching the screen.
        </Text>
        <View style={styles.alertOptions}>
          {HANDSFREE_OPTIONS.map((opt, i) => (
            <View
              key={opt.kind}
              style={[
                styles.alertOption,
                i > 0 && styles.alertOptionDivider,
                !opt.supported && styles.alertOptionDisabled,
              ]}
            >
              <Text style={styles.alertIcon}>{opt.icon}</Text>
              <View style={styles.alertText}>
                <Text style={styles.alertLabel}>{opt.label}</Text>
                <Text style={styles.alertDesc}>
                  {opt.supported ? opt.desc : 'Not supported on this device'}
                </Text>
              </View>
              <Switch
                value={alerts.settings[opt.kind] && opt.supported}
                disabled={!opt.supported}
                onValueChange={() => alerts.toggle(opt.kind)}
                trackColor={{ false: colors.surfaceRaised, true: colors.accent }}
                thumbColor="#fff"
              />
            </View>
          ))}
        </View>

        {alerts.settings.clap && (
          <View style={styles.clapTuner}>
            <View style={styles.clapTunerHead}>
              <Text style={styles.alertLabel}>Clap sensitivity</Text>
              <Text style={shared.muted}>
                {clapLevel != null ? `now ${Math.round(clapLevel)} dB · ` : ''}trigger{' '}
                {alerts.settings.clapThreshold} dB
              </Text>
            </View>

            {/* Live mic level (fill) with the trigger threshold marked on the
                same dB scale as the slider below. */}
            <View style={styles.meterTrack}>
              <View
                style={[
                  styles.meterFill,
                  {
                    width: `${clapLevelPct}%`,
                    backgroundColor: clapLevelActive ? '#ef4444' : '#34d399',
                  },
                ]}
              />
              <View style={[styles.meterMarker, { left: `${clapThresholdPct}%` }]} />
            </View>

            {/* Threshold slider on a direct dB axis (aligned with the meter). */}
            <Slider
              style={styles.clapSlider}
              minimumValue={CLAP_THRESHOLD_MIN}
              maximumValue={CLAP_THRESHOLD_MAX}
              step={1}
              value={alerts.settings.clapThreshold}
              onValueChange={v => alerts.setClapThreshold(v)}
              minimumTrackTintColor={colors.border}
              maximumTrackTintColor={colors.border}
              thumbTintColor={colors.accent}
            />
            <View style={styles.clapTunerHead}>
              <Text style={styles.alertDesc}>More sensitive</Text>
              <Text style={styles.alertDesc}>Less sensitive</Text>
            </View>
            <Text style={styles.alertDesc}>
              {clapLevel == null
                ? 'Clap near the mic — the bar shows your level so you can set the marker just above the background.'
                : 'Set the marker just above the background level — claps spike past it.'}
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  body: {
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 24,
    gap: 14,
  },
  alertOptions: {
    gap: 0,
  },
  alertOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  alertOptionDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  alertOptionDisabled: {
    opacity: 0.5,
  },
  alertIcon: {
    fontSize: 20,
    width: 26,
    textAlign: 'center',
  },
  alertText: {
    flex: 1,
    gap: 2,
  },
  alertLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  alertDesc: {
    fontSize: 12,
    color: colors.muted,
  },
  voiceSectionLabel: {
    marginTop: 4,
  },
  clapTuner: {
    gap: 2,
    paddingTop: 4,
  },
  clapTunerHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  clapSlider: {
    width: '100%',
    height: 36,
  },
  meterTrack: {
    position: 'relative',
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.surfaceRaised,
    marginTop: 4,
  },
  meterFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 8,
  },
  meterMarker: {
    position: 'absolute',
    top: -3,
    bottom: -3,
    width: 2,
    marginLeft: -1,
    backgroundColor: colors.text,
  },
})

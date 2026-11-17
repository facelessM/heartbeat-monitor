import { useRef, useState, type ReactNode } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import Slider from '@react-native-community/slider'
import type { UserProfile, HRProfile, Sex } from '../types'
import { buildHRProfile } from '../utils/hrCalculations'
import { colors, shared } from '../theme'

interface Props {
  onComplete: (profile: UserProfile, hrProfile: HRProfile) => void
  // When provided, the form acts as an "edit profile" screen: fields are
  // pre-filled, zones show immediately, and the big app title is hidden (the
  // hosting modal supplies its own header).
  initialProfile?: UserProfile
  initialRecoveryTarget?: number
  submitLabel?: string
  // Heading shown in edit mode (the first-run flow uses the app title instead).
  title?: string
  // Extra content rendered below the submit button (e.g. a "start over" action).
  footer?: ReactNode
}

export function Onboarding({
  onComplete,
  initialProfile,
  initialRecoveryTarget,
  submitLabel = 'Start Monitoring',
  title,
  footer,
}: Props) {
  const editing = initialProfile != null

  const [age, setAge] = useState(initialProfile ? String(initialProfile.age) : '30')
  const [sex, setSex] = useState<Sex>(initialProfile?.sex ?? 'male')
  const [height, setHeight] = useState(initialProfile?.height ? String(initialProfile.height) : '')
  const [weight, setWeight] = useState(initialProfile?.weight ? String(initialProfile.weight) : '')
  const [restingHRStr, setRestingHRStr] = useState(
    initialProfile ? String(initialProfile.restingHR) : '65',
  )
  // In edit mode, build the zones up front so they're visible without first
  // tapping "Calculate Zones".
  const [hrProfile, setHRProfile] = useState<HRProfile | null>(() =>
    initialProfile ? buildHRProfile(initialProfile, initialRecoveryTarget) : null,
  )
  const [recoveryTarget, setRecoveryTarget] = useState(() =>
    initialProfile
      ? buildHRProfile(initialProfile, initialRecoveryTarget).recoveryTarget
      : 0,
  )

  const scrollRef = useRef<ScrollView>(null)
  // Set when "Calculate Zones" is pressed so the next content-size change (the
  // zones card appearing) auto-scrolls to reveal them + the Start button.
  const scrollOnNextGrowth = useRef(false)

  const buildFromFields = (): UserProfile => ({
    age: Math.max(10, Math.min(100, Number(age) || 30)),
    sex,
    height: Number(height) || 0,
    weight: Number(weight) || 0,
    restingHR: Math.max(40, Math.min(100, Number(restingHRStr) || 65)),
  })

  const handleCalculate = () => {
    const user = buildFromFields()
    const profile = buildHRProfile(user)
    setHRProfile(profile)
    setRecoveryTarget(profile.recoveryTarget)
    scrollOnNextGrowth.current = true
  }

  // Rebuild from the current field values so edits made after the last
  // "Calculate" are never silently dropped.
  const handleStart = () => {
    const user = buildFromFields()
    onComplete(user, buildHRProfile(user, recoveryTarget))
  }

  return (
    <ScrollView
      ref={scrollRef}
      style={shared.screen}
      contentContainerStyle={[shared.container, editing && styles.editContainer]}
      keyboardShouldPersistTaps="handled"
      onContentSizeChange={() => {
        if (scrollOnNextGrowth.current) {
          scrollOnNextGrowth.current = false
          scrollRef.current?.scrollToEnd({ animated: true })
        }
      }}
    >
      {!editing && (
        <>
          <Text style={shared.appTitle}>HeartBeat Monitor</Text>
          <Text style={shared.subtitle}>Smarter rest intervals based on your physiology</Text>
        </>
      )}
      {editing && title && <Text style={shared.appTitle}>{title}</Text>}

      <View style={shared.card}>
        <Text style={shared.cardHeading}>Your Profile</Text>
        <View style={styles.formGrid}>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Age</Text>
            <TextInput
              style={styles.input}
              value={age}
              onChangeText={setAge}
              keyboardType="number-pad"
              placeholderTextColor={colors.muted}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Sex</Text>
            <View style={styles.segment}>
              {(['male', 'female'] as Sex[]).map(option => {
                const active = sex === option
                return (
                  <Pressable
                    key={option}
                    onPress={() => setSex(option)}
                    style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                  >
                    <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                      {option === 'male' ? 'Male' : 'Female'}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>
              Height (cm) <Text style={styles.optional}>optional</Text>
            </Text>
            <TextInput
              style={styles.input}
              value={height}
              onChangeText={setHeight}
              keyboardType="number-pad"
              placeholderTextColor={colors.muted}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>
              Weight (kg) <Text style={styles.optional}>optional</Text>
            </Text>
            <TextInput
              style={styles.input}
              value={weight}
              onChangeText={setWeight}
              keyboardType="number-pad"
              placeholderTextColor={colors.muted}
            />
          </View>

          <View style={styles.fieldFull}>
            <Text style={styles.fieldLabel}>
              Resting Heart Rate (bpm){' '}
              <Text style={styles.optional}>optional — defaults to 65</Text>
            </Text>
            <TextInput
              style={styles.input}
              value={restingHRStr}
              onChangeText={setRestingHRStr}
              keyboardType="number-pad"
              placeholderTextColor={colors.muted}
            />
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [shared.btnPrimary, pressed && shared.pressed]}
          onPress={handleCalculate}
        >
          <Text style={shared.btnPrimaryText}>Calculate Zones</Text>
        </Pressable>
      </View>

      {hrProfile && (
        <View style={shared.card}>
          <Text style={shared.cardHeading}>Your Heart Rate Zones</Text>
          <Text style={shared.muted}>
            Max HR: {hrProfile.maxHR} bpm · HR Reserve: {hrProfile.reserve} bpm
          </Text>

          <View style={styles.zoneList}>
            {hrProfile.zones.map(zone => (
              <View key={zone.number} style={styles.zoneRow}>
                <View style={[styles.zoneBadge, { backgroundColor: zone.color }]}>
                  <Text style={styles.zoneBadgeText}>Z{zone.number}</Text>
                </View>
                <View style={styles.zoneInfo}>
                  <Text style={styles.zoneInfoLabel}>{zone.label}</Text>
                  <Text style={shared.muted}>
                    {zone.min}–{zone.max} bpm
                  </Text>
                </View>
              </View>
            ))}
          </View>

          <View style={styles.recoverySection}>
            <Text style={styles.recoveryHeading}>Recovery Target</Text>
            <Text style={shared.muted}>Next set starts when HR drops below this value</Text>
            <View style={styles.sliderRow}>
              <Text style={shared.muted}>{hrProfile.zones[0].min}</Text>
              <Slider
                style={styles.slider}
                minimumValue={hrProfile.zones[0].min}
                maximumValue={hrProfile.zones[2].min}
                step={1}
                value={recoveryTarget}
                onValueChange={setRecoveryTarget}
                minimumTrackTintColor={colors.accent}
                maximumTrackTintColor={colors.border}
                thumbTintColor={colors.accent}
              />
              <Text style={shared.muted}>{hrProfile.zones[2].min}</Text>
            </View>
            <Text style={styles.recoveryValue}>{Math.round(recoveryTarget)} bpm</Text>
          </View>

          <Pressable
            style={({ pressed }) => [shared.btnPrimary, pressed && shared.pressed]}
            onPress={handleStart}
          >
            <Text style={shared.btnPrimaryText}>{submitLabel}</Text>
          </Pressable>
        </View>
      )}

      {footer}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  // In edit mode the hosting modal already provides top padding + a header.
  editContainer: {
    paddingTop: 16,
  },
  formGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  field: {
    width: '48%',
    gap: 5,
  },
  fieldFull: {
    width: '100%',
    gap: 5,
  },
  fieldLabel: {
    fontSize: 13,
    color: colors.muted,
  },
  optional: {
    fontSize: 11,
    color: colors.muted,
    opacity: 0.6,
  },
  input: {
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    color: colors.text,
    fontSize: 15,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    overflow: 'hidden',
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
  },
  segmentBtnActive: {
    backgroundColor: colors.accent,
  },
  segmentText: {
    color: colors.text,
    fontSize: 14,
  },
  segmentTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  zoneList: {
    gap: 8,
  },
  zoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  zoneBadge: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoneBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000',
  },
  zoneInfo: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  zoneInfoLabel: {
    fontSize: 14,
    color: colors.text,
  },
  recoverySection: {
    gap: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  recoveryHeading: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  slider: {
    flex: 1,
    height: 40,
  },
  recoveryValue: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.accent,
    textAlign: 'center',
  },
})

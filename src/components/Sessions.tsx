import { ScrollView, StyleSheet, Pressable, Text, View } from 'react-native'
import type { HRProfile } from '../types'
import type { SessionRecap } from '../hooks/useSessionRecap'
import { colors, shared } from '../theme'

interface Props {
  sessions: SessionRecap[]
  // Current zones — used only for the stacked-bar colors.
  hrProfile: HRProfile
  onClear: () => void
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const fmtWhen = (ms: number) => {
  const d = new Date(ms)
  const hh = d.getHours().toString().padStart(2, '0')
  const mm = d.getMinutes().toString().padStart(2, '0')
  return `${MONTHS[d.getMonth()]} ${d.getDate()} · ${hh}:${mm}`
}

const fmtDuration = (ms: number) => {
  const total = Math.round(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function Sessions({ sessions, hrProfile, onClear }: Props) {
  return (
    <ScrollView style={shared.screen} contentContainerStyle={styles.body}>
      <Text style={shared.appTitle}>Sessions</Text>

      {sessions.length === 0 ? (
        <View style={[shared.card, styles.empty]}>
          <Text style={styles.emptyIcon}>🏁</Text>
          <Text style={[shared.muted, styles.emptyText]}>
            No sessions yet. Finish a workout and it'll show up here with your stats.
          </Text>
        </View>
      ) : (
        <>
          {sessions.map(s => {
            const total = s.zoneMs.reduce((a, b) => a + b, 0)
            return (
              <View key={s.endedAt} style={shared.card}>
                <View style={styles.cardHead}>
                  <Text style={styles.when}>{fmtWhen(s.endedAt)}</Text>
                  <Text style={shared.muted}>{fmtDuration(s.durationMs)}</Text>
                </View>

                <View style={styles.statRow}>
                  <Stat value={String(s.sets)} label="sets" />
                  <Stat value={String(s.avgHR)} label="avg bpm" />
                  <Stat value={String(s.maxHR)} label="max bpm" />
                </View>

                {/* Stacked time-in-zone bar. */}
                {total > 0 && (
                  <View style={styles.stackBar}>
                    {hrProfile.zones.map((z, i) => {
                      const ms = s.zoneMs[i] ?? 0
                      if (ms <= 0) return null
                      return (
                        <View
                          key={z.number}
                          style={{ width: `${(ms / total) * 100}%`, backgroundColor: z.color }}
                        />
                      )
                    })}
                  </View>
                )}
              </View>
            )
          })}

          <Pressable
            style={({ pressed }) => [shared.btnSecondary, pressed && shared.pressed]}
            onPress={onClear}
          >
            <Text style={shared.btnSecondaryText}>Clear history</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
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
  empty: {
    alignItems: 'center',
    paddingVertical: 36,
    gap: 10,
  },
  emptyIcon: {
    fontSize: 36,
  },
  emptyText: {
    textAlign: 'center',
  },
  cardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  when: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  statRow: {
    flexDirection: 'row',
  },
  stat: {
    flex: 1,
    gap: 2,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  statLabel: {
    fontSize: 11,
    color: colors.muted,
  },
  stackBar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: colors.surfaceRaised,
  },
})

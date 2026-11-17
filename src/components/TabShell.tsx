import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { UserProfile, HRProfile } from '../types'
import { useAlerts } from '../hooks/useAlerts'
import { useSessionHistory } from '../hooks/useSessionHistory'
import { Monitor } from './Monitor'
import { Sessions } from './Sessions'
import { ProfileScreen } from './ProfileScreen'
import { SettingsScreen } from './SettingsScreen'
import { colors } from '../theme'

type Tab = 'monitor' | 'sessions' | 'profile' | 'settings'

const TABS: { key: Tab; icon: string; label: string }[] = [
  { key: 'monitor', icon: '❤️', label: 'Monitor' },
  { key: 'sessions', icon: '📊', label: 'Sessions' },
  { key: 'profile', icon: '👤', label: 'Profile' },
  { key: 'settings', icon: '⚙️', label: 'Settings' },
]

interface Props {
  userProfile: UserProfile
  hrProfile: HRProfile
  onUpdateProfile: (profile: UserProfile, hrProfile: HRProfile) => void
  onReset: () => void
}

// Bottom-tab shell. Shared state (alerts, session history) lives here so the
// Monitor and the Settings/Sessions tabs all read one source of truth. The
// Monitor stays mounted across tab switches (hidden, not unmounted) so the live
// heart-rate session keeps running while you visit other tabs.
export function TabShell({ userProfile, hrProfile, onUpdateProfile, onReset }: Props) {
  const [tab, setTab] = useState<Tab>('monitor')
  const insets = useSafeAreaInsets()
  const alerts = useAlerts()
  const history = useSessionHistory()

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        <View style={[styles.screen, tab !== 'monitor' && styles.hidden]}>
          <Monitor
            hrProfile={hrProfile}
            alerts={alerts}
            active={tab === 'monitor'}
            onSessionEnd={history.add}
          />
        </View>

        {tab === 'sessions' && (
          <Sessions sessions={history.sessions} hrProfile={hrProfile} onClear={history.clear} />
        )}
        {tab === 'profile' && (
          <ProfileScreen
            userProfile={userProfile}
            hrProfile={hrProfile}
            onUpdateProfile={onUpdateProfile}
            onSaved={() => setTab('monitor')}
            onReset={onReset}
          />
        )}
        {tab === 'settings' && (
          <SettingsScreen alerts={alerts} active={tab === 'settings'} />
        )}
      </View>

      <View style={[styles.tabBar, { paddingBottom: 10 + insets.bottom }]}>
        {TABS.map(t => {
          const activeTab = tab === t.key
          return (
            <Pressable key={t.key} style={styles.tab} onPress={() => setTab(t.key)} hitSlop={4}>
              <Text style={[styles.tabIcon, !activeTab && styles.tabInactive]}>{t.icon}</Text>
              <Text style={[styles.tabLabel, activeTab ? styles.tabLabelActive : styles.tabInactive]}>
                {t.label}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    flex: 1,
  },
  screen: {
    flex: 1,
  },
  // Keep the monitor mounted but out of layout when another tab is active.
  hidden: {
    display: 'none',
  },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    paddingTop: 8,
    // paddingBottom is applied inline (base + safe-area inset).
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  tabIcon: {
    fontSize: 20,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  tabLabelActive: {
    color: colors.accent,
  },
  tabInactive: {
    opacity: 0.5,
    color: colors.muted,
  },
})

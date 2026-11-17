import { useState } from 'react'
import { View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { Onboarding } from './src/components/Onboarding'
import { TabShell } from './src/components/TabShell'
import type { UserProfile, HRProfile } from './src/types'
import { shared } from './src/theme'

export default function App() {
  const [session, setSession] = useState<{ user: UserProfile; hr: HRProfile } | null>(null)

  return (
    <SafeAreaProvider>
      <View style={shared.screen}>
        <StatusBar style="light" />
        {!session ? (
          <Onboarding onComplete={(user, hr) => setSession({ user, hr })} />
        ) : (
          <TabShell
            userProfile={session.user}
            hrProfile={session.hr}
            onUpdateProfile={(user, hr) => setSession({ user, hr })}
            onReset={() => setSession(null)}
          />
        )}
      </View>
    </SafeAreaProvider>
  )
}

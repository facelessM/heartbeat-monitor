import { Pressable, Text } from 'react-native'
import { Onboarding } from './Onboarding'
import type { UserProfile, HRProfile } from '../types'
import { shared } from '../theme'

interface Props {
  userProfile: UserProfile
  hrProfile: HRProfile
  onUpdateProfile: (profile: UserProfile, hrProfile: HRProfile) => void
  // Called after a successful save (so the shell can return to the monitor).
  onSaved: () => void
  // Discard the profile entirely and return to first-run onboarding.
  onReset: () => void
}

// The Profile tab: re-uses the onboarding form pre-filled with the saved values
// so the user can edit their profile, or start over with a fresh one.
export function ProfileScreen({ userProfile, hrProfile, onUpdateProfile, onSaved, onReset }: Props) {
  return (
    <Onboarding
      title="Profile"
      initialProfile={userProfile}
      initialRecoveryTarget={hrProfile.recoveryTarget}
      submitLabel="Save changes"
      onComplete={(user, hr) => {
        onUpdateProfile(user, hr)
        onSaved()
      }}
      footer={
        <Pressable
          style={({ pressed }) => [shared.btnSecondary, pressed && shared.pressed]}
          onPress={onReset}
        >
          <Text style={shared.btnSecondaryText}>Start over with a new profile</Text>
        </Pressable>
      }
    />
  )
}

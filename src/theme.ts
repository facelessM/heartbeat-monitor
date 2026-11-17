import { StyleSheet } from 'react-native'

// Palette ported from the old web `index.css` :root variables.
export const colors = {
  bg: '#0d0d0d',
  surface: '#1c1c1e',
  surfaceRaised: '#2c2c2e',
  text: '#f2f2f7',
  muted: '#8e8e93',
  border: '#3a3a3c',
  accent: '#ff375f',
}

// Shared styles reused across screens. Component-specific styles live in their
// own StyleSheet; the zone hex colors stay inline on the elements that use them.
export const shared = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  // Mirrors the old `.onboarding`/`.monitor` container (max-width 460, centered).
  container: {
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 56,
    gap: 14,
  },
  appTitle: {
    fontSize: 29,
    fontWeight: '700',
    textAlign: 'center',
    color: colors.text,
  },
  appTitleSm: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    textAlign: 'center',
    color: colors.muted,
    fontSize: 14,
  },
  muted: {
    color: colors.muted,
    fontSize: 13,
  },
  sectionLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: colors.muted,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: 20,
    gap: 12,
  },
  cardHeading: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
  },
  // Buttons
  btnPrimary: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  btnPrimaryText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  btnSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  btnSecondaryText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  btnGhostText: {
    color: colors.muted,
    fontSize: 16,
    paddingVertical: 4,
  },
  pressed: {
    opacity: 0.6,
  },
})

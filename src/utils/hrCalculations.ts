import type { UserProfile, Zone, HRProfile } from '../types'

export function calcMaxHR(age: number): number {
  return Math.round(208 - 0.7 * age) // Tanaka formula
}

export function buildHRProfile(user: UserProfile, recoveryTarget?: number): HRProfile {
  const maxHR = calcMaxHR(user.age)
  const { restingHR } = user
  const reserve = maxHR - restingHR
  const k = (pct: number) => Math.round(reserve * pct + restingHR)

  const zones: Zone[] = [
    { number: 1, label: 'Recovery',     color: '#60a5fa', min: k(0.50), max: k(0.60) - 1 },
    { number: 2, label: 'Aerobic Base', color: '#34d399', min: k(0.60), max: k(0.70) - 1 },
    { number: 3, label: 'Aerobic',      color: '#fbbf24', min: k(0.70), max: k(0.80) - 1 },
    { number: 4, label: 'Threshold',    color: '#f97316', min: k(0.80), max: k(0.90) - 1 },
    { number: 5, label: 'Max Effort',   color: '#ef4444', min: k(0.90), max: maxHR },
  ]

  // Clamp the recovery target to a sane range. It must stay below the working
  // zone (Z3) so recovery always has a span to fill; allowing it to reach the
  // working HR (or higher) makes the recovery progress bar divide by ≤ 0.
  const defaultTarget = k(0.60)
  const clampedTarget =
    recoveryTarget == null
      ? defaultTarget
      : Math.max(zones[0].min, Math.min(zones[2].min, recoveryTarget))

  return {
    maxHR,
    restingHR,
    reserve,
    zones,
    recoveryTarget: clampedTarget,
  }
}

export function getZone(hr: number, zones: Zone[]): Zone | null {
  return zones.find(z => hr >= z.min && hr <= z.max) ?? null
}

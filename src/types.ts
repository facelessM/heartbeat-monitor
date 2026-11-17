export type Sex = 'male' | 'female'

export interface UserProfile {
  age: number
  sex: Sex
  height: number    // cm, 0 if not provided
  weight: number    // kg, 0 if not provided
  restingHR: number
}

export interface Zone {
  number: number
  label: string
  color: string
  min: number
  max: number
}

export interface HRProfile {
  maxHR: number
  restingHR: number
  reserve: number
  zones: Zone[]
  recoveryTarget: number
}

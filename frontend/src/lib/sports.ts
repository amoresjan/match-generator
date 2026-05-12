export type SportType = 'pickleball' | 'tennis' | 'badminton' | 'ping_pong' | 'padel' | 'others'

export const SPORTS = [
  { value: 'pickleball' as SportType, label: 'Pickleball', emoji: '🥒', themeClass: 'sport-pickleball' },
  { value: 'tennis' as SportType, label: 'Tennis', emoji: '🎾', themeClass: 'sport-tennis' },
  { value: 'badminton' as SportType, label: 'Badminton', emoji: '🏸', themeClass: 'sport-badminton' },
  { value: 'ping_pong' as SportType, label: 'Ping Pong', emoji: '🏓', themeClass: 'sport-ping-pong' },
  { value: 'padel' as SportType, label: 'Padel', emoji: '🎾', themeClass: 'sport-padel' },
  { value: 'others' as SportType, label: 'Other', emoji: '🏅', themeClass: 'sport-others' },
]

export function getSport(value: SportType) {
  return SPORTS.find((s) => s.value === value) ?? SPORTS[0]
}

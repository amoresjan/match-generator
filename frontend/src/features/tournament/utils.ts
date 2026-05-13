export function getRoundName(round: number, numRounds: number): string {
  if (round === numRounds)     return 'Final'
  if (round === numRounds - 1) return 'Semis'
  if (round === numRounds - 2) return 'Quarters'
  return `Round ${round}`
}

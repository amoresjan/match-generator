import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { Player } from './types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function partitionPlayers(players: Player[]): {
  duoPairs: [Player, Player][]
  solos: Player[]
} {
  const sorted = [...players].sort((a, b) => a.name.localeCompare(b.name))
  const seen = new Set<string>()
  const duoPairs: [Player, Player][] = []
  const solos: Player[] = []

  for (const player of sorted) {
    if (seen.has(player.id)) continue
    if (player.permanent_partner_id) {
      const partner = sorted.find((p) => p.id === player.permanent_partner_id)
      if (partner) {
        duoPairs.push([player, partner])
        seen.add(player.id)
        seen.add(partner.id)
        continue
      }
    }
    solos.push(player)
  }

  return { duoPairs, solos }
}

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
  const seen = new Set<string>()
  const duoPairs: [Player, Player][] = []
  const solos: Player[] = []

  for (const player of players) {
    if (seen.has(player.id)) continue
    if (player.permanent_partner_id) {
      const partner = players.find((p) => p.id === player.permanent_partner_id)
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

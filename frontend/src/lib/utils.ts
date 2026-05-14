import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { Player, Round } from '@/types'

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

export function resolveNames(ids: string[], players: Player[], removedPlayers: Record<string, string> = {}): string {
  return ids.map((id) => players.find((p) => p.id === id)?.name ?? removedPlayers[id] ?? '?').join(' & ')
}

export function resolveMembers(
  ids: string[],
  players: Player[],
  removedPlayers: Record<string, string> = {},
  fallback = '?',
): { id: string; name: string }[] {
  return ids.map((id) => ({ id, name: players.find((p) => p.id === id)?.name ?? removedPlayers[id] ?? fallback }))
}

export function isDuo(ids: string[], players: Player[]): boolean {
  if (ids.length !== 2) return false
  const a = players.find((p) => p.id === ids[0])
  return a?.permanent_partner_id === ids[1]
}

export interface PlayerStat {
  player: Player
  played: number
  wins: number
  losses: number
}

export function computeStats(players: Player[], rounds: Round[]): PlayerStat[] {
  const stats = new Map<string, PlayerStat>(
    players.map((p) => [p.id, { player: p, played: 0, wins: 0, losses: 0 }])
  )

  for (const round of rounds) {
    for (const match of round.matches) {
      if (match.winner === null) continue
      const winnerIds = match.winner === 'team1' ? match.team1_players : match.team2_players
      const loserIds = match.winner === 'team1' ? match.team2_players : match.team1_players

      for (const id of winnerIds) {
        const s = stats.get(id)
        if (s) { s.played++; s.wins++ }
      }
      for (const id of loserIds) {
        const s = stats.get(id)
        if (s) { s.played++; s.losses++ }
      }
    }
  }

  return [...stats.values()]
    .filter((s) => s.played > 0)
    .sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins
      const aRate = a.played ? a.wins / a.played : 0
      const bRate = b.played ? b.wins / b.played : 0
      if (bRate !== aRate) return bRate - aRate
      return b.played - a.played
    })
}

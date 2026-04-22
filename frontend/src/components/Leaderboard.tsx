import { Trophy } from 'lucide-react'
import type { Player, Round } from '@/lib/types'

interface PlayerStat {
  player: Player
  played: number
  wins: number
  losses: number
}

function computeStats(players: Player[], rounds: Round[]): PlayerStat[] {
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

export function Leaderboard({ players, rounds }: { players: Player[]; rounds: Round[] }) {
  const stats = computeStats(players, rounds)

  if (stats.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        No results recorded yet. Tap a winning team on the court card to start tracking.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[auto_1fr_repeat(3,_auto)] gap-x-4 gap-y-0 px-3 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
        <span>#</span>
        <span>Player</span>
        <span className="text-center">W</span>
        <span className="text-center">L</span>
        <span className="text-center">GP</span>
      </div>

      {stats.map((s, i) => {
        const rank = i + 1
        return (
          <div
            key={s.player.id}
            className={[
              'grid grid-cols-[auto_1fr_repeat(3,_auto)] gap-x-4 items-center rounded-lg border px-3 py-3',
              rank === 1 ? 'border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20' : '',
            ].join(' ')}
          >
            <span className="text-sm font-bold w-5 text-center text-muted-foreground">
              {rank === 1 ? <Trophy className="h-4 w-4 text-yellow-500" /> : rank}
            </span>
            <span className="font-medium text-sm truncate">{s.player.name}</span>
            <span className="text-sm font-semibold text-green-600 text-center w-6">{s.wins}</span>
            <span className="text-sm text-muted-foreground text-center w-6">{s.losses}</span>
            <span className="text-sm text-muted-foreground text-center w-6">{s.played}</span>
          </div>
        )
      })}
    </div>
  )
}

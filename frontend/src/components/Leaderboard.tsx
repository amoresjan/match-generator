import { ChevronDown, ChevronUp, Trophy } from 'lucide-react'
import { useState } from 'react'
import type { Match, Player, Round } from '@/lib/types'

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

function isTied(a: PlayerStat, b: PlayerStat): boolean {
  if (a.wins !== b.wins) return false
  const aRate = a.played ? a.wins / a.played : 0
  const bRate = b.played ? b.wins / b.played : 0
  if (aRate !== bRate) return false
  return a.played === b.played
}

function assignRanks(stats: PlayerStat[]): number[] {
  const ranks: number[] = []
  for (let i = 0; i < stats.length; i++) {
    if (i === 0) {
      ranks.push(1)
    } else if (isTied(stats[i], stats[i - 1])) {
      ranks.push(ranks[i - 1])
    } else {
      ranks.push(i + 1)
    }
  }
  return ranks
}

const RANK_STYLES: Record<number, { border: string; bg: string }> = {
  1: { border: 'border-yellow-300', bg: 'bg-yellow-50 dark:bg-yellow-900/20' },
  2: { border: 'border-slate-400',  bg: 'bg-slate-50  dark:bg-slate-700/20'  },
  3: { border: 'border-amber-700',  bg: 'bg-amber-50  dark:bg-amber-900/20'  },
}

const RANK_ICON_CLASS: Record<number, string> = {
  1: 'text-yellow-500',
  2: 'text-slate-400',
  3: 'text-amber-700',
}

function resolveNames(ids: string[], players: Player[]): string {
  return ids.map((id) => players.find((p) => p.id === id)?.name ?? '?').join(' & ')
}

interface PlayerMatch {
  match: Match
  roundNumber: number
  result: 'W' | 'L'
  myTeam: string
  theirTeam: string
}

function getPlayerMatches(playerId: string, players: Player[], rounds: Round[]): PlayerMatch[] {
  const result: PlayerMatch[] = []
  for (const round of rounds) {
    for (const match of round.matches) {
      if (match.winner === null) continue
      const onTeam1 = match.team1_players.includes(playerId)
      const onTeam2 = match.team2_players.includes(playerId)
      if (!onTeam1 && !onTeam2) continue
      const won = (onTeam1 && match.winner === 'team1') || (onTeam2 && match.winner === 'team2')
      result.push({
        match,
        roundNumber: round.number,
        result: won ? 'W' : 'L',
        myTeam: resolveNames(onTeam1 ? match.team1_players : match.team2_players, players),
        theirTeam: resolveNames(onTeam1 ? match.team2_players : match.team1_players, players),
      })
    }
  }
  return result
}

export function Leaderboard({ players, rounds }: { players: Player[]; rounds: Round[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const stats = computeStats(players, rounds)

  if (stats.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        No results recorded yet. Tap a winning team on the court card to start tracking.
      </div>
    )
  }

  const ranks = assignRanks(stats)

  return (
    <table className="w-full text-sm border-separate border-spacing-y-1.5">
      <thead>
        <tr className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          <th className="text-center w-8 pb-1 font-medium">#</th>
          <th className="text-left pb-1 font-medium">Player</th>
          <th className="text-center w-10 pb-1 font-medium">GP</th>
          <th className="text-center w-10 pb-1 font-medium">W</th>
          <th className="text-center w-10 pb-1 font-medium">L</th>
        </tr>
      </thead>
      <tbody>
        {stats.map((s, i) => {
          const rank = ranks[i]
          const isFirst = rank === 1
          const style = RANK_STYLES[rank]
          const border = style?.border ?? 'border-border'
          const bg = style?.bg ?? 'bg-card'
          const isExpanded = expandedId === s.player.id
          const playerMatches = getPlayerMatches(s.player.id, players, rounds)
          const py = isFirst ? 'py-3.5' : 'py-2.5'

          return (
            <>
              <tr
                key={s.player.id}
                className={`cursor-pointer animate-card-enter ${isFirst ? 'animate-gold-glow' : ''}`}
                style={{ animationDelay: `${i * 60}ms` }}
                onClick={() => setExpandedId(isExpanded ? null : s.player.id)}
              >
                <td className={`text-center font-bold text-muted-foreground ${py} pl-3 rounded-l-lg border-y border-l w-8 ${border} ${bg}`}>
                  {rank <= 3
                    ? <Trophy className={`${isFirst ? 'h-5 w-5' : 'h-4 w-4'} mx-auto ${RANK_ICON_CLASS[rank]}`} />
                    : rank}
                </td>
                <td className={`font-medium truncate ${py} ${isFirst ? 'text-base' : ''} border-y ${border} ${bg}`}>
                  {s.player.name}
                </td>
                <td className={`text-center text-muted-foreground ${py} w-10 border-y ${border} ${bg}`}>
                  {s.played}
                </td>
                <td className={`text-center font-semibold text-green-600 ${py} ${isFirst ? 'text-base' : ''} w-10 border-y ${border} ${bg}`}>
                  {s.wins}
                </td>
                <td className={`relative text-center text-muted-foreground ${py} pr-3 rounded-r-lg border-y border-r w-10 ${border} ${bg}`}>
                  {s.losses}
                  <span className="absolute right-2 top-1/2 -translate-y-1/2">
                    {isExpanded
                      ? <ChevronUp className="h-3 w-3 text-muted-foreground/60" />
                      : <ChevronDown className="h-3 w-3 text-muted-foreground/60" />}
                  </span>
                </td>
              </tr>
              <tr key={`${s.player.id}-matches`}>
                <td colSpan={5} className="pt-0">
                  <div
                    className="grid transition-all duration-300 ease-in-out"
                    style={{ gridTemplateRows: isExpanded ? '1fr' : '0fr' }}
                  >
                    <div className="overflow-hidden">
                      <div className="pb-2">
                        <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
                          {playerMatches.length === 0 ? (
                            <p className="text-xs text-muted-foreground text-center py-1">No recorded results yet</p>
                          ) : (
                            <table className="w-full text-xs border-separate border-spacing-y-0.5">
                              <colgroup>
                                <col className="w-5" />
                                <col className="w-8" />
                                <col />
                                <col className="w-6" />
                                <col />
                              </colgroup>
                              <tbody>
                                {playerMatches.map((pm) => (
                                  <tr key={pm.match.id}>
                                    <td className={`font-bold pr-1 ${pm.result === 'W' ? 'text-green-600' : 'text-muted-foreground'}`}>
                                      {pm.result}
                                    </td>
                                    <td className="text-muted-foreground pr-2">R{pm.roundNumber}</td>
                                    <td className="font-medium">{pm.myTeam}</td>
                                    <td className="text-muted-foreground text-center px-1">vs</td>
                                    <td className="text-muted-foreground">{pm.theirTeam}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            </>
          )
        })}
      </tbody>
    </table>
  )
}

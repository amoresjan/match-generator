import { ChevronDown, Trophy } from 'lucide-react'
import { useState } from 'react'
import { computeStats, resolveNames } from '@/lib/utils'
import type { PlayerStat } from '@/lib/utils'
import type { Match, Player, Round } from '@/types'

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

const RANK_ROW: Record<number, { border: string; bg: string }> = {
  1: { border: 'border-yellow-300/80 dark:border-yellow-700/40', bg: 'bg-yellow-50/70 dark:bg-yellow-900/10' },
  2: { border: 'border-slate-300/70 dark:border-slate-600/40',   bg: 'bg-slate-50/60 dark:bg-slate-700/10'   },
  3: { border: 'border-amber-300/70 dark:border-amber-700/40',   bg: 'bg-amber-50/60 dark:bg-amber-900/10'   },
}

const TROPHY_CLASS: Record<number, string> = {
  1: 'h-5 w-5 text-yellow-500',
  2: 'h-4 w-4 text-slate-400',
  3: 'h-4 w-4 text-amber-600',
}

export function Leaderboard({
  players,
  rounds,
  currentPlayerId,
}: {
  players: Player[]
  rounds: Round[]
  currentPlayerId?: string
}) {
  const [expandedId, setExpandedId] = useState<string | null>(currentPlayerId ?? null)
  const stats = computeStats(players, rounds)

  if (stats.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        No results yet. Open the Round tab and tap the winning team on any court.
      </div>
    )
  }

  const ranks = assignRanks(stats)

  return (
    <div className="space-y-1.5">
      {stats.map((s, i) => {
        const rank = ranks[i]
        const isMe = s.player.id === currentPlayerId
        const isExpanded = expandedId === s.player.id
        const isPodium = rank <= 3
        const podiumStyle = RANK_ROW[rank]
        const rowBorder = isMe && !isPodium
          ? 'border-primary/30 dark:border-primary/30'
          : (podiumStyle?.border ?? 'border-border')
        const rowBg = isMe && !isPodium
          ? 'bg-primary/5 dark:bg-primary/10'
          : (podiumStyle?.bg ?? 'bg-card')
        const playerMatches = getPlayerMatches(s.player.id, players, rounds)

        const winRate = s.played >= 2 ? Math.round((s.wins / s.played) * 100) : null
        const drawerWins = playerMatches.filter((m) => m.result === 'W').length
        const drawerLosses = playerMatches.filter((m) => m.result === 'L').length

        return (
          <div
            key={s.player.id}
            className="animate-card-enter"
            style={{ animationDelay: `${Math.min(i * 60, 300)}ms` }}
          >
            <button
              className={`w-full flex items-center gap-3 px-3 rounded-xl border text-left transition-transform active:scale-[0.99]
                ${rank === 1 ? 'py-3.5 animate-gold-glow' : 'py-2.5'}
                ${rowBorder} ${rowBg}
              `}
              onClick={() => setExpandedId(isExpanded ? null : s.player.id)}
              aria-expanded={isExpanded}
              aria-label={`${s.player.name}: view match history`}
            >
              <div className="w-7 shrink-0 flex justify-center">
                {isPodium
                  ? <Trophy className={TROPHY_CLASS[rank]} />
                  : <span className="text-[11px] font-semibold text-muted-foreground bg-muted rounded px-1.5 py-0.5 tabular-nums leading-none">{rank}</span>}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className={`truncate font-semibold ${rank === 1 ? 'text-base' : 'text-sm'} ${isMe ? 'font-bold' : ''}`}>
                    {s.player.name}
                  </span>
                  {isMe && (
                    <span className="shrink-0 text-[10px] font-semibold text-primary bg-primary/15 rounded-full px-1.5 py-0.5 leading-none">
                      You
                    </span>
                  )}
                </div>
                {winRate !== null && (
                  <span className="text-[11px] text-muted-foreground tabular-nums">{winRate}% win rate</span>
                )}
              </div>

              <div className="flex items-baseline gap-1 shrink-0 tabular-nums">
                <span className={`font-bold text-primary ${rank === 1 ? 'text-base' : 'text-sm'}`}>{s.wins}W</span>
                <span className="text-muted-foreground/40 text-xs mx-0.5">·</span>
                <span className="text-sm text-foreground/60">{s.losses}L</span>
              </div>

              <ChevronDown
                className={`h-3.5 w-3.5 text-muted-foreground/50 shrink-0 transition-transform duration-200 ease-out ${isExpanded ? 'rotate-180' : ''}`}
              />
            </button>

            <div
              className="grid transition-all duration-300 ease-out"
              style={{ gridTemplateRows: isExpanded ? '1fr' : '0fr' }}
            >
              <div className="overflow-hidden">
                <div className="pt-1 pb-2">
                  <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 mx-0.5">
                    {playerMatches.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-1">No recorded results yet</p>
                    ) : (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 pb-1.5 mb-0.5 border-b border-border/50">
                          <span className="text-xs font-semibold text-primary tabular-nums">{drawerWins}W</span>
                          <span className="text-muted-foreground/40 text-xs">·</span>
                          <span className="text-xs text-foreground/60 tabular-nums">{drawerLosses}L</span>
                          <span className="text-xs text-muted-foreground">this session</span>
                        </div>
                        {playerMatches.map((pm) => (
                          <div key={pm.match.id} className="flex items-baseline gap-2 text-xs">
                            <span className={`flex-shrink-0 w-4 font-bold text-center ${pm.result === 'W' ? 'text-primary' : 'text-foreground/50'}`}>
                              {pm.result}
                            </span>
                            <span className="flex-shrink-0 text-muted-foreground tabular-nums">Rd {pm.roundNumber}</span>
                            <span className="font-medium truncate min-w-0">{pm.myTeam}</span>
                            <span className="flex-shrink-0 text-muted-foreground/60">vs</span>
                            <span className="text-muted-foreground truncate min-w-0">{pm.theirTeam}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

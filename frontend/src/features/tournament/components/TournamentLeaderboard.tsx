import { useState } from 'react'
import { ChevronDown, Trophy } from 'lucide-react'
import { getRoundName } from '../utils'
import type { Round, TournamentBracket as Bracket, TournamentMatchSlot, TournamentTeam } from '@/types'

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

interface Props {
  bracket: Bracket
  rounds: Round[]
  currentPlayerId?: string
}

export function TournamentLeaderboard({ bracket, rounds, currentPlayerId }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { teams, match_slots, num_rounds } = bracket

  const slotByMatchId: Record<string, TournamentMatchSlot> = {}
  for (const slot of match_slots) {
    if (slot.db_match_id) slotByMatchId[slot.db_match_id] = slot
  }

  function findTeam(playerIds: string[]): TournamentTeam | null {
    return teams.find(t =>
      t.player_ids.length === playerIds.length &&
      playerIds.every(id => t.player_ids.includes(id))
    ) ?? null
  }

  interface TeamMatch { matchId: string; roundName: string; result: 'W' | 'L'; opponentName: string }
  const statsMap: Record<string, { team: TournamentTeam; wins: number; losses: number; matches: TeamMatch[] }> = {}
  for (const t of teams) statsMap[t.id] = { team: t, wins: 0, losses: 0, matches: [] }

  for (const round of rounds) {
    for (const match of round.matches) {
      if (!match.winner) continue
      const t1 = findTeam(match.team1_players)
      const t2 = findTeam(match.team2_players)
      if (!t1 || !t2) continue
      const slot = slotByMatchId[match.id]
      const roundName = slot ? getRoundName(slot.round, num_rounds) : `Round ${round.number}`
      const t1Won = match.winner === 'team1'
      statsMap[t1.id].matches.push({ matchId: match.id, roundName, result: t1Won ? 'W' : 'L', opponentName: t2.name })
      statsMap[t2.id].matches.push({ matchId: match.id, roundName, result: t1Won ? 'L' : 'W', opponentName: t1.name })
      if (t1Won) { statsMap[t1.id].wins++; statsMap[t2.id].losses++ }
      else       { statsMap[t2.id].wins++; statsMap[t1.id].losses++ }
    }
  }

  const eliminationRound: Record<string, number> = {}
  for (const slot of match_slots) {
    if (slot.status !== 'done' || !slot.winner_id) continue
    const loserId = slot.top_team_id === slot.winner_id ? slot.bottom_team_id : slot.top_team_id
    if (loserId) eliminationRound[loserId] = slot.round
  }
  const champId = bracket.champion_team_id
  const elimRound = (teamId: string) =>
    teamId === champId ? num_rounds + 1 : (eliminationRound[teamId] ?? 0)

  const stats = Object.values(statsMap).sort((a, b) => {
    const diff = elimRound(b.team.id) - elimRound(a.team.id)
    return diff !== 0 ? diff : a.team.seed - b.team.seed
  })

  const ranks: number[] = []
  for (let i = 0; i < stats.length; i++) {
    ranks.push(i === 0 || elimRound(stats[i].team.id) !== elimRound(stats[i - 1].team.id) ? i + 1 : ranks[i - 1])
  }

  return (
    <div className="space-y-1.5">
      {stats.map((s, i) => {
        const rank = ranks[i]
        const isFirst = rank === 1
        const isPodium = rank <= 3
        const isMe = currentPlayerId !== undefined && s.team.player_ids.includes(currentPlayerId)
        const isExpanded = expandedId === s.team.id
        const podiumStyle = RANK_ROW[rank]
        const rowBorder = isMe && !isPodium
          ? 'border-primary/30 dark:border-primary/30'
          : (podiumStyle?.border ?? 'border-border')
        const rowBg = isMe && !isPodium
          ? 'bg-primary/5 dark:bg-primary/10'
          : (podiumStyle?.bg ?? 'bg-card')

        return (
          <div
            key={s.team.id}
            className="animate-card-enter"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <button
              className={`w-full flex items-center gap-3 px-3 rounded-xl border text-left transition-transform active:scale-[0.99]
                ${isFirst ? 'py-3.5 animate-gold-glow' : 'py-2.5'}
                ${rowBorder} ${rowBg}
              `}
              onClick={() => setExpandedId(isExpanded ? null : s.team.id)}
              aria-expanded={isExpanded}
            >
              <div className="w-7 flex-shrink-0 flex justify-center">
                {isPodium
                  ? <Trophy className={TROPHY_CLASS[rank]} />
                  : <span className="text-sm font-bold text-muted-foreground tabular-nums">{rank}</span>}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className={`truncate font-semibold ${isFirst ? 'text-base' : 'text-sm'} ${isMe ? 'font-bold' : ''}`}>
                    {s.team.name}
                  </span>
                  {isMe && (
                    <span className="flex-shrink-0 text-[10px] font-semibold text-primary bg-primary/10 rounded px-1.5 py-0.5 leading-none">
                      You
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-baseline gap-1 flex-shrink-0 tabular-nums">
                <span className={`font-bold text-green-600 ${isFirst ? 'text-base' : 'text-sm'}`}>{s.wins}W</span>
                <span className="text-muted-foreground/40 text-xs mx-0.5">·</span>
                <span className="text-sm text-muted-foreground">{s.losses}L</span>
              </div>

              <ChevronDown
                aria-hidden="true"
                className={`h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
              />
            </button>

            <div
              className="grid transition-all duration-300 ease-in-out"
              style={{ gridTemplateRows: isExpanded ? '1fr' : '0fr' }}
            >
              <div className="overflow-hidden">
                <div className="pt-1 pb-2">
                  <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 mx-0.5">
                    {s.matches.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-1">No matches recorded yet</p>
                    ) : (
                      <div className="space-y-1">
                        {s.matches.map(m => (
                          <div key={m.matchId} className="flex items-baseline gap-2 text-xs">
                            <span className={`flex-shrink-0 w-4 font-bold text-center ${m.result === 'W' ? 'text-green-600' : 'text-muted-foreground'}`}>
                              {m.result}
                            </span>
                            <span className="flex-shrink-0 text-muted-foreground">{m.roundName}</span>
                            <span className="flex-shrink-0 text-muted-foreground/60">vs</span>
                            <span className="text-muted-foreground truncate min-w-0">{m.opponentName}</span>
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

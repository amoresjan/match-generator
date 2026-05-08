import { useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Loader2, Trophy } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { Round, TournamentBracket as Bracket, TournamentMatchSlot, TournamentTeam } from '@/lib/types'

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

const SLOT_H = 88
const BOX_H  = 60
const COL_W  = 152
const CONN_W = 36

function getRoundName(round: number, numRounds: number): string {
  if (round === numRounds) return 'Final'
  if (round === numRounds - 1) return 'Semis'
  if (round === numRounds - 2) return 'Quarters'
  return `Round ${round}`
}

function slotCenterY(pos: number, countInRound: number, totalHeight: number): number {
  return ((2 * pos + 1) * totalHeight) / (2 * countInRound)
}

// ---------------------------------------------------------------------------
// Connector SVG
// ---------------------------------------------------------------------------

interface ConnectorProps {
  leftSlots: TournamentMatchSlot[]
  rightSlots: TournamentMatchSlot[]
  totalHeight: number
}

function ConnectorLines({ leftSlots, rightSlots, totalHeight }: ConnectorProps) {
  const leftCount = leftSlots.length
  const MID = CONN_W / 2
  const paths: { key: string; d: string; done: boolean }[] = []

  for (const target of rightSlots) {
    if (!target.feeds || target.feeds.length < 2) continue
    const feedTop = leftSlots.find(s => s.id === target.feeds[0])
    const feedBot = leftSlots.find(s => s.id === target.feeds[1])
    if (!feedTop || !feedBot) continue

    const topY = slotCenterY(feedTop.position, leftCount, totalHeight)
    const botY = slotCenterY(feedBot.position, leftCount, totalHeight)
    const midY = (topY + botY) / 2
    const d = [
      `M 0 ${topY} H ${MID}`,
      `M 0 ${botY} H ${MID}`,
      `M ${MID} ${topY} V ${botY}`,
      `M ${MID} ${midY} H ${CONN_W}`,
    ].join(' ')

    const done = feedTop.status === 'done' && feedBot.status === 'done'
    paths.push({ key: target.id, d, done })
  }

  return (
    <svg
      width={CONN_W}
      height={totalHeight}
      className="shrink-0 overflow-visible self-start"
      style={{ marginTop: 28 }}
    >
      {paths.map(({ key, d, done }) => (
        <path key={key} d={d} fill="none"
          stroke={done ? 'hsl(var(--primary) / 0.35)' : 'hsl(var(--border))'}
          strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
        />
      ))}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Match box — bracket visualization, display only
// ---------------------------------------------------------------------------

interface MatchBoxProps {
  slot: TournamentMatchSlot
  topTeam: TournamentTeam | null
  bottomTeam: TournamentTeam | null
  isActive: boolean
  isChampion?: boolean
}

function MatchBox({ slot, topTeam, bottomTeam, isActive, isChampion }: MatchBoxProps) {
  const isDone    = slot.status === 'done'
  const isPending = slot.status === 'pending'
  const isTopWin  = isDone && slot.winner_id === slot.top_team_id
  const isTopBye  = slot.is_bye && !slot.top_team_id
  const isBotBye  = slot.is_bye && !slot.bottom_team_id

  function TeamRow({ team, isWinner, isBye }: { team: TournamentTeam | null; isWinner: boolean; isBye: boolean }) {
    if (isBye) return (
      <div className="px-2 py-1.5 text-[11px] text-muted-foreground/40 italic leading-tight">BYE</div>
    )
    return (
      <div className={`px-2 py-1.5 text-[11px] font-medium truncate leading-tight ${
        isWinner  ? 'text-primary font-semibold' :
        isDone    ? 'text-muted-foreground/50 line-through' :
        isPending ? 'text-muted-foreground/40' : ''
      }`}>
        {team?.name ?? <span className="text-muted-foreground/30 italic">TBD</span>}
      </div>
    )
  }

  return (
    <div
      className={[
        'rounded-lg border overflow-hidden bg-background w-full transition-all',
        isChampion ? 'border-yellow-300 animate-gold-glow' :
        isActive   ? 'border-primary ring-2 ring-primary/20 shadow-sm' :
        isDone     ? 'border-border/40 opacity-70' :
        isPending  ? 'border-dashed border-border/30' : 'border-border',
      ].join(' ')}
      style={{ height: BOX_H }}
    >
      <TeamRow team={topTeam}    isWinner={isTopWin}           isBye={isTopBye} />
      <div className="border-t border-dashed border-border/40 mx-2" />
      <TeamRow team={bottomTeam} isWinner={!isTopWin && isDone} isBye={isBotBye} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tournament court card — CourtCard-style with confirm dialog
// ---------------------------------------------------------------------------

interface CourtCardProps {
  slot: TournamentMatchSlot
  topTeam: TournamentTeam | null
  bottomTeam: TournamentTeam | null
  roundName: string
  courtLabel: string | null
  isAdmin: boolean
  onAdvance: (matchSlotId: string, winnerTeamId: string) => void
  isPending: boolean
}

function TournamentCourtCard({ slot, topTeam, bottomTeam, roundName, courtLabel, isAdmin, onAdvance, isPending }: CourtCardProps) {
  const [pendingWinner, setPendingWinner] = useState<TournamentTeam | null>(null)
  const [poppedSide, setPoppedSide] = useState<'top' | 'bottom' | null>(null)
  const popTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleClick(side: 'top' | 'bottom') {
    if (!isAdmin || isPending) return
    const team = side === 'top' ? topTeam : bottomTeam
    if (!team) return
    setPendingWinner(team)
  }

  function handleConfirm() {
    if (!pendingWinner) return
    const side = pendingWinner.id === topTeam?.id ? 'top' : 'bottom'
    if (popTimer.current) clearTimeout(popTimer.current)
    setPoppedSide(side)
    popTimer.current = setTimeout(() => setPoppedSide(null), 300)
    onAdvance(slot.id, pendingWinner.id)
    setPendingWinner(null)
  }

  const teamBtn = (side: 'top' | 'bottom', team: TournamentTeam | null) => (
    <button
      disabled={!isAdmin || isPending || !team}
      onClick={() => handleClick(side)}
      className={[
        'relative rounded-md px-3 py-2 text-center font-medium transition-all w-full',
        isAdmin && team ? 'cursor-pointer active:scale-95' : 'cursor-default',
        poppedSide === side ? 'animate-winner-pop' : '',
        'bg-muted/40 hover:bg-muted',
      ].join(' ')}
    >
      {team?.name ?? <span className="text-muted-foreground/40 italic text-xs">TBD</span>}
    </button>
  )

  return (
    <>
      <Card className="w-full">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{roundName}</CardTitle>
            <div className="flex items-center gap-2">
              {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              {courtLabel && <span className="text-xs text-muted-foreground">{courtLabel}</span>}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-1.5 text-sm">
            {teamBtn('top', topTeam)}
            <span className="text-muted-foreground font-bold text-xs text-center">vs</span>
            {teamBtn('bottom', bottomTeam)}
          </div>
          {isAdmin && (
            <p className="text-[10px] text-muted-foreground text-center mt-2">
              Tap the winning team to record result
            </p>
          )}
        </CardContent>
      </Card>

      {pendingWinner && (
        <Dialog open onOpenChange={open => { if (!open) setPendingWinner(null) }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Declare Winner?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Declare <span className="font-semibold text-foreground">{pendingWinner.name}</span> as the winner of this match? This cannot be undone.
            </p>
            <div className="flex gap-2 mt-2">
              <Button variant="outline" className="flex-1" onClick={() => setPendingWinner(null)}>
                Cancel
              </Button>
              <Button className="flex-1" disabled={isPending} onClick={handleConfirm}>
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// TournamentCourts — active match cards for the Courts tab
// ---------------------------------------------------------------------------

interface CourtsProps {
  bracket: Bracket
  isAdmin: boolean
  onAdvance: (matchSlotId: string, winnerTeamId: string) => void
  isPending: boolean
}

export function TournamentCourts({ bracket, isAdmin, onAdvance, isPending }: CourtsProps) {
  const { match_slots, teams, num_rounds, status } = bracket

  const activeIds: Set<string> = new Set(
    bracket.active_match_ids?.length
      ? bracket.active_match_ids
      : bracket.current_match_id
      ? [bracket.current_match_id]
      : []
  )

  const teamsById = Object.fromEntries(teams.map(t => [t.id, t]))
  const activeSlots = match_slots.filter(s => activeIds.has(s.id))

  if (status === 'complete') return null

  if (!activeSlots.length) {
    return (
      <p className="text-center text-muted-foreground text-sm py-16">
        No active matches right now.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {activeSlots.map((slot, i) => {
        const top = slot.top_team_id ? teamsById[slot.top_team_id] : null
        const bot = slot.bottom_team_id ? teamsById[slot.bottom_team_id] : null
        return (
          <TournamentCourtCard
            key={slot.id}
            slot={slot}
            topTeam={top}
            bottomTeam={bot}
            roundName={getRoundName(slot.round, num_rounds)}
            courtLabel={activeSlots.length > 1 ? `Court ${i + 1}` : null}
            isAdmin={isAdmin}
            onAdvance={onAdvance}
            isPending={isPending}
          />
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// TournamentBracket — bracket visualization + champion banner
// ---------------------------------------------------------------------------

interface BracketProps {
  bracket: Bracket
}

export function TournamentBracket({ bracket }: BracketProps) {
  const { match_slots, teams, bracket_size, num_rounds, champion_team_id } = bracket

  const activeIds: Set<string> = new Set(
    bracket.active_match_ids?.length
      ? bracket.active_match_ids
      : bracket.current_match_id
      ? [bracket.current_match_id]
      : []
  )

  const teamsById = Object.fromEntries(teams.map(t => [t.id, t]))
  const champion  = champion_team_id ? teamsById[champion_team_id] : null
  const totalH    = bracket_size * SLOT_H

  const rounds = Array.from({ length: num_rounds }, (_, i) =>
    match_slots.filter(s => s.round === i + 1).sort((a, b) => a.position - b.position)
  )

  return (
    <div className="space-y-4">
      {champion && (
        <div className="rounded-xl border-2 border-primary bg-primary/5 px-4 py-3 flex items-center gap-3">
          <Trophy className="h-5 w-5 text-primary shrink-0" />
          <div>
            <p className="text-xs text-primary font-medium uppercase tracking-wide">Champion</p>
            <p className="font-bold text-sm">{champion.name}</p>
          </div>
        </div>
      )}

      <div className="overflow-x-auto -mx-4 px-4 pb-2">
        <div className="flex items-start min-w-max">
          {rounds.map((roundSlots, roundIdx) => {
            const countInRound = roundSlots.length
            const roundNum = roundIdx + 1
            return (
              <div key={roundNum} className="flex items-start">
                <div className="flex flex-col" style={{ width: COL_W }}>
                  <p className="text-[10px] font-medium text-muted-foreground text-center mb-2 uppercase tracking-wide">
                    {getRoundName(roundNum, num_rounds)}
                  </p>
                  <div className="relative" style={{ height: totalH }}>
                    {roundSlots.map(slot => {
                      const centerY    = slotCenterY(slot.position, countInRound, totalH)
                      const topY       = centerY - BOX_H / 2
                      const isActive   = activeIds.has(slot.id)
                      const isChampion = !!champion && slot.round === num_rounds && slot.status === 'done'
                      return (
                        <div key={slot.id} className="absolute w-full" style={{ top: topY }}>
                          <MatchBox
                            slot={slot}
                            topTeam={slot.top_team_id ? teamsById[slot.top_team_id] : null}
                            bottomTeam={slot.bottom_team_id ? teamsById[slot.bottom_team_id] : null}
                            isActive={isActive}
                            isChampion={isChampion}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>

                {roundIdx < rounds.length - 1 && (
                  <ConnectorLines
                    leftSlots={roundSlots}
                    rightSlots={rounds[roundIdx + 1]}
                    totalHeight={totalH}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// TournamentLeaderboard — team-based standings with match history
// ---------------------------------------------------------------------------

interface LeaderboardProps {
  bracket: Bracket
  rounds: Round[]
  currentPlayerId?: string
}

export function TournamentLeaderboard({ bracket, rounds, currentPlayerId }: LeaderboardProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { teams, match_slots, num_rounds } = bracket

  // db_match_id → slot for round-name lookup
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
  const statsMap: Record<string, { team: TournamentTeam; wins: number; matches: TeamMatch[] }> = {}
  for (const t of teams) statsMap[t.id] = { team: t, wins: 0, matches: [] }

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
      if (t1Won) statsMap[t1.id].wins++; else statsMap[t2.id].wins++
    }
  }

  // Rank by bracket placement: which round was each team eliminated in?
  // Champion (never eliminated) → num_rounds + 1; finalist → num_rounds; etc.
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
    <table className="w-full text-sm border-separate border-spacing-y-1.5">
      <thead>
        <tr className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          <th className="text-center w-8 pb-1 font-medium">#</th>
          <th className="text-left pb-1 font-medium">Team</th>
        </tr>
      </thead>
      <tbody>
        {stats.map((s, i) => {
          const rank = ranks[i]
          const isFirst = rank === 1
          const isMe = currentPlayerId !== undefined && s.team.player_ids.includes(currentPlayerId)
          const style = RANK_STYLES[rank]
          const border = isMe ? 'border-primary' : (style?.border ?? 'border-border')
          const bg = isMe ? 'bg-primary/5 dark:bg-primary/10' : (style?.bg ?? 'bg-card')
          const isExpanded = expandedId === s.team.id
          const py = isFirst ? 'py-3.5' : 'py-2.5'

          return (
            <>
              <tr
                key={s.team.id}
                tabIndex={0}
                aria-expanded={isExpanded}
                className={`cursor-pointer animate-card-enter ${isFirst ? 'animate-gold-glow' : ''}`}
                style={{ animationDelay: `${i * 60}ms` }}
                onClick={() => setExpandedId(isExpanded ? null : s.team.id)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedId(isExpanded ? null : s.team.id) } }}
              >
                <td className={`text-center font-bold text-muted-foreground ${py} pl-3 rounded-l-lg border-y border-l w-8 ${border} ${bg}`}>
                  {rank <= 3
                    ? <Trophy className={`${isFirst ? 'h-5 w-5' : 'h-4 w-4'} mx-auto ${RANK_ICON_CLASS[rank]}`} />
                    : rank}
                </td>
                <td className={`${py} ${isFirst ? 'text-base' : ''} border-y border-r rounded-r-lg pr-3 ${border} ${bg}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`font-medium truncate ${isMe ? 'font-bold' : ''}`}>
                      {s.team.name}
                      {isMe && <span className="ml-1.5 text-[10px] font-semibold text-primary bg-primary/10 rounded px-1 py-0.5">You</span>}
                    </span>
                    {isExpanded
                      ? <ChevronUp className="h-3 w-3 text-muted-foreground/60 shrink-0" />
                      : <ChevronDown className="h-3 w-3 text-muted-foreground/60 shrink-0" />}
                  </div>
                </td>
              </tr>
              <tr key={`${s.team.id}-detail`}>
                <td colSpan={2} className="pt-0">
                  <div className="grid transition-all duration-300 ease-in-out" style={{ gridTemplateRows: isExpanded ? '1fr' : '0fr' }}>
                    <div className="overflow-hidden">
                      <div className="pb-2">
                        <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
                          {s.matches.length === 0 ? (
                            <p className="text-xs text-muted-foreground text-center py-1">No matches recorded yet</p>
                          ) : (
                            <table className="w-full text-xs border-separate border-spacing-y-0.5">
                              <tbody>
                                {s.matches.map(m => (
                                  <tr key={m.matchId}>
                                    <td className={`font-bold pr-2 ${m.result === 'W' ? 'text-green-600' : 'text-muted-foreground'}`}>{m.result}</td>
                                    <td className="text-muted-foreground pr-3 whitespace-nowrap">{m.roundName}</td>
                                    <td className="text-muted-foreground">vs {m.opponentName}</td>
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

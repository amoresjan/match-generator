import { useRef, useState } from 'react'
import { ChevronDown, Loader2, Trophy } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { Round, TournamentBracket as Bracket, TournamentMatchSlot, TournamentTeam } from '@/lib/types'

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

const SLOT_H = 88
const BOX_H  = 60
const COL_W  = 152
const CONN_W = 36

function getRoundName(round: number, numRounds: number): string {
  if (round === numRounds)     return 'Final'
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

interface MatchBoxTeamRowProps {
  team: TournamentTeam | null
  isWinner: boolean
  isBye: boolean
  isDone: boolean
  isPending: boolean
}

function MatchBoxTeamRow({ team, isWinner, isBye, isDone, isPending }: MatchBoxTeamRowProps) {
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
      <MatchBoxTeamRow team={topTeam}    isWinner={isTopWin}           isBye={isTopBye} isDone={isDone} isPending={isPending} />
      <div className="border-t border-dashed border-border/40 mx-2" />
      <MatchBoxTeamRow team={bottomTeam} isWinner={!isTopWin && isDone} isBye={isBotBye} isDone={isDone} isPending={isPending} />
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
        'relative w-full rounded-lg px-4 py-3.5 text-sm font-medium text-center transition-all',
        isAdmin && team ? 'cursor-pointer active:scale-95 hover:bg-muted' : 'cursor-default',
        poppedSide === side ? 'animate-winner-pop' : '',
        'bg-muted/40',
      ].join(' ')}
    >
      {team?.name ?? <span className="text-muted-foreground/40 italic text-xs">TBD</span>}
    </button>
  )

  return (
    <>
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{roundName}</span>
            {courtLabel && <span className="text-xs text-muted-foreground/50">· {courtLabel}</span>}
          </div>
          {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>

        <div className="flex flex-col gap-1.5">
          {teamBtn('top', topTeam)}
          <span className="text-[11px] font-medium text-muted-foreground/40 text-center select-none">vs</span>
          {teamBtn('bottom', bottomTeam)}
        </div>

        {isAdmin && (
          <p className="text-[10px] text-muted-foreground text-center">
            Tap the winning team to advance them
          </p>
        )}
      </div>

      {pendingWinner && (
        <Dialog open onOpenChange={open => { if (!open) setPendingWinner(null) }}>
          <DialogContent className="max-w-sm p-0 gap-0 overflow-hidden">
            <div className="px-6 pt-6 pb-4 space-y-1">
              <DialogTitle className="text-base font-semibold">Declare winner?</DialogTitle>
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{pendingWinner.name}</span> wins this match and advances. This cannot be undone.
              </p>
            </div>
            <div className="flex gap-2 px-6 pb-6">
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
      <p className="text-center text-sm text-muted-foreground py-16">
        No matches on right now.
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
        <div className="rounded-xl border-2 border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 px-4 py-3.5 flex items-center gap-3 animate-gold-glow">
          <Trophy className="h-5 w-5 text-yellow-500 shrink-0" />
          <div>
            <p className="text-[10px] font-semibold text-yellow-600 dark:text-yellow-400 uppercase tracking-widest">Champion</p>
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

import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { getRoundName } from '../utils'
import type { TournamentBracket as Bracket, TournamentMatchSlot, TournamentTeam } from '@/types'

interface CourtCardProps {
  slot: TournamentMatchSlot
  topTeam: TournamentTeam | null
  bottomTeam: TournamentTeam | null
  roundName: string
  courtLabel: string | null
  isAdmin: boolean
  showHint?: boolean
  onAdvance: (matchSlotId: string, winnerTeamId: string) => void
  isPending: boolean
}

function TournamentCourtCard({ slot, topTeam, bottomTeam, roundName, courtLabel, isAdmin, showHint, onAdvance, isPending }: CourtCardProps) {
  const [pendingWinner, setPendingWinner] = useState<TournamentTeam | null>(null)
  const [poppedSide, setPoppedSide] = useState<'top' | 'bottom' | null>(null)
  const popTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => { if (popTimer.current) clearTimeout(popTimer.current) }
  }, [])

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
      aria-label={team ? `Record win for ${team.name}` : undefined}
      className={[
        'relative w-full rounded-lg px-4 py-3.5 text-sm font-medium text-center transition-all overflow-hidden',
        isAdmin && team ? 'cursor-pointer active:scale-95 hover:bg-muted' : 'cursor-default',
        poppedSide === side ? 'animate-winner-pop' : '',
        'bg-muted/40',
      ].join(' ')}
    >
      <span className="block truncate">
        {team?.name ?? <span className="text-muted-foreground/40 italic text-xs">TBD</span>}
      </span>
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

        {isAdmin && showHint && (
          <p className="text-[10px] text-muted-foreground text-center">
            Tap a team to record the winner
          </p>
        )}
      </div>

      {pendingWinner && (
        <Dialog open onOpenChange={open => { if (!open) setPendingWinner(null) }}>
          <DialogContent className="max-w-sm p-0 gap-0 overflow-hidden">
            <div className="px-6 pt-6 pb-4 space-y-1">
              <DialogTitle className="text-base font-semibold">Record the winner?</DialogTitle>
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{pendingWinner.name}</span> wins this match and advances to the next round.
              </p>
            </div>
            <div className="flex gap-2 px-6 pb-6">
              <Button variant="outline" className="flex-1" onClick={() => setPendingWinner(null)}>
                Cancel
              </Button>
              <Button className="flex-1" disabled={isPending} onClick={handleConfirm}>
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Record win'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}

interface Props {
  bracket: Bracket
  isAdmin: boolean
  onAdvance: (matchSlotId: string, winnerTeamId: string) => void
  isPending: boolean
}

export function TournamentCourts({ bracket, isAdmin, onAdvance, isPending }: Props) {
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
        No active matches.
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
            showHint={i === 0}
            onAdvance={onAdvance}
            isPending={isPending}
          />
        )
      })}
    </div>
  )
}

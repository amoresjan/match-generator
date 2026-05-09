import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useOverrideMatch } from '@/hooks/useSession'
import { toast } from '@/lib/toast'
import { getSport } from '@/lib/sports'
import type { Match, Player } from '@/lib/types'
import type { SportType } from '@/lib/sports'

interface Props {
  sessionId: string
  match: Match | null
  players: Player[]
  matchType: '1v1' | '2v2'
  roundMatches: Match[]
  sportType: SportType
  open: boolean
  onClose: () => void
}

export function OverrideMatchDialog({ sessionId, match, players, matchType, roundMatches, sportType, open, onClose }: Props) {
  const sport = getSport(sportType)
  const teamSize = matchType === '2v2' ? 2 : 1
  const override = useOverrideMatch(sessionId)

  const busyPlayerIds = new Set(
    roundMatches
      .filter((m) => m.id !== match?.id)
      .flatMap((m) => [...m.team1_players, ...m.team2_players])
  )
  const sittingOutIds = new Set(players.filter((p) => p.sit_out).map((p) => p.id))

  const [team1, setTeam1] = useState<string[]>(match?.team1_players ?? [])
  const [team2, setTeam2] = useState<string[]>(match?.team2_players ?? [])

  // Cycle: unassigned → Team 1 → Team 2 → unassigned (one tap to switch teams)
  function togglePlayer(id: string) {
    if (team1.includes(id)) {
      setTeam1(team1.filter((x) => x !== id))
      if (team2.length < teamSize) setTeam2([...team2, id])
    } else if (team2.includes(id)) {
      setTeam2(team2.filter((x) => x !== id))
    } else if (team1.length < teamSize) {
      setTeam1([...team1, id])
    } else if (team2.length < teamSize) {
      setTeam2([...team2, id])
    }
  }

  async function handleSave() {
    if (!match) return
    try {
      await override.mutateAsync({ matchId: match.id, team1_players: team1, team2_players: team2 })
      onClose()
    } catch {
      toast.error('Failed to save. Check your connection and try again.')
    }
  }

  const valid = team1.length === teamSize && team2.length === teamSize
  const hasUnavailable = busyPlayerIds.size > 0 || sittingOutIds.size > 0
  const instruction = teamSize === 1
    ? 'Tap a player to assign to Team 1. Tap again to switch to Team 2.'
    : 'Tap players to assign. Tap again to switch teams.'

  return (
    <Dialog key={match?.id} open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm overflow-hidden">
        {/* Sport-colored accent bar */}
        <div className="absolute top-0 inset-x-0 h-[3px] bg-primary" aria-hidden="true" />

        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            <span aria-hidden="true">{sport.emoji}</span>
            Court {match?.court_number}: Pick teams
          </DialogTitle>
        </DialogHeader>

        {/* Team slot counters */}
        <div className="flex gap-2">
          <div className="flex-1 flex items-center justify-between rounded-md bg-primary/10 px-3 py-2">
            <span className="text-xs text-primary/70 font-medium">Team 1</span>
            <span className="text-xs font-bold text-primary">{team1.length}/{teamSize}</span>
          </div>
          <div className="flex-1 flex items-center justify-between rounded-md bg-muted border border-dashed border-primary/30 px-3 py-2">
            <span className="text-xs text-muted-foreground font-medium">Team 2</span>
            <span className="text-xs font-bold text-foreground">{team2.length}/{teamSize}</span>
          </div>
        </div>

        <p className="text-xs text-muted-foreground -mt-1">{instruction}</p>

        {/* Player grid */}
        <div className="flex flex-wrap gap-2 rounded-md border p-3">
          {players.map((p) => {
            const inT1 = team1.includes(p.id)
            const inT2 = team2.includes(p.id)
            const busy = busyPlayerIds.has(p.id)
            const sittingOut = sittingOutIds.has(p.id)
            const unavailable = busy || sittingOut
            return (
              <button
                key={p.id}
                disabled={unavailable}
                onClick={() => togglePlayer(p.id)}
                title={busy ? 'Already on another court' : sittingOut ? 'Sitting out' : undefined}
                className={[
                  'px-2.5 py-1.5 rounded-md text-xs font-medium border transition-all',
                  unavailable
                    ? 'opacity-35 cursor-not-allowed bg-muted border-input text-muted-foreground'
                    : inT1
                      ? 'bg-primary text-primary-foreground border-primary'
                      : inT2
                        ? 'bg-primary/10 text-primary border-primary/40 ring-1 ring-inset ring-primary/25'
                        : 'bg-background hover:bg-muted border-input text-foreground active:scale-95',
                ].join(' ')}
              >
                {p.name}
              </button>
            )
          })}
        </div>

        {hasUnavailable && (
          <p className="text-[10px] text-muted-foreground/70 -mt-1">
            Dimmed players are on another court or sitting out.
          </p>
        )}

        <Button onClick={handleSave} disabled={!valid || override.isPending} className="w-full">
          {override.isPending
            ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Saving…</>
            : 'Confirm teams'}
        </Button>
      </DialogContent>
    </Dialog>
  )
}

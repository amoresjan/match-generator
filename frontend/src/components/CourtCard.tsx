import { AlertTriangle, Flame, Loader2, Pencil, Trophy, Users } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { isDuo } from '@/lib/utils'
import type { Match, Player } from '@/lib/types'

interface Props {
  match: Match
  players: Player[]
  removedPlayers?: Record<string, string>
  isAdmin?: boolean
  streakPlayerIds?: Set<string>
  currentPlayerId?: string
  onEdit?: (match: Match) => void
  onSetResult?: (matchId: string, winner: 'team1' | 'team2' | null) => void
  isPending?: boolean
}

function resolveMembers(ids: string[], players: Player[], removedPlayers: Record<string, string> = {}): { id: string; name: string }[] {
  return ids.map((id) => ({ id, name: players.find((p) => p.id === id)?.name ?? removedPlayers[id] ?? '?' }))
}

export function CourtCard({ match, players, removedPlayers = {}, isAdmin, streakPlayerIds, currentPlayerId, onEdit, onSetResult, isPending }: Props) {
  const team1 = resolveMembers(match.team1_players, players, removedPlayers)
  const team2 = resolveMembers(match.team2_players, players, removedPlayers)
  const team1IsDuo = isDuo(match.team1_players, players)
  const team2IsDuo = isDuo(match.team2_players, players)

  const allMatchPlayerIds = [...match.team1_players, ...match.team2_players]
  const sittingOutInMatch = players.filter((p) => allMatchPlayerIds.includes(p.id) && p.sit_out)
  const sitOutWarning = sittingOutInMatch.length > 0
    ? `${sittingOutInMatch.map((p) => p.name).join(', ')} ${sittingOutInMatch.length === 1 ? 'is' : 'are'} sitting out — consider overriding this match`
    : null

  const [poppedSide, setPoppedSide] = useState<'team1' | 'team2' | null>(null)
  const popTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const prevWinner = useRef(match.winner)
  const [winnerJustSet, setWinnerJustSet] = useState(false)

  useEffect(() => {
    if (match.winner !== null && prevWinner.current === null) {
      setWinnerJustSet(true)
      const t = setTimeout(() => setWinnerJustSet(false), 450)
      prevWinner.current = match.winner
      return () => clearTimeout(t)
    }
    prevWinner.current = match.winner
  }, [match.winner])

  function handleTeamClick(side: 'team1' | 'team2') {
    if (!onSetResult) return
    const next = match.winner === side ? null : side
    if (next !== null) {
      if (popTimer.current) clearTimeout(popTimer.current)
      setPoppedSide(side)
      popTimer.current = setTimeout(() => setPoppedSide(null), 300)
    }
    onSetResult(match.id, next)
  }

  const team1Won = match.winner === 'team1'
  const team2Won = match.winner === 'team2'
  const hasResult = match.winner !== null

  const isMyCard = currentPlayerId !== undefined &&
    (match.team1_players.includes(currentPlayerId) || match.team2_players.includes(currentPlayerId))

  return (
    <Card className={`w-full relative ${isMyCard ? 'ring-2 ring-primary border-primary' : ''}`}>
      {isMyCard && (
        <span className="pointer-events-none absolute inset-0 rounded-xl animate-my-card-pulse" aria-hidden="true" />
      )}

      {/* Court label row */}
      <div className="flex items-center justify-between px-3 pt-3 pb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Court {match.court_number}
        </span>
        <div className="flex items-center gap-1">
          {isPending && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          {isAdmin && onEdit && (
            <Button
              size="icon"
              variant="ghost"
              onClick={() => onEdit(match)}
              className="h-6 w-6 -mr-1"
              disabled={isPending}
              aria-label={`Edit Court ${match.court_number}`}
            >
              <Pencil className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Matchup */}
      <div className="px-3 pb-3 flex flex-col gap-1.5">
        {/* Team 1 */}
        <button
          aria-label={`Team 1: ${team1.map(m => m.name).join(' and ')}${team1Won ? ' — winner' : ''}`}
          aria-pressed={team1Won}
          disabled={!isAdmin || !onSetResult || isPending}
          onClick={() => handleTeamClick('team1')}
          className={[
            'relative rounded-md px-3 py-2.5 text-center text-sm font-medium transition-all w-full',
            isAdmin && onSetResult ? 'cursor-pointer active:scale-95' : 'cursor-default',
            poppedSide === 'team1' ? 'animate-winner-pop' : '',
            team1Won
              ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
              : hasResult
                ? 'bg-muted/40 text-muted-foreground/50'
                : 'bg-muted/40 hover:bg-muted',
          ].join(' ')}
        >
          {team1Won && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2">
              <Trophy className={`h-3 w-3 shrink-0${winnerJustSet ? ' animate-duo-form' : ''}`} />
            </span>
          )}
          <span className="flex items-center justify-center gap-1">
            {team1.map((m, i) => (
              <span key={m.id} className="flex items-center gap-0.5">
                {i > 0 && <span className="text-muted-foreground/60">&amp;</span>}
                <span className={m.id === currentPlayerId ? 'font-bold underline underline-offset-2' : ''}>{m.name}</span>
                {streakPlayerIds?.has(m.id) && <Flame className="h-3 w-3 text-orange-500 shrink-0" />}
              </span>
            ))}
            {team1IsDuo && <Users aria-label="Permanent partners" className="h-3 w-3 shrink-0 opacity-50" />}
          </span>
        </button>

        {/* Ruled "vs" divider */}
        <div className="flex items-center gap-2 px-1">
          <div className="h-px flex-1 bg-border" />
          <span className="text-[9px] font-semibold tracking-[0.12em] text-muted-foreground/50 uppercase">vs</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        {/* Team 2 */}
        <button
          aria-label={`Team 2: ${team2.map(m => m.name).join(' and ')}${team2Won ? ' — winner' : ''}`}
          aria-pressed={team2Won}
          disabled={!isAdmin || !onSetResult || isPending}
          onClick={() => handleTeamClick('team2')}
          className={[
            'relative rounded-md px-3 py-2.5 text-center text-sm font-medium transition-all w-full',
            isAdmin && onSetResult ? 'cursor-pointer active:scale-95' : 'cursor-default',
            poppedSide === 'team2' ? 'animate-winner-pop' : '',
            team2Won
              ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
              : hasResult
                ? 'bg-muted/40 text-muted-foreground/50'
                : 'bg-muted/40 hover:bg-muted',
          ].join(' ')}
        >
          {team2Won && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2">
              <Trophy className={`h-3 w-3 shrink-0${winnerJustSet ? ' animate-duo-form' : ''}`} />
            </span>
          )}
          <span className="flex items-center justify-center gap-1">
            {team2.map((m, i) => (
              <span key={m.id} className="flex items-center gap-0.5">
                {i > 0 && <span className="text-muted-foreground/60">&amp;</span>}
                <span className={m.id === currentPlayerId ? 'font-bold underline underline-offset-2' : ''}>{m.name}</span>
                {streakPlayerIds?.has(m.id) && <Flame className="h-3 w-3 text-orange-500 shrink-0" />}
              </span>
            ))}
            {team2IsDuo && <Users aria-label="Permanent partners" className="h-3 w-3 shrink-0 opacity-50" />}
          </span>
        </button>

        {isAdmin && onSetResult && !hasResult && (
          <p className="text-[10px] text-muted-foreground text-center mt-0.5">
            Tap a team to mark the winner
          </p>
        )}
        {sitOutWarning && (
          <p className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            {sitOutWarning}
          </p>
        )}
      </div>
    </Card>
  )
}

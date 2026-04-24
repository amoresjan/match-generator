import { Flame, Pencil, Trophy, Users } from 'lucide-react'
import { useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { Match, Player } from '@/lib/types'

interface Props {
  match: Match
  players: Player[]
  matchType: '1v1' | '2v2'
  isAdmin?: boolean
  streakPlayerIds?: Set<string>
  onEdit?: (match: Match) => void
  onSetResult?: (matchId: string, winner: 'team1' | 'team2' | null) => void
}

function resolveMembers(ids: string[], players: Player[]): { id: string; name: string }[] {
  return ids.map((id) => ({ id, name: players.find((p) => p.id === id)?.name ?? '?' }))
}

function isDuo(ids: string[], players: Player[]): boolean {
  if (ids.length !== 2) return false
  const a = players.find((p) => p.id === ids[0])
  return a?.permanent_partner_id === ids[1]
}

export function CourtCard({ match, players, matchType, isAdmin, streakPlayerIds, onEdit, onSetResult }: Props) {
  const team1 = resolveMembers(match.team1_players, players)
  const team2 = resolveMembers(match.team2_players, players)
  const team1IsDuo = isDuo(match.team1_players, players)
  const team2IsDuo = isDuo(match.team2_players, players)

  const [poppedSide, setPoppedSide] = useState<'team1' | 'team2' | null>(null)
  const popTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  return (
    <Card className="w-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Court {match.court_number}</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{matchType}</Badge>
            {isAdmin && onEdit && (
              <Button size="icon" variant="ghost" onClick={() => onEdit(match)} className="h-7 w-7">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-1.5 text-sm">
          {/* Team 1 */}
          <button
            disabled={!isAdmin || !onSetResult}
            onClick={() => handleTeamClick('team1')}
            className={[
              'relative rounded-md px-3 py-2 text-center font-medium transition-all w-full',
              isAdmin && onSetResult ? 'cursor-pointer active:scale-95' : 'cursor-default',
              poppedSide === 'team1' ? 'animate-winner-pop' : '',
              team1Won
                ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
                : hasResult
                  ? 'bg-muted/40 text-muted-foreground/50'
                  : 'bg-muted/40 hover:bg-muted',
            ].join(' ')}
          >
            {team1Won && <Trophy className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 shrink-0" />}
            <span className="flex items-center justify-center gap-1">
              {team1.map((m, i) => (
                <span key={m.id} className="flex items-center gap-0.5">
                  {i > 0 && <span className="text-muted-foreground/60">&amp;</span>}
                  <span>{m.name}</span>
                  {streakPlayerIds?.has(m.id) && (
                    <Flame className="h-3 w-3 text-orange-500 shrink-0" />
                  )}
                </span>
              ))}
              {team1IsDuo && <Users className="h-3 w-3 shrink-0 opacity-40" />}
            </span>
          </button>

          <span className="text-muted-foreground font-bold text-xs text-center">vs</span>

          {/* Team 2 */}
          <button
            disabled={!isAdmin || !onSetResult}
            onClick={() => handleTeamClick('team2')}
            className={[
              'relative rounded-md px-3 py-2 text-center font-medium transition-all w-full',
              isAdmin && onSetResult ? 'cursor-pointer active:scale-95' : 'cursor-default',
              poppedSide === 'team2' ? 'animate-winner-pop' : '',
              team2Won
                ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
                : hasResult
                  ? 'bg-muted/40 text-muted-foreground/50'
                  : 'bg-muted/40 hover:bg-muted',
            ].join(' ')}
          >
            {team2Won && <Trophy className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 shrink-0" />}
            <span className="flex items-center justify-center gap-1">
              {team2.map((m, i) => (
                <span key={m.id} className="flex items-center gap-0.5">
                  {i > 0 && <span className="text-muted-foreground/60">&amp;</span>}
                  <span>{m.name}</span>
                  {streakPlayerIds?.has(m.id) && (
                    <Flame className="h-3 w-3 text-orange-500 shrink-0" />
                  )}
                </span>
              ))}
              {team2IsDuo && <Users className="h-3 w-3 shrink-0 opacity-40" />}
            </span>
          </button>
        </div>
        {isAdmin && onSetResult && !hasResult && (
          <p className="text-[10px] text-muted-foreground text-center mt-2">
            Tap the winning team to record result
          </p>
        )}
      </CardContent>
    </Card>
  )
}

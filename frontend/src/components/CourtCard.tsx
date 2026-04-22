import { Pencil, Trophy } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { Match, Player } from '@/lib/types'

interface Props {
  match: Match
  players: Player[]
  matchType: '1v1' | '2v2'
  isAdmin?: boolean
  onEdit?: (match: Match) => void
  onSetResult?: (matchId: string, winner: 'team1' | 'team2' | null) => void
}

function resolveNames(ids: string[], players: Player[]): string {
  return ids
    .map((id) => players.find((p) => p.id === id)?.name ?? '?')
    .join(' & ')
}

export function CourtCard({ match, players, matchType, isAdmin, onEdit, onSetResult }: Props) {
  const team1 = resolveNames(match.team1_players, players)
  const team2 = resolveNames(match.team2_players, players)

  function handleTeamClick(side: 'team1' | 'team2') {
    if (!onSetResult) return
    // Tap winner to toggle off, tap other side to switch
    const next = match.winner === side ? null : side
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
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm">
          {/* Team 1 */}
          <button
            disabled={!isAdmin || !onSetResult}
            onClick={() => handleTeamClick('team1')}
            className={[
              'rounded-md px-2 py-1.5 text-center font-medium truncate transition-colors',
              isAdmin && onSetResult ? 'cursor-pointer' : 'cursor-default',
              team1Won
                ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
                : hasResult
                  ? 'text-muted-foreground/50'
                  : 'hover:bg-muted',
            ].join(' ')}
          >
            {team1Won && <Trophy className="inline h-3 w-3 mr-1 mb-0.5" />}
            {team1}
          </button>

          <span className="text-muted-foreground font-bold text-xs">vs</span>

          {/* Team 2 */}
          <button
            disabled={!isAdmin || !onSetResult}
            onClick={() => handleTeamClick('team2')}
            className={[
              'rounded-md px-2 py-1.5 text-center font-medium truncate transition-colors',
              isAdmin && onSetResult ? 'cursor-pointer' : 'cursor-default',
              team2Won
                ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
                : hasResult
                  ? 'text-muted-foreground/50'
                  : 'hover:bg-muted',
            ].join(' ')}
          >
            {team2Won && <Trophy className="inline h-3 w-3 mr-1 mb-0.5" />}
            {team2}
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

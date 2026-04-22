import { Pencil } from 'lucide-react'
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
}

function resolveNames(ids: string[], players: Player[]): string {
  return ids
    .map((id) => players.find((p) => p.id === id)?.name ?? '?')
    .join(' & ')
}

export function CourtCard({ match, players, matchType, isAdmin, onEdit }: Props) {
  const team1 = resolveNames(match.team1_players, players)
  const team2 = resolveNames(match.team2_players, players)

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
          <span className="font-medium text-center truncate">{team1}</span>
          <span className="text-muted-foreground font-bold text-xs">vs</span>
          <span className="font-medium text-center truncate">{team2}</span>
        </div>
      </CardContent>
    </Card>
  )
}

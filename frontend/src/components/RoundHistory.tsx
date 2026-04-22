import { ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Round, Player } from '@/lib/types'

interface Props {
  rounds: Round[]
  players: Player[]
}

function resolveNames(ids: string[], players: Player[]): string {
  return ids.map((id) => players.find((p) => p.id === id)?.name ?? '?').join(' & ')
}

export function RoundHistory({ rounds, players }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const pastRounds = [...rounds].reverse().slice(1) // all except latest

  if (pastRounds.length === 0) return null

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Past Rounds</h3>
      {pastRounds.map((round) => (
        <Card key={round.id} className="overflow-hidden">
          <CardHeader
            className="py-3 px-4 cursor-pointer flex-row items-center justify-between"
            onClick={() => setExpanded(expanded === round.id ? null : round.id)}
          >
            <CardTitle className="text-sm">Round {round.number}</CardTitle>
            {expanded === round.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </CardHeader>
          {expanded === round.id && (
            <CardContent className="pt-0 pb-3">
              <div className="space-y-1">
                {round.matches.map((m) => (
                  <div key={m.id} className="text-xs text-muted-foreground">
                    Court {m.court_number}: {resolveNames(m.team1_players, players)} vs{' '}
                    {resolveNames(m.team2_players, players)}
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  )
}

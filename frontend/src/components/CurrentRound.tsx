import { useState } from 'react'
import { CourtCard } from './CourtCard'
import { OverrideMatchDialog } from './OverrideMatchDialog'
import { Badge } from '@/components/ui/badge'
import type { Match, Player, Round, Session } from '@/lib/types'

interface Props {
  session: Session
  isAdmin: boolean
}

function getByePlayers(round: Round, players: Player[]): Player[] {
  const playingIds = new Set(round.matches.flatMap((m) => [...m.team1_players, ...m.team2_players]))
  return players.filter((p) => !playingIds.has(p.id))
}

export function CurrentRound({ session, isAdmin }: Props) {
  const [editingMatch, setEditingMatch] = useState<Match | null>(null)

  const rounds = session.rounds
  if (rounds.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        No rounds yet. {isAdmin ? 'Generate the first round!' : 'Waiting for the host to start.'}
      </div>
    )
  }

  const latestRound = rounds[rounds.length - 1]
  const byePlayers = getByePlayers(latestRound, session.players)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg">Round {latestRound.number}</h2>
        <Badge variant="outline">{latestRound.matches.length} court{latestRound.matches.length !== 1 ? 's' : ''}</Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {latestRound.matches.map((match) => (
          <CourtCard
            key={match.id}
            match={match}
            players={session.players}
            matchType={session.match_type}
            isAdmin={isAdmin}
            onEdit={isAdmin ? setEditingMatch : undefined}
          />
        ))}
      </div>

      {byePlayers.length > 0 && (
        <div className="rounded-lg border border-dashed p-3">
          <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">Sitting out</p>
          <div className="flex flex-wrap gap-2">
            {byePlayers.map((p) => (
              <Badge key={p.id} variant="outline">
                {p.name}
                {p.total_wait_rounds > 0 && (
                  <span className="ml-1 text-muted-foreground">×{p.total_wait_rounds}</span>
                )}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {isAdmin && (
        <OverrideMatchDialog
          sessionId={session.id}
          match={editingMatch}
          players={session.players}
          matchType={session.match_type}
          open={editingMatch !== null}
          onClose={() => setEditingMatch(null)}
        />
      )}
    </div>
  )
}

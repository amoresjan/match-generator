import { ChevronDown, ChevronUp, Trophy, Users } from 'lucide-react'
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useSetMatchResult } from '@/hooks/useSession'
import type { Match, Round, Player } from '@/lib/types'

interface Props {
  sessionId: string
  rounds: Round[]
  players: Player[]
  isAdmin: boolean
}

function resolveNames(ids: string[], players: Player[]): string {
  return ids.map((id) => players.find((p) => p.id === id)?.name ?? '?').join(' & ')
}

function isDuo(ids: string[], players: Player[]): boolean {
  if (ids.length !== 2) return false
  const a = players.find((p) => p.id === ids[0])
  return a?.permanent_partner_id === ids[1]
}

function MatchRow({ sessionId, match, players, isAdmin }: { sessionId: string; match: Match; players: Player[]; isAdmin: boolean }) {
  const setResult = useSetMatchResult(sessionId)
  const team1 = resolveNames(match.team1_players, players)
  const team2 = resolveNames(match.team2_players, players)
  const team1IsDuo = isDuo(match.team1_players, players)
  const team2IsDuo = isDuo(match.team2_players, players)
  const team1Won = match.winner === 'team1'
  const team2Won = match.winner === 'team2'
  const hasResult = match.winner !== null

  function handleTeamClick(side: 'team1' | 'team2') {
    const next = match.winner === side ? null : side
    setResult.mutate({ matchId: match.id, winner: next })
  }

  return (
    <div className="space-y-1">
      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Court {match.court_number}</p>
      <div className="flex flex-col gap-1">
        {/* Team 1 */}
        <button
          disabled={!isAdmin}
          onClick={() => isAdmin && handleTeamClick('team1')}
          className={[
            'relative rounded px-3 py-1.5 text-xs text-center font-medium transition-colors w-full',
            isAdmin ? 'cursor-pointer' : 'cursor-default',
            team1Won
              ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
              : hasResult
                ? 'bg-muted/40 text-muted-foreground/50'
                : isAdmin ? 'bg-muted/40 hover:bg-muted' : 'bg-muted/40',
          ].join(' ')}
        >
          {team1Won && <Trophy className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-yellow-500" />}
          <span className="flex items-center justify-center gap-1">
            {team1}
            {team1IsDuo && <Users className="h-3 w-3 opacity-40 shrink-0" />}
          </span>
        </button>

        <span className="text-[10px] text-muted-foreground font-bold text-center">vs</span>

        {/* Team 2 */}
        <button
          disabled={!isAdmin}
          onClick={() => isAdmin && handleTeamClick('team2')}
          className={[
            'relative rounded px-3 py-1.5 text-xs text-center font-medium transition-colors w-full',
            isAdmin ? 'cursor-pointer' : 'cursor-default',
            team2Won
              ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
              : hasResult
                ? 'bg-muted/40 text-muted-foreground/50'
                : isAdmin ? 'bg-muted/40 hover:bg-muted' : 'bg-muted/40',
          ].join(' ')}
        >
          {team2Won && <Trophy className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-yellow-500" />}
          <span className="flex items-center justify-center gap-1">
            {team2}
            {team2IsDuo && <Users className="h-3 w-3 opacity-40 shrink-0" />}
          </span>
        </button>
      </div>
    </div>
  )
}

export function RoundHistory({ sessionId, rounds, players, isAdmin }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const allRounds = [...rounds].reverse()

  if (allRounds.length === 0) return null

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">All Rounds</h3>
      {allRounds.map((round) => (
        <Card key={round.id} className="overflow-hidden">
          <CardHeader
            className="py-3 px-4 cursor-pointer flex-row items-center justify-between"
            onClick={() => setExpanded(expanded === round.id ? null : round.id)}
          >
            <CardTitle className="text-sm">Round {round.number}</CardTitle>
            {expanded === round.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </CardHeader>
          {expanded === round.id && (
            <CardContent className="pt-0 pb-3 space-y-3">
              {round.matches.map((m) => (
                <MatchRow key={m.id} sessionId={sessionId} match={m} players={players} isAdmin={isAdmin} />
              ))}
              {isAdmin && (
                <p className="text-[10px] text-muted-foreground text-center pt-1">
                  Tap a team to mark as winner
                </p>
              )}
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  )
}

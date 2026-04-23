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
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        {/* Team 1 */}
        <button
          disabled={!isAdmin}
          onClick={() => isAdmin && handleTeamClick('team1')}
          className={[
            'rounded px-2 py-1 text-xs text-left transition-colors',
            isAdmin ? 'cursor-pointer' : 'cursor-default',
            team1Won
              ? 'bg-green-100 text-green-800 font-semibold dark:bg-green-900/40 dark:text-green-300'
              : hasResult
                ? 'text-muted-foreground/50'
                : isAdmin ? 'hover:bg-muted' : '',
          ].join(' ')}
        >
          {team1Won && <Trophy className="inline h-3 w-3 mr-1 mb-0.5 text-yellow-500" />}
          {team1}
          {team1IsDuo && <Users className="inline h-3 w-3 ml-1 mb-0.5 opacity-40" />}
        </button>

        <span className="text-[10px] text-muted-foreground font-bold">vs</span>

        {/* Team 2 */}
        <button
          disabled={!isAdmin}
          onClick={() => isAdmin && handleTeamClick('team2')}
          className={[
            'rounded px-2 py-1 text-xs text-right transition-colors',
            isAdmin ? 'cursor-pointer' : 'cursor-default',
            team2Won
              ? 'bg-green-100 text-green-800 font-semibold dark:bg-green-900/40 dark:text-green-300'
              : hasResult
                ? 'text-muted-foreground/50'
                : isAdmin ? 'hover:bg-muted' : '',
          ].join(' ')}
        >
          {team2IsDuo && <Users className="inline h-3 w-3 mr-1 mb-0.5 opacity-40" />}
          {team2}
          {team2Won && <Trophy className="inline h-3 w-3 ml-1 mb-0.5 text-yellow-500" />}
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

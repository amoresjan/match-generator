import { useMemo, useState } from 'react'
import { Flame, PauseCircle } from 'lucide-react'
import { CourtCard } from './CourtCard'
import { OverrideMatchDialog } from './OverrideMatchDialog'
import { UpcomingRounds } from './UpcomingRounds'
import { Badge } from '@/components/ui/badge'
import { useSetMatchResult } from '@/hooks/useSession'
import type { Match, Round, Session } from '@/lib/types'

const STREAK_THRESHOLD = 3

function computeStreaks(rounds: Round[]): Map<string, number> {
  const history = new Map<string, ('W' | 'L')[]>()
  for (const round of rounds) {
    for (const match of round.matches) {
      if (match.winner === null) continue
      const winners = match.winner === 'team1' ? match.team1_players : match.team2_players
      const losers = match.winner === 'team1' ? match.team2_players : match.team1_players
      for (const id of winners) {
        if (!history.has(id)) history.set(id, [])
        history.get(id)!.push('W')
      }
      for (const id of losers) {
        if (!history.has(id)) history.set(id, [])
        history.get(id)!.push('L')
      }
    }
  }
  const streaking = new Map<string, number>()
  for (const [id, results] of history) {
    let streak = 0
    for (let i = results.length - 1; i >= 0; i--) {
      if (results[i] === 'W') streak++
      else break
    }
    if (streak >= STREAK_THRESHOLD) streaking.set(id, streak)
  }
  return streaking
}

interface Props {
  session: Session
  isAdmin: boolean
}


export function CurrentRound({ session, isAdmin }: Props) {
  const [editingMatch, setEditingMatch] = useState<Match | null>(null)
  const setResult = useSetMatchResult(session.id)

  const rounds = session.rounds
  const latestRound = rounds[rounds.length - 1] ?? null
  const streakMap = useMemo(() => computeStreaks(rounds), [rounds])
  const streakPlayerIds = useMemo(() => new Set(streakMap.keys()), [streakMap])
  const streakPlayers = useMemo(() => session.players.filter((p) => streakMap.has(p.id)), [session.players, streakMap])
  const sittingOutPlayers = useMemo(() => session.players.filter((p) => p.sit_out), [session.players])

  if (rounds.length === 0) {
    return (
      <div className="py-16 text-center space-y-2">
        {isAdmin ? (
          <>
            <p className="font-semibold">No rounds yet</p>
            <p className="text-sm text-muted-foreground">Add players in the Players tab, then hit Start below.</p>
          </>
        ) : (
          <>
            <p className="font-semibold">Waiting to start</p>
            <p className="text-sm text-muted-foreground">The host hasn't generated the first round yet.</p>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg">Round {latestRound.number}</h2>
        <Badge variant="outline">{latestRound.matches.length} court{latestRound.matches.length !== 1 ? 's' : ''}</Badge>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {latestRound.matches.map((match, i) => (
          <div
            key={match.id}
            className="animate-card-enter"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <CourtCard
              match={match}
              players={session.players}
              removedPlayers={session.removed_players}
              isAdmin={isAdmin}
              streakPlayerIds={streakPlayerIds}
              onEdit={isAdmin ? setEditingMatch : undefined}
              onSetResult={isAdmin ? (matchId, winner) => setResult.mutate({ matchId, winner }) : undefined}
              isPending={setResult.isPending && setResult.variables?.matchId === match.id}
            />
          </div>
        ))}
      </div>

      {streakPlayers.length > 0 && (
        <div className="rounded-lg border border-orange-300 dark:border-orange-700 bg-orange-50/50 dark:bg-orange-900/10 p-3 animate-streak-glow">
          <p className="text-xs text-orange-500 font-medium uppercase tracking-wide flex items-center gap-1">
            <Flame className="h-3 w-3" /> Hot Streak
          </p>
          <p className="text-[10px] text-orange-400/80 mb-2">Won {STREAK_THRESHOLD}+ games in a row</p>
          <div className="flex flex-wrap gap-2">
            {streakPlayers.map((p) => (
              <Badge key={p.id} variant="outline" className="border-orange-300 dark:border-orange-700 text-orange-600 dark:text-orange-400 gap-1">
                {p.name}
                <span className="flex items-center gap-0.5 font-bold">
                  <Flame className="h-3 w-3" />{streakMap.get(p.id)}
                </span>
              </Badge>
            ))}
          </div>
        </div>
      )}


      {sittingOutPlayers.length > 0 && (
        <div className="rounded-lg border border-dashed p-3">
          <p className="text-xs text-muted-foreground mb-2 font-medium flex items-center gap-1">
            <PauseCircle className="h-3 w-3" /> Sitting out
          </p>
          <div className="flex flex-wrap gap-2">
            {sittingOutPlayers.map((p) => (
              <Badge key={p.id} variant="secondary" className="text-xs text-muted-foreground">
                {p.name}
              </Badge>
            ))}
          </div>
          {!isAdmin && (
            <p className="text-xs text-muted-foreground mt-2">Ready to play? Let the host know and they'll add you back in.</p>
          )}
        </div>
      )}

      {!isAdmin && (
        <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground space-y-1">
          <p className="font-medium">💡 Co-host tip</p>
          <p>If you're helping manage this session, ask the host for the admin code and enter it in <span className="font-medium">Settings → Host Access</span>.</p>
        </div>
      )}

      {isAdmin && (
        <OverrideMatchDialog
          sessionId={session.id}
          match={editingMatch}
          players={session.players}
          matchType={session.match_type}
          roundMatches={latestRound.matches}
          open={editingMatch !== null}
          onClose={() => setEditingMatch(null)}
        />
      )}

      <>
        <div className="border-t" />
        <UpcomingRounds
            sessionId={session.id}
            players={session.players}
            isAdmin={isAdmin}
            roundCount={rounds.length}
            sessionKey={[
              session.num_courts,
              session.match_type,
              session.players
                .slice()
                .sort((a, b) => a.id.localeCompare(b.id))
                .map((p) => `${p.id}:${p.permanent_partner_id ?? ''}:${p.sit_out ? '1' : '0'}`)
                .join(','),
              latestRound.matches
                .map((m) => `${m.id}:${[...m.team1_players, ...m.team2_players].sort().join(',')}`)
                .join(';'),
            ].join('|')}
          />
      </>
    </div>
  )
}

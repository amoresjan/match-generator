import { useMemo, useState } from 'react'
import { Flame, PauseCircle } from 'lucide-react'
import { CourtCard } from './CourtCard'
import { OverrideMatchDialog } from './OverrideMatchDialog'
import { UpcomingRounds } from './UpcomingRounds'
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
  currentPlayerId?: string
}


export function CurrentRound({ session, isAdmin, currentPlayerId }: Props) {
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
            <p className="text-sm text-muted-foreground">The first round will appear here once the host starts.</p>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Round {latestRound.number}</h2>
        <span className="text-sm text-muted-foreground">
          {latestRound.matches.length} court{latestRound.matches.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
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
              currentPlayerId={currentPlayerId}
              onEdit={isAdmin && session.is_active ? setEditingMatch : undefined}
              onSetResult={isAdmin && session.is_active ? (matchId, winner) => setResult.mutate({ matchId, winner }) : undefined}
              isPending={setResult.isPending && setResult.variables?.matchId === match.id}
            />
          </div>
        ))}
      </div>

      {streakPlayers.length > 0 && (
        <div className="rounded-xl border border-orange-200 dark:border-orange-800/50 bg-orange-50 dark:bg-orange-950/20 px-3 py-2.5 animate-streak-glow">
          <div className="flex items-center gap-1.5 mb-2.5">
            <Flame className="h-3.5 w-3.5 text-orange-500 shrink-0 animate-streak-pulse" />
            <span className="text-xs font-semibold text-orange-600 dark:text-orange-400">Hot Streak</span>
            <span className="ml-auto text-[10px] text-orange-400/70 dark:text-orange-500/60">{STREAK_THRESHOLD}+ wins in a row</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {streakPlayers.map((p) => {
              const count = streakMap.get(p.id)!
              const isMe = p.id === currentPlayerId
              return (
                <div
                  key={p.id}
                  className={[
                    'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
                    isMe
                      ? 'bg-orange-500 text-white'
                      : 'bg-orange-100 dark:bg-orange-900/40 border border-orange-200 dark:border-orange-700/50 text-orange-800 dark:text-orange-200',
                  ].join(' ')}
                >
                  <span>{isMe ? 'You' : p.name}</span>
                  <span className={`flex items-center gap-0.5 font-bold text-[11px] ${isMe ? 'text-orange-200' : 'text-orange-500 dark:text-orange-400'}`}>
                    <Flame className="h-3 w-3 shrink-0" />
                    {count}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}


      {sittingOutPlayers.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground font-medium flex items-center gap-1.5 mb-2">
            <PauseCircle className="h-3.5 w-3.5" /> Sitting out
          </p>
          <div className="flex flex-wrap gap-1.5">
            {sittingOutPlayers.map((p) => (
              <span key={p.id} className="flex items-center rounded-full bg-muted border border-border px-2.5 py-1 text-xs text-muted-foreground font-medium">
                {p.name}
              </span>
            ))}
          </div>
          {!isAdmin && (
            <p className="text-xs text-muted-foreground/60 mt-2">Ready to play? Let the host know.</p>
          )}
        </div>
      )}

      {isAdmin && (
        <OverrideMatchDialog
          sessionId={session.id}
          match={editingMatch}
          players={session.players}
          matchType={session.match_type}
          roundMatches={latestRound.matches}
          sportType={session.sport_type}
          open={editingMatch !== null}
          onClose={() => setEditingMatch(null)}
        />
      )}

      <div className="mt-5 pt-5 border-t space-y-0">
        <UpcomingRounds
          sessionId={session.id}
          players={session.players}
          isAdmin={isAdmin}
          roundCount={rounds.length}
          currentPlayerId={currentPlayerId}
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
      </div>
    </div>
  )
}

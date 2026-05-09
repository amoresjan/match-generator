import { ChevronDown, ChevronUp, Trophy, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSetMatchResult } from '@/hooks/useSession'
import { isDuo } from '@/lib/utils'
import type { Match, Round, Player } from '@/lib/types'

interface Props {
  sessionId: string
  rounds: Round[]
  players: Player[]
  removedPlayers: Record<string, string>
  isAdmin: boolean
  isActive: boolean
  currentPlayerId?: string
}

function resolveMembers(ids: string[], players: Player[], removedPlayers: Record<string, string> = {}): { id: string; name: string }[] {
  return ids.map((id) => ({ id, name: players.find((p) => p.id === id)?.name ?? removedPlayers[id] ?? '?' }))
}

function YouPill() {
  return (
    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 ml-1">
      You
    </span>
  )
}

function CompletionChip({ matches }: { matches: Match[] }) {
  const done = matches.filter((m) => m.winner !== null).length
  const total = matches.length
  if (done === 0) return null
  const complete = done === total
  return (
    <span
      className={[
        'tabular-nums text-[11px] font-semibold rounded-full px-2 py-0.5',
        complete
          ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
          : 'bg-muted text-muted-foreground',
      ].join(' ')}
    >
      {done}/{total}
    </span>
  )
}

interface TeamRowProps {
  members: { id: string; name: string }[]
  hasDuo: boolean
  result: 'won' | 'lost' | null
  isClickable: boolean
  onClick?: () => void
  currentPlayerId?: string
}

function TeamRow({ members, hasDuo, result, isClickable, onClick, currentPlayerId }: TeamRowProps) {
  const names = (
    <span className="flex items-center gap-1 flex-wrap min-w-0">
      {members.map((m, i) => (
        <span key={m.id} className="flex items-center">
          {i > 0 && <span className="text-muted-foreground/40 text-xs mr-1">&amp;</span>}
          <span
            className={[
              'text-sm font-medium leading-snug',
              result === 'lost' ? 'text-muted-foreground/50' : '',
            ].join(' ')}
          >
            {m.name}
          </span>
          {m.id === currentPlayerId && <YouPill />}
        </span>
      ))}
      {hasDuo && <Users className="h-3 w-3 opacity-25 shrink-0 ml-0.5" />}
    </span>
  )

  const badge =
    result === 'won' ? (
      <span className="shrink-0 flex items-center gap-1 rounded px-1.5 py-0.5 bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400">
        <Trophy className="h-3 w-3" />
        <span className="text-[11px] font-bold">W</span>
      </span>
    ) : result === 'lost' ? (
      <span className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium bg-muted/40 text-muted-foreground/40">
        L
      </span>
    ) : null

  const rowClass = [
    'flex items-center justify-between gap-3 w-full rounded-lg px-3 py-2 transition-colors',
    result === 'won'
      ? 'bg-green-50 dark:bg-green-950/20'
      : result === 'lost'
        ? 'bg-muted/20'
        : isClickable
          ? 'bg-muted/30 hover:bg-muted/50 active:scale-[0.98]'
          : 'bg-muted/30',
  ].join(' ')

  if (isClickable && onClick) {
    return (
      <button onClick={onClick} className={rowClass}>
        {names}
        {badge}
      </button>
    )
  }

  return (
    <div className={rowClass}>
      {names}
      {badge}
    </div>
  )
}

interface MatchBlockProps {
  sessionId: string
  match: Match
  players: Player[]
  removedPlayers: Record<string, string>
  isAdmin: boolean
  isActive: boolean
  currentPlayerId?: string
}

function MatchBlock({ sessionId, match, players, removedPlayers, isAdmin, isActive, currentPlayerId }: MatchBlockProps) {
  const setResult = useSetMatchResult(sessionId)
  const team1 = resolveMembers(match.team1_players, players, removedPlayers)
  const team2 = resolveMembers(match.team2_players, players, removedPlayers)
  const team1IsDuo = isDuo(match.team1_players, players)
  const team2IsDuo = isDuo(match.team2_players, players)
  const team1Won = match.winner === 'team1'
  const team2Won = match.winner === 'team2'
  const hasResult = match.winner !== null
  const canEdit = isAdmin && isActive

  function handleTeamClick(side: 'team1' | 'team2') {
    const next = match.winner === side ? null : side
    setResult.mutate({ matchId: match.id, winner: next })
  }

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 px-1">
        Court {match.court_number}
      </p>
      <div className="space-y-1">
        <TeamRow
          members={team1}
          hasDuo={team1IsDuo}
          result={hasResult ? (team1Won ? 'won' : 'lost') : null}
          isClickable={canEdit}
          onClick={canEdit ? () => handleTeamClick('team1') : undefined}
          currentPlayerId={currentPlayerId}
        />
        <div className="flex items-center gap-2 px-2">
          <div className="h-px flex-1 bg-border/50" />
          <span className="text-[9px] font-semibold tracking-[0.12em] uppercase text-muted-foreground/35">vs</span>
          <div className="h-px flex-1 bg-border/50" />
        </div>
        <TeamRow
          members={team2}
          hasDuo={team2IsDuo}
          result={hasResult ? (team2Won ? 'won' : 'lost') : null}
          isClickable={canEdit}
          onClick={canEdit ? () => handleTeamClick('team2') : undefined}
          currentPlayerId={currentPlayerId}
        />
      </div>
      {canEdit && !hasResult && (
        <p className="text-[10px] text-muted-foreground/40 text-center pt-0.5">
          Tap a team to record the result
        </p>
      )}
    </div>
  )
}

export function RoundHistory({ sessionId, rounds, players, removedPlayers, isAdmin, isActive, currentPlayerId }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const allRounds = useMemo(() => [...rounds].reverse(), [rounds])

  if (allRounds.length === 0) {
    return (
      <div className="py-16 text-center space-y-1.5">
        <p className="text-sm font-medium text-foreground/50">No rounds played yet</p>
        <p className="text-xs text-muted-foreground/60">Past rounds will appear here.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {allRounds.map((round) => {
        const isExpanded = expanded === round.id

        return (
          <div key={round.id} className="rounded-xl border border-border bg-card overflow-hidden">
            <button
              aria-expanded={isExpanded}
              aria-label={`Round ${round.number} — ${isExpanded ? 'collapse' : 'expand'}`}
              className="w-full flex items-center justify-between px-4 py-3 text-left"
              onClick={() => setExpanded(isExpanded ? null : round.id)}
            >
              <span className="text-[15px] font-semibold">Round {round.number}</span>
              <span className="flex items-center gap-2">
                <CompletionChip matches={round.matches} />
                {isExpanded
                  ? <ChevronUp className="h-4 w-4 text-muted-foreground/60" />
                  : <ChevronDown className="h-4 w-4 text-muted-foreground/60" />}
              </span>
            </button>

            <div
              className="grid transition-all duration-300 ease-in-out"
              style={{ gridTemplateRows: isExpanded ? '1fr' : '0fr' }}
            >
              <div className="overflow-hidden">
                <div className="border-t border-border/60 px-4 pt-3 pb-4 space-y-4">
                  {round.matches.map((m) => (
                    <MatchBlock
                      key={m.id}
                      sessionId={sessionId}
                      match={m}
                      players={players}
                      removedPlayers={removedPlayers}
                      isAdmin={isAdmin}
                      isActive={isActive}
                      currentPlayerId={currentPlayerId}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

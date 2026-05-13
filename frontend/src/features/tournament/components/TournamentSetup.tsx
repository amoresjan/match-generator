import { useState } from 'react'
import { Shuffle, Trophy, X, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Player, Session } from '@/types'

interface Team {
  player_ids: (string | null)[]
}

interface Props {
  session: Session
  onSetup: (payload: { randomize: true } | { teams: { player_ids: string[] }[] }) => void
  isPending: boolean
}

function makeEmptyTeams(count: number, teamSize: number): Team[] {
  return Array.from({ length: count }, () => ({ player_ids: Array(teamSize).fill(null) }))
}

function shuffleIntoTeams(players: Player[], teamSize: number): Team[] {
  const ids = [...players.map((p) => p.id)]
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
  }
  const teams: Team[] = []
  for (let i = 0; i + teamSize <= ids.length; i += teamSize) {
    teams.push({ player_ids: ids.slice(i, i + teamSize) })
  }
  return teams
}

export function TournamentSetup({ session, onSetup, isPending }: Props) {
  const activePlayers = session.players.filter((p) => !p.sit_out)
  const teamSize = session.match_type === '2v2' ? 2 : 1
  const is1v1 = teamSize === 1

  const [teams, setTeams] = useState<Team[]>(() =>
    is1v1
      ? shuffleIntoTeams(activePlayers, 1)
      : makeEmptyTeams(Math.floor(activePlayers.length / teamSize), teamSize),
  )
  const [focusedTeam, setFocusedTeam] = useState<number | null>(is1v1 ? null : 0)

  const playerById = Object.fromEntries(activePlayers.map((p) => [p.id, p]))
  const assignedIds = new Set(teams.flatMap((t) => t.player_ids).filter(Boolean) as string[])
  const unassignedPlayers = activePlayers.filter((p) => !assignedIds.has(p.id))
  const filledCount = teams.filter((t) => t.player_ids.every((id) => id !== null)).length
  const allFilled = is1v1 || filledCount === teams.length
  const remaining = teams.length - filledCount

  function assignToFocused(playerId: string) {
    if (focusedTeam === null) return

    const nextTeams = teams.map((t) => ({ player_ids: [...t.player_ids] }))

    for (const t of nextTeams) {
      const idx = t.player_ids.indexOf(playerId)
      if (idx !== -1) t.player_ids[idx] = null
    }

    const emptySlot = nextTeams[focusedTeam].player_ids.indexOf(null)
    if (emptySlot === -1) return
    nextTeams[focusedTeam].player_ids[emptySlot] = playerId

    let nextFocus: number | null = null
    for (let t = focusedTeam; t < nextTeams.length; t++) {
      if (nextTeams[t].player_ids.includes(null)) { nextFocus = t; break }
    }
    if (nextFocus === null) {
      for (let t = 0; t < focusedTeam; t++) {
        if (nextTeams[t].player_ids.includes(null)) { nextFocus = t; break }
      }
    }

    setTeams(nextTeams)
    setFocusedTeam(nextFocus)
  }

  function unassign(teamIdx: number, slotIdx: number) {
    setTeams((prev) => {
      const next = prev.map((t) => ({ player_ids: [...t.player_ids] }))
      next[teamIdx].player_ids[slotIdx] = null
      return next
    })
    setFocusedTeam(teamIdx)
  }

  function handleRandomize() {
    const shuffled = shuffleIntoTeams(activePlayers, teamSize)
    setTeams(shuffled)
    setFocusedTeam(null)
  }

  function handleStart() {
    if (!allFilled || isPending) return
    onSetup({ teams: teams.map((t) => ({ player_ids: t.player_ids as string[] })) })
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-base flex items-center gap-2">
            <Trophy className="h-4 w-4 text-primary shrink-0" />
            Tournament Setup
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {activePlayers.length} players · {teams.length} teams
            {!is1v1 && (
              <> · {allFilled ? 'all ready' : `${filledCount} of ${teams.length} ready`}</>
            )}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRandomize}
          className="shrink-0 gap-1.5 text-xs h-8"
        >
          <Shuffle className="h-3.5 w-3.5" />
          Randomize
        </Button>
      </div>

      {is1v1 ? (
        <div className="space-y-1">
          {teams.map((team, i) => {
            const player = playerById[team.player_ids[0] as string]
            return (
              <div
                key={i}
                className="flex items-center gap-3 h-11 px-3 rounded-xl border border-border bg-card"
              >
                <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[11px] font-bold text-muted-foreground shrink-0 tabular-nums select-none">
                  {i + 1}
                </span>
                <span className="text-sm font-medium">{player?.name}</span>
              </div>
            )
          })}
          <p className="text-xs text-muted-foreground text-center pt-2">
            Seeds randomized. Tap Randomize to shuffle.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {teams.map((team, teamIdx) => {
              const isFocused = focusedTeam === teamIdx
              const isComplete = team.player_ids.every((id) => id !== null)

              return (
                <div
                  key={teamIdx}
                  role={isComplete ? undefined : 'button'}
                  tabIndex={isComplete ? undefined : 0}
                  onClick={() => { if (!isComplete) setFocusedTeam(teamIdx) }}
                  onKeyDown={(e) => { if (!isComplete && (e.key === 'Enter' || e.key === ' ')) setFocusedTeam(teamIdx) }}
                  aria-label={isComplete ? undefined : `Select Team ${teamIdx + 1}`}
                  aria-pressed={!isComplete ? isFocused : undefined}
                  className={[
                    'flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-all duration-150',
                    isFocused
                      ? 'border-primary/35 bg-primary/[0.03] ring-2 ring-primary/15 ring-offset-1'
                      : isComplete
                        ? 'border-border/40 opacity-70'
                        : 'border-border cursor-pointer',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center shrink-0 tabular-nums select-none',
                      isComplete
                        ? 'bg-primary/15 text-primary'
                        : isFocused
                          ? 'bg-primary/20 text-primary'
                          : 'bg-muted text-muted-foreground',
                    ].join(' ')}
                  >
                    {teamIdx + 1}
                  </span>

                  <div className="flex-1 flex items-center gap-2 min-w-0">
                    {team.player_ids.map((pid, slotIdx) => {
                      const player = pid ? playerById[pid] : null
                      return player ? (
                        <div
                          key={slotIdx}
                          className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-muted/50 min-w-0 flex-1"
                        >
                          <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-[9px] font-bold flex items-center justify-center shrink-0 select-none">
                            {player.name.charAt(0).toUpperCase()}
                          </span>
                          <span className="text-xs font-medium truncate">{player.name}</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); unassign(teamIdx, slotIdx) }}
                            aria-label={`Remove ${player.name} from Team ${teamIdx + 1}`}
                            className="ml-auto h-5 w-5 flex items-center justify-center rounded text-muted-foreground/40 hover:text-muted-foreground transition-colors shrink-0"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <div
                          key={slotIdx}
                          className={[
                            'flex items-center justify-center h-7 px-2 rounded-lg border border-dashed flex-1 text-xs select-none',
                            isFocused
                              ? 'border-primary/40 text-primary/50 font-medium'
                              : 'border-border/50 text-muted-foreground/30',
                          ].join(' ')}
                        >
                          {isFocused ? '+ add' : '+'}
                        </div>
                      )
                    })}
                  </div>

                  {isComplete && (
                    <Check className="h-3.5 w-3.5 text-primary/50 shrink-0" />
                  )}
                </div>
              )
            })}
          </div>

          {unassignedPlayers.length > 0 && !allFilled && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">
                {focusedTeam !== null
                  ? `Adding to Team ${focusedTeam + 1}`
                  : 'Tap a team above to select it'}
              </p>
              <div
                className={[
                  'flex flex-wrap gap-2 rounded-xl border p-3 transition-colors duration-150',
                  focusedTeam !== null
                    ? 'border-primary/25 bg-primary/[0.015]'
                    : 'border-border bg-muted/10',
                ].join(' ')}
              >
                {unassignedPlayers.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => assignToFocused(p.id)}
                    disabled={focusedTeam === null}
                    className={[
                      'px-3 py-2 rounded-lg text-sm font-medium border transition-all duration-100',
                      focusedTeam !== null
                        ? 'bg-background border-input text-foreground hover:border-primary/40 hover:bg-primary/[0.04] active:scale-95 cursor-pointer'
                        : 'bg-muted/30 border-border/60 text-muted-foreground/60 cursor-default',
                    ].join(' ')}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <div className="space-y-1.5 pt-1">
        <Button
          className="w-full h-11 text-sm font-semibold active:scale-95 transition-transform"
          onClick={handleStart}
          disabled={!allFilled || isPending}
        >
          {isPending ? 'Starting…' : 'Start Bracket'}
        </Button>
        {!allFilled && !isPending && (
          <p className="text-xs text-muted-foreground text-center">
            {remaining} {remaining === 1 ? 'team needs' : 'teams need'} players
          </p>
        )}
      </div>
    </div>
  )
}

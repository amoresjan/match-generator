import { useState } from 'react'
import { Shuffle, Trophy, X, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Player, Session } from '@/lib/types'

interface Team {
  player_ids: (string | null)[]
}

interface Props {
  session: Session
  onSetup: (payload: { randomize: true } | { teams: { player_ids: string[] }[] }) => void
  isPending: boolean
}

function makeEmptyTeams(playerCount: number, teamSize: number): Team[] {
  const count = Math.floor(playerCount / teamSize)
  return Array.from({ length: count }, () => ({ player_ids: Array(teamSize).fill(null) }))
}

function randomize(players: Player[], teamSize: number): Team[] {
  const ids = players.map((p) => p.id)
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
  const [teams, setTeams] = useState<Team[]>(() => makeEmptyTeams(activePlayers.length, teamSize))

  const playerById = Object.fromEntries(activePlayers.map((p) => [p.id, p]))

  function getAssignedIds(): Set<string> {
    return new Set(teams.flatMap((t) => t.player_ids).filter(Boolean) as string[])
  }

  function setPlayerInSlot(teamIdx: number, slotIdx: number, playerId: string | null) {
    setTeams((prev) => {
      const next = prev.map((t) => ({ player_ids: [...t.player_ids] }))
      if (playerId) {
        for (const t of next) {
          for (let i = 0; i < t.player_ids.length; i++) {
            if (t.player_ids[i] === playerId) t.player_ids[i] = null
          }
        }
      }
      next[teamIdx].player_ids[slotIdx] = playerId
      return next
    })
  }

  function handleRandomize() {
    setTeams(randomize(activePlayers, teamSize))
  }

  function canStart() {
    return teams.every((t) => t.player_ids.every((id) => id !== null))
  }

  function handleStart() {
    if (!canStart()) return
    onSetup({ teams: teams.map((t) => ({ player_ids: t.player_ids as string[] })) })
  }

  const assigned = getAssignedIds()
  const filledCount = teams.filter((t) => t.player_ids.every((id) => id !== null)).length
  const allFilled = canStart()
  const remaining = teams.length - filledCount

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <h2 className="font-semibold text-base flex items-center gap-2">
            <Trophy className="h-4 w-4 text-primary shrink-0" />
            Tournament Setup
          </h2>
          <p className="text-xs text-muted-foreground">
            {activePlayers.length} players · {teams.length} teams · {filledCount} of {teams.length} ready
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

      {/* Team cards */}
      <div className="space-y-2.5">
        {teams.map((team, teamIdx) => {
          const isComplete = team.player_ids.every((id) => id !== null)
          return (
            <div
              key={teamIdx}
              className={`rounded-lg border p-3 space-y-2 transition-colors ${
                isComplete ? 'border-primary/30 bg-primary/[0.02]' : ''
              }`}
            >
              {/* Team header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-5 h-5 rounded-full text-[10px] font-semibold flex items-center justify-center shrink-0 ${
                    isComplete ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                  }`}>
                    {teamIdx + 1}
                  </span>
                  <span className="text-xs font-medium text-muted-foreground">Team {teamIdx + 1}</span>
                </div>
                {isComplete && <Check className="h-3.5 w-3.5 text-primary" />}
              </div>

              {/* Slots */}
              <div className="space-y-1.5">
                {team.player_ids.map((pid, slotIdx) => {
                  const player = pid ? playerById[pid] : null
                  const availableOptions = activePlayers.filter(
                    (p) => !assigned.has(p.id) || p.id === pid,
                  )

                  return player ? (
                    <div
                      key={slotIdx}
                      className="flex items-center gap-2.5 h-9 px-3 rounded-md bg-muted/40"
                    >
                      <div className="w-6 h-6 rounded-full bg-primary/15 text-primary text-[10px] font-semibold flex items-center justify-center shrink-0 select-none">
                        {player.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="flex-1 text-sm font-medium truncate">{player.name}</span>
                      <button
                        onClick={() => setPlayerInSlot(teamIdx, slotIdx, null)}
                        className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground/40 hover:text-muted-foreground transition-colors shrink-0"
                        aria-label={`Remove ${player.name} from Team ${teamIdx + 1}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <Select
                      key={slotIdx}
                      value={pid ?? '__none__'}
                      onValueChange={(v) => setPlayerInSlot(teamIdx, slotIdx, v === '__none__' ? null : v)}
                    >
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder={`Add player ${slotIdx + 1}…`}>
                          {pid
                            ? playerById[pid]?.name
                            : <span className="text-muted-foreground">Add player {slotIdx + 1}…</span>}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— unassigned —</SelectItem>
                        {availableOptions.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* CTA */}
      <div className="space-y-2">
        <Button className="w-full" onClick={handleStart} disabled={!allFilled || isPending}>
          {isPending ? 'Starting…' : 'Start Bracket'}
        </Button>
        {!allFilled && !isPending && (
          <p className="text-xs text-muted-foreground text-center">
            {remaining} team{remaining !== 1 ? 's' : ''} still need{remaining === 1 ? 's' : ''} players
          </p>
        )}
      </div>
    </div>
  )
}

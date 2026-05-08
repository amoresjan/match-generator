import { useState } from 'react'
import { Shuffle, Trophy } from 'lucide-react'
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
      // Clear old assignment of this player elsewhere
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

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="font-semibold text-lg flex items-center gap-2">
          <Trophy className="h-5 w-5 text-primary" />
          Tournament Setup
        </h2>
        <p className="text-sm text-muted-foreground">
          {activePlayers.length} players → {teams.length} teams. Assign players to each team, then start the bracket.
        </p>
      </div>

      <Button variant="outline" className="w-full" onClick={handleRandomize}>
        <Shuffle className="h-4 w-4 mr-2" />
        Randomize Teams
      </Button>

      <div className="space-y-3">
        {teams.map((team, teamIdx) => (
          <div key={teamIdx} className="rounded-lg border p-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Team {teamIdx + 1}
            </p>
            <div className="space-y-1.5">
              {team.player_ids.map((pid, slotIdx) => {
                const availableOptions = activePlayers.filter(
                  (p) => !assigned.has(p.id) || p.id === pid
                )
                return (
                  <Select
                    key={slotIdx}
                    value={pid ?? '__none__'}
                    onValueChange={(v) => setPlayerInSlot(teamIdx, slotIdx, v === '__none__' ? null : v)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder={`Player ${slotIdx + 1}…`}>
                        {pid ? playerById[pid]?.name : <span className="text-muted-foreground">Player {slotIdx + 1}…</span>}
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
        ))}
      </div>

      <Button className="w-full" onClick={handleStart} disabled={!canStart() || isPending}>
        {isPending ? 'Starting…' : 'Start Bracket'}
      </Button>
    </div>
  )
}

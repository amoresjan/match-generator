import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useOverrideMatch } from '@/hooks/useSession'
import type { Match, Player } from '@/lib/types'

interface Props {
  sessionId: string
  match: Match | null
  players: Player[]
  matchType: '1v1' | '2v2'
  open: boolean
  onClose: () => void
}

export function OverrideMatchDialog({ sessionId, match, players, matchType, open, onClose }: Props) {
  const teamSize = matchType === '2v2' ? 2 : 1
  const override = useOverrideMatch(sessionId)

  const [team1, setTeam1] = useState<string[]>(match?.team1_players ?? [])
  const [team2, setTeam2] = useState<string[]>(match?.team2_players ?? [])

  function togglePlayer(id: string) {
    if (team1.includes(id)) {
      setTeam1(team1.filter((x) => x !== id))
    } else if (team2.includes(id)) {
      setTeam2(team2.filter((x) => x !== id))
    } else if (team1.length < teamSize) {
      setTeam1([...team1, id])
    } else if (team2.length < teamSize) {
      setTeam2([...team2, id])
    }
  }

  async function handleSave() {
    if (!match) return
    await override.mutateAsync({ matchId: match.id, team1_players: team1, team2_players: team2 })
    onClose()
  }

  const valid = team1.length === teamSize && team2.length === teamSize

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit Court {match?.court_number}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Tap players to assign: first {teamSize} go to Team 1, next {teamSize} to Team 2.
        </p>
        <div className="flex gap-3 text-xs font-semibold">
          <div className="flex-1">
            <p className="mb-1 text-primary">Team 1</p>
            {team1.map((id) => (
              <Badge key={id} className="mr-1 mb-1 cursor-pointer" onClick={() => togglePlayer(id)}>
                {players.find((p) => p.id === id)?.name}
              </Badge>
            ))}
          </div>
          <div className="flex-1">
            <p className="mb-1 text-blue-600">Team 2</p>
            {team2.map((id) => (
              <Badge key={id} variant="secondary" className="mr-1 mb-1 cursor-pointer" onClick={() => togglePlayer(id)}>
                {players.find((p) => p.id === id)?.name}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 border rounded-md p-3">
          {players.map((p) => {
            const inT1 = team1.includes(p.id)
            const inT2 = team2.includes(p.id)
            return (
              <button
                key={p.id}
                onClick={() => togglePlayer(p.id)}
                className={`px-2 py-1 rounded text-xs border transition-colors ${
                  inT1
                    ? 'bg-primary text-primary-foreground border-primary'
                    : inT2
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-background hover:bg-muted border-input'
                }`}
              >
                {p.name}
              </button>
            )
          })}
        </div>
        <Button onClick={handleSave} disabled={!valid || override.isPending} className="w-full">
          {override.isPending ? 'Saving…' : 'Save Override'}
        </Button>
      </DialogContent>
    </Dialog>
  )
}

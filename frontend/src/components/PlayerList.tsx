import { useState } from 'react'
import { Pencil, Trash2, UserPlus, Users, Link2Off } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAddPlayer, useRemovePlayer, useSetPartner, useUpdatePlayer } from '@/hooks/useSession'
import type { Player, Session } from '@/lib/types'

interface Props {
  session: Session
}

export function PlayerList({ session }: Props) {
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const addPlayer = useAddPlayer(session.id)
  const removePlayer = useRemovePlayer(session.id)
  const updatePlayer = useUpdatePlayer(session.id)
  const setPartner = useSetPartner(session.id)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    await addPlayer.mutateAsync(newName.trim())
    setNewName('')
  }

  async function handleRename(player: Player) {
    if (!editName.trim() || editName === player.name) {
      setEditingId(null)
      return
    }
    await updatePlayer.mutateAsync({ playerId: player.id, name: editName.trim() })
    setEditingId(null)
  }

  const availablePartners = (player: Player) =>
    session.players.filter(
      (p) => p.id !== player.id && (!p.permanent_partner_id || p.permanent_partner_id === player.id),
    )

  // Split into deduplicated duo pairs and solos
  const seen = new Set<string>()
  const duoPairs: [Player, Player][] = []
  const solos: Player[] = []

  for (const player of session.players) {
    if (seen.has(player.id)) continue
    if (player.permanent_partner_id) {
      const partner = session.players.find((p) => p.id === player.permanent_partner_id)
      if (partner) {
        duoPairs.push([player, partner])
        seen.add(player.id)
        seen.add(partner.id)
        continue
      }
    }
    solos.push(player)
  }

  function renderPlayerRow(player: Player, inDuoBox = false) {
    return (
      <div key={player.id} className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          {editingId === player.id ? (
            <Input
              autoFocus
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={() => handleRename(player)}
              onKeyDown={(e) => e.key === 'Enter' && handleRename(player)}
              className="h-7 text-sm flex-1"
            />
          ) : (
            <span className="flex-1 text-sm font-medium">{player.name}</span>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 shrink-0"
            onClick={() => { setEditingId(player.id); setEditName(player.name) }}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          {confirmDeleteId === player.id ? (
            <div className="flex items-center gap-1 shrink-0">
              <Button
                size="sm"
                variant="destructive"
                className="h-7 text-xs px-2"
                onClick={() => { removePlayer.mutate(player.id); setConfirmDeleteId(null) }}
              >
                Remove
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs px-2"
                onClick={() => setConfirmDeleteId(null)}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
              onClick={() => setConfirmDeleteId(player.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        {/* Duo selector — only for solo players in 2v2 */}
        {session.match_type === '2v2' && !inDuoBox && (
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-muted-foreground w-28 shrink-0">Duo:</span>
            <Select
              value={player.permanent_partner_id ?? 'none'}
              onValueChange={(val) =>
                setPartner.mutate({ playerId: player.id, partnerId: val === 'none' ? null : val })
              }
            >
              <SelectTrigger className="h-7 text-xs flex-1">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  <span className="flex items-center gap-1">
                    <Link2Off className="h-3 w-3" /> None
                  </span>
                </SelectItem>
                {availablePartners(player).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleAdd} className="flex gap-2">
        <Input
          placeholder="Player name…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="flex-1"
        />
        <Button type="submit" size="sm" disabled={addPlayer.isPending}>
          <UserPlus className="h-4 w-4" />
        </Button>
      </form>

      <div className="space-y-2">
        {/* Duo pairs */}
        {duoPairs.map(([a, b]) => (
          <div key={`${a.id}-${b.id}`} className="rounded-lg border-2 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <Badge variant="secondary" className="text-xs gap-1">
                <Users className="h-3 w-3" />
                Duo
              </Badge>
              {session.match_type === '2v2' && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-xs text-muted-foreground hover:text-destructive px-2"
                  onClick={() => setPartner.mutate({ playerId: a.id, partnerId: null })}
                >
                  Break
                </Button>
              )}
            </div>
            <div className="space-y-1.5 border-t pt-2">
              {renderPlayerRow(a, true)}
              {renderPlayerRow(b, true)}
            </div>
          </div>
        ))}

        {/* Solo players */}
        {solos.map((player) => (
          <div key={player.id} className="flex flex-col gap-1 rounded-lg border p-3">
            {renderPlayerRow(player, false)}
          </div>
        ))}
      </div>

      {session.players.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">No players yet. Add some above.</p>
      )}
    </div>
  )
}

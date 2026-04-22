import { useState } from 'react'
import { Pencil, Trash2, UserPlus, Link, Link2Off } from 'lucide-react'
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
        {session.players.map((player) => (
          <div key={player.id} className="flex flex-col gap-1 rounded-lg border p-3">
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

              {player.permanent_partner_id && (
                <Badge variant="secondary" className="text-xs shrink-0">
                  <Link className="h-3 w-3 mr-1" />
                  {player.permanent_partner_name}
                </Badge>
              )}

              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0"
                onClick={() => {
                  setEditingId(player.id)
                  setEditName(player.name)
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                onClick={() => removePlayer.mutate(player.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Partner selector — only for 2v2 */}
            {session.match_type === '2v2' && (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-muted-foreground w-28 shrink-0">Permanent partner:</span>
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
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        ))}
      </div>

      {session.players.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">No players yet. Add some above.</p>
      )}
    </div>
  )
}

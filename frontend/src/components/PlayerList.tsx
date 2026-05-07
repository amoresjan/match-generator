import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Pencil, Trash2, UserPlus, Users, Link2Off, PauseCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAddPlayer, useRemovePlayer, useSetPartner, useSetSitOut, useUpdatePlayer } from '@/hooks/useSession'
import { partitionPlayers } from '@/lib/utils'
import type { Player, Session } from '@/lib/types'

interface PlayerRowProps {
  player: Player
  inDuoBox: boolean
  sessionPlayers: Player[]
  matchType: '1v1' | '2v2'
  editingId: string | null
  editName: string
  confirmDeleteId: string | null
  sitOutPromptId: string | null
  isSetPartnerPending: boolean
  setPartnerVariables: { playerId: string; partnerId: string | null } | undefined
  disabled: boolean
  onStartEdit: (player: Player) => void
  onEditNameChange: (name: string) => void
  onRename: (player: Player) => void
  onConfirmDelete: (id: string) => void
  onCancelDelete: () => void
  onRemove: (id: string) => void
  onSitOutToggle: (player: Player) => void
  onSitOutBoth: (playerId: string, partnerId: string) => void
  onSitOutSolo: (playerId: string) => void
  onSetPartner: (playerId: string, partnerId: string | null) => void
}

function PlayerRow({
  player, inDuoBox, sessionPlayers, matchType,
  editingId, editName, confirmDeleteId, sitOutPromptId,
  isSetPartnerPending, setPartnerVariables,
  disabled,
  onStartEdit, onEditNameChange, onRename,
  onConfirmDelete, onCancelDelete, onRemove,
  onSitOutToggle, onSitOutBoth, onSitOutSolo,
  onSetPartner,
}: PlayerRowProps) {
  const availablePartners = sessionPlayers.filter(
    (p) => p.id !== player.id && (!p.permanent_partner_id || p.permanent_partner_id === player.id),
  )

  const sitOutPromptPartner = sitOutPromptId === player.id
    ? sessionPlayers.find((p) => p.id === player.permanent_partner_id) ?? null
    : null
  const showSitOutPrompt = sitOutPromptPartner != null && !sitOutPromptPartner.sit_out

  const isThisPartnerPending = isSetPartnerPending && setPartnerVariables?.playerId === player.id

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        {editingId === player.id ? (
          <Input
            autoFocus
            value={editName}
            onChange={(e) => onEditNameChange(e.target.value)}
            onBlur={() => onRename(player)}
            onKeyDown={(e) => e.key === 'Enter' && onRename(player)}
            className="h-7 text-sm flex-1"
          />
        ) : (
          <span className={`flex-1 text-sm font-medium ${player.sit_out ? 'line-through text-muted-foreground' : ''}`}>
            {player.name}
          </span>
        )}
        <Button
          size="icon"
          variant="ghost"
          className={`h-7 w-7 shrink-0 ${player.sit_out ? 'text-orange-500 hover:text-orange-600' : 'text-muted-foreground hover:text-foreground'}`}
          disabled={disabled || sitOutPromptId === player.id}
          onClick={() => onSitOutToggle(player)}
          aria-label={player.sit_out ? `Bring ${player.name} back` : `Sit out ${player.name}`}
        >
          <PauseCircle className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 shrink-0"
          disabled={disabled}
          onClick={() => onStartEdit(player)}
          aria-label={`Rename ${player.name}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        {confirmDeleteId === player.id ? (
          <div className="flex items-center gap-1 shrink-0">
            <Button
              size="sm"
              variant="destructive"
              className="h-7 text-xs px-2"
              disabled={disabled}
              onClick={() => onRemove(player.id)}
            >
              Remove
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs px-2"
              disabled={disabled}
              onClick={onCancelDelete}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
            disabled={disabled}
            onClick={() => onConfirmDelete(player.id)}
            aria-label={`Remove ${player.name}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {showSitOutPrompt && sitOutPromptPartner && (
        <div className="flex items-center gap-2 mt-1 rounded-md bg-muted/50 px-2 py-1.5">
          <span className="text-xs text-muted-foreground flex-1">Also sit out {sitOutPromptPartner.name}?</span>
          <Button
            size="sm"
            variant="secondary"
            className="h-6 text-xs px-2"
            disabled={disabled}
            onClick={() => onSitOutBoth(player.id, sitOutPromptPartner.id)}
          >
            Yes
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-xs px-2"
            disabled={disabled}
            onClick={() => onSitOutSolo(player.id)}
          >
            No
          </Button>
        </div>
      )}

      {matchType === '2v2' && !inDuoBox && (
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-muted-foreground w-28 shrink-0">Duo:</span>
          {isThisPartnerPending && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
          )}
          <Select
            disabled={disabled || isThisPartnerPending}
            value={player.permanent_partner_id ?? 'none'}
            onValueChange={(val) => onSetPartner(player.id, val === 'none' ? null : val)}
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
              {availablePartners.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
}

interface Props {
  session: Session
}

export function PlayerList({ session }: Props) {
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [newDuoKey, setNewDuoKey] = useState<string | null>(null)
  const [sitOutPromptId, setSitOutPromptId] = useState<string | null>(null)
  const [formVisible, setFormVisible] = useState(true)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const duoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const formRef = useRef<HTMLFormElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const el = formRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => setFormVisible(entry.isIntersecting),
      { threshold: 0 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const mo = new MutationObserver(() => {
      setDropdownOpen(!!document.querySelector('[data-radix-popper-content-wrapper]'))
    })
    mo.observe(document.body, { childList: true, subtree: true })
    return () => mo.disconnect()
  }, [])

  const addPlayer = useAddPlayer(session.id)
  const removePlayer = useRemovePlayer(session.id)
  const updatePlayer = useUpdatePlayer(session.id)
  const setPartner = useSetPartner(session.id)
  const setSitOut = useSetSitOut(session.id)
  const disabled = !session.is_active

  const { duoPairs, solos } = useMemo(() => partitionPlayers(session.players), [session.players])
  const sittingOutCount = session.players.filter((p) => p.sit_out).length

  function handleSetPartner(playerId: string, partnerId: string | null) {
    if (partnerId) {
      const pairKey = [playerId, partnerId].sort().join('-')
      setPartner.mutateAsync({ playerId, partnerId }).then(() => {
        if (duoTimer.current) clearTimeout(duoTimer.current)
        setNewDuoKey(pairKey)
        duoTimer.current = setTimeout(() => setNewDuoKey(null), 600)
      }).catch(() => {})
    } else {
      setPartner.mutate({ playerId, partnerId })
    }
  }

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

  function handleSitOutToggle(player: Player) {
    const next = !player.sit_out
    if (next && player.permanent_partner_id) {
      const partner = session.players.find((p) => p.id === player.permanent_partner_id)
      if (partner && !partner.sit_out) {
        setSitOutPromptId(player.id)
        return
      }
    }
    setSitOut.mutate({ playerId: player.id, sitOut: next })
  }

  const sharedRowProps = {
    sessionPlayers: session.players,
    matchType: session.match_type,
    editingId,
    editName,
    confirmDeleteId,
    sitOutPromptId,
    isSetPartnerPending: setPartner.isPending,
    setPartnerVariables: setPartner.variables,
    disabled,
    onStartEdit: (p: Player) => { setEditingId(p.id); setEditName(p.name) },
    onEditNameChange: setEditName,
    onRename: handleRename,
    onConfirmDelete: setConfirmDeleteId,
    onCancelDelete: () => setConfirmDeleteId(null),
    onRemove: (id: string) => { removePlayer.mutate(id); setConfirmDeleteId(null) },
    onSitOutToggle: handleSitOutToggle,
    onSitOutBoth: (playerId: string, partnerId: string) => {
      setSitOut.mutate({ playerId, sitOut: true })
      setSitOut.mutate({ playerId: partnerId, sitOut: true })
      setSitOutPromptId(null)
    },
    onSitOutSolo: (playerId: string) => {
      setSitOut.mutate({ playerId, sitOut: true })
      setSitOutPromptId(null)
    },
    onSetPartner: handleSetPartner,
  }

  return (
    <div className="space-y-4">
      <form ref={formRef} onSubmit={handleAdd} className="flex gap-2">
        <label htmlFor="add-player-name" className="sr-only">Player name</label>
        <Input
          id="add-player-name"
          ref={inputRef}
          placeholder="Player name…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="flex-1"
          disabled={disabled}
        />
        <Button type="submit" size="sm" disabled={disabled || addPlayer.isPending} aria-label="Add player">
          {addPlayer.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
        </Button>
      </form>

      <div className="flex items-center justify-between text-xs text-muted-foreground px-0.5">
        <span>Players</span>
        <span className="font-medium tabular-nums">{session.players.length}</span>
      </div>

      {sittingOutCount > 0 && (
        <p className="text-xs text-muted-foreground px-0.5 flex items-center gap-1 -mt-2">
          <PauseCircle className="h-3 w-3" />
          {sittingOutCount} sitting out
        </p>
      )}

      <div className="space-y-2">
        {duoPairs.map(([a, b]) => {
          const pairKey = [a.id, b.id].sort().join('-')
          const isBreaking = setPartner.isPending && setPartner.variables?.playerId === a.id && setPartner.variables?.partnerId === null
          return (
            <div key={pairKey} className={`rounded-lg border-2 p-3 space-y-2 ${newDuoKey === pairKey ? 'animate-duo-form' : ''}`}>
              <div className="flex items-center justify-between">
                <Badge variant="secondary" className="text-xs gap-1">
                  <Users className="h-3 w-3" />
                  Duo
                </Badge>
                {session.match_type === '2v2' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-xs text-muted-foreground hover:text-destructive px-2 gap-1"
                    disabled={disabled || isBreaking}
                    onClick={() => setPartner.mutate({ playerId: a.id, partnerId: null })}
                  >
                    {isBreaking && <Loader2 className="h-3 w-3 animate-spin" />}
                    Break
                  </Button>
                )}
              </div>
              <div className="space-y-1.5 border-t pt-2">
                <PlayerRow key={a.id} player={a} inDuoBox {...sharedRowProps} />
                <PlayerRow key={b.id} player={b} inDuoBox {...sharedRowProps} />
              </div>
            </div>
          )
        })}

        {solos.map((player) => (
          <div key={player.id} className="flex flex-col gap-1 rounded-lg border p-3">
            <PlayerRow player={player} inDuoBox={false} {...sharedRowProps} />
          </div>
        ))}
      </div>

      {session.players.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">No players yet. Add some above.</p>
      )}

      {session.match_type === '2v2' && session.players.length >= 2 && (
        <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground space-y-1">
          <p className="font-medium">💡 Duo tip</p>
          <p>Use the <span className="font-medium">Duo</span> selector on a player to permanently pair them with a partner. Duos always play together and are never split.</p>
        </div>
      )}

      {!disabled && !formVisible && !dropdownOpen && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <button
            className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground shadow-lg px-4 py-2 text-xs font-medium animate-card-enter"
            onClick={() => {
              window.scrollTo({ top: 0, behavior: 'smooth' })
              setTimeout(() => inputRef.current?.focus(), 350)
            }}
          >
            <UserPlus className="h-3.5 w-3.5" />
            Add player
          </button>
        </div>
      )}
    </div>
  )
}

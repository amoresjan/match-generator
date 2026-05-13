import { Clock, Users } from 'lucide-react'
import { partitionPlayers } from '@/lib/utils'
import type { Player } from '@/types'

function PlayerName({ player, isMe }: { player: Player; isMe?: boolean }) {
  return (
    <span className="flex items-center gap-1.5 min-w-0">
      <span className={`text-sm font-medium truncate ${player.sit_out ? 'line-through text-muted-foreground/60' : ''}`}>
        {player.name}
      </span>
      {isMe && (
        <span className="shrink-0 text-[10px] font-semibold bg-primary/15 text-primary rounded-full px-1.5 py-0.5 leading-none">You</span>
      )}
      {player.sit_out && (
        <span className="shrink-0 text-[10px] text-muted-foreground/70">out</span>
      )}
    </span>
  )
}

function WaitLabel({ rounds }: { rounds: number }) {
  if (rounds <= 0) return null
  return (
    <span className="shrink-0 flex items-center gap-0.5 text-[10px] text-muted-foreground/70 tabular-nums">
      <Clock className="h-2.5 w-2.5" />
      {rounds}
    </span>
  )
}

interface Props {
  players: Player[]
  currentPlayerId?: string
  bracketLocked?: boolean
  matchType?: '1v1' | '2v2'
}

export function PublicPlayerList({ players, currentPlayerId, bracketLocked, matchType }: Props) {
  const { duoPairs, solos } = partitionPlayers(players)
  const sortedDuoPairs = [...duoPairs].sort(([a, b], [c, d]) => {
    const meIn1 = currentPlayerId && (a.id === currentPlayerId || b.id === currentPlayerId)
    const meIn2 = currentPlayerId && (c.id === currentPlayerId || d.id === currentPlayerId)
    return meIn1 ? -1 : meIn2 ? 1 : 0
  })
  const sortedSolos = [...solos].sort((a, b) => {
    if (currentPlayerId && a.id === currentPlayerId) return -1
    if (currentPlayerId && b.id === currentPlayerId) return 1
    return 0
  })

  const sittingOutCount = players.filter(p => p.sit_out).length

  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-semibold">{players.length} players</span>
        {sittingOutCount > 0 && (
          <span className="text-xs text-muted-foreground">{sittingOutCount} sitting out</span>
        )}
      </div>

      <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
        {sortedDuoPairs.map(([a, b]) => {
          const meInPair = a.id === currentPlayerId || b.id === currentPlayerId
          const groupBg = meInPair
            ? 'bg-primary/[0.05] dark:bg-primary/[0.07]'
            : 'bg-muted/30 dark:bg-muted/[0.15]'
          return (
            <div key={`${a.id}-${b.id}`} className={groupBg}>
              <div className="flex items-center justify-between px-3 py-3">
                <PlayerName player={a} isMe={a.id === currentPlayerId} />
                <span className="shrink-0 flex items-center gap-2">
                  <WaitLabel rounds={a.total_wait_rounds} />
                  <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
                    <Users className="h-2.5 w-2.5" />Partners
                  </span>
                </span>
              </div>
              <div className="flex items-center justify-between px-3 py-2.5 pl-5 border-t border-border/40">
                <PlayerName player={b} isMe={b.id === currentPlayerId} />
                <WaitLabel rounds={b.total_wait_rounds} />
              </div>
            </div>
          )
        })}

        {sortedSolos.map((p) => {
          const isMe = p.id === currentPlayerId
          return (
            <div
              key={p.id}
              className={`flex items-center justify-between px-3 py-3 ${isMe ? 'bg-primary/[0.05] dark:bg-primary/[0.07]' : ''}`}
            >
              <PlayerName player={p} isMe={isMe} />
              <WaitLabel rounds={p.total_wait_rounds} />
            </div>
          )
        })}
      </div>

      {bracketLocked && (
        <p className="text-xs text-muted-foreground px-0.5">Player list is locked for the tournament.</p>
      )}
      {!bracketLocked && matchType === '2v2' && duoPairs.length === 0 && (
        <p className="text-xs text-muted-foreground px-0.5">Ask the host to set up permanent partners.</p>
      )}
    </div>
  )
}

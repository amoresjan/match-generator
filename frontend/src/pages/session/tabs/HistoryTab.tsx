import { RoundHistory } from '@/features/rotation/components/RoundHistory'
import type { Session } from '@/types'

interface Props {
  session: Session
  isAdmin: boolean
  claimedPlayerId: string | null
}

export function HistoryTab({ session, isAdmin, claimedPlayerId }: Props) {
  return (
    <RoundHistory
      sessionId={session.id}
      rounds={session.rounds}
      players={session.players}
      removedPlayers={session.removed_players}
      isAdmin={isAdmin}
      isActive={session.is_active}
      currentPlayerId={claimedPlayerId ?? undefined}
    />
  )
}

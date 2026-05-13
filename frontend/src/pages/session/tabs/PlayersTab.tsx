import { PlayerList } from '@/features/players/components/PlayerList'
import { PublicPlayerList } from '@/features/players/components/PublicPlayerList'
import type { Session } from '@/types'

interface Props {
  session: Session
  isAdmin: boolean
  isTournament: boolean
  claimedPlayerId: string | null
}

export function PlayersTab({ session, isAdmin, isTournament, claimedPlayerId }: Props) {
  const bracketLocked = isTournament && !!session.tournament_data

  if (isAdmin && !bracketLocked) {
    return (
      <PlayerList
        session={session}
        currentPlayerId={claimedPlayerId ?? undefined}
      />
    )
  }

  return (
    <PublicPlayerList
      players={session.players}
      matchType={session.match_type}
      currentPlayerId={claimedPlayerId ?? undefined}
      bracketLocked={bracketLocked}
    />
  )
}

import { TournamentCourts } from '@/features/tournament/components/TournamentCourts'
import { TournamentLeaderboard } from '@/features/tournament/components/TournamentLeaderboard'
import { TournamentSetup } from '@/features/tournament/components/TournamentSetup'
import type { Session } from '@/types'

interface Props {
  session: Session
  isAdmin: boolean
  claimedPlayerId: string | null
  onSetup: (payload: { randomize: true } | { teams: { player_ids: string[] }[] }) => void
  onAdvance: (matchSlotId: string, winnerTeamId: string) => void
  setupPending: boolean
  advancePending: boolean
}

export function TournamentCourtsTab({ session, isAdmin, claimedPlayerId, onSetup, onAdvance, setupPending, advancePending }: Props) {
  if (!session.tournament_data) {
    if (!isAdmin) {
      return (
        <div className="text-center text-muted-foreground py-12 text-sm">
          Waiting for the host to set up the bracket.
        </div>
      )
    }
    return (
      <TournamentSetup
        session={session}
        onSetup={onSetup}
        isPending={setupPending}
      />
    )
  }

  return (
    <>
      <TournamentCourts
        bracket={session.tournament_data}
        isAdmin={isAdmin}
        onAdvance={onAdvance}
        isPending={advancePending}
      />
      {session.tournament_data.status === 'complete' && (
        <TournamentLeaderboard
          bracket={session.tournament_data}
          rounds={session.rounds}
          currentPlayerId={claimedPlayerId ?? undefined}
        />
      )}
    </>
  )
}

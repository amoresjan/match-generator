import { Leaderboard } from '@/features/rotation/components/Leaderboard'
import { SessionSummaryCard } from '@/features/session/components/SessionSummaryCard'
import type { Session } from '@/types'

interface Props {
  session: Session
  claimedPlayerId: string | null
}

export function RanksTab({ session, claimedPlayerId }: Props) {
  const hasResults = session.rounds.some((r) => r.matches.some((m) => m.winner !== null))

  return (
    <div className="space-y-6">
      <Leaderboard
        players={session.players}
        rounds={session.rounds}
        currentPlayerId={claimedPlayerId ?? undefined}
      />
      {hasResults && (
        <SessionSummaryCard
          sessionName={session.name}
          players={session.players}
          rounds={session.rounds}
          sportType={session.sport_type}
          generationMode={session.generation_mode}
          sessionMode={session.session_mode}
          matchType={session.match_type}
        />
      )}
    </div>
  )
}

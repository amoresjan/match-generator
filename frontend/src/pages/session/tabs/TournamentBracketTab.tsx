import { TournamentBracket } from '@/features/tournament/components/TournamentBracket'
import type { Session } from '@/types'

interface Props {
  session: Session
}

export function TournamentBracketTab({ session }: Props) {
  if (!session.tournament_data) {
    return (
      <div className="text-center text-muted-foreground py-12 text-sm">No bracket yet.</div>
    )
  }

  return <TournamentBracket bracket={session.tournament_data} />
}

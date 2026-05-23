import { getSport } from '@/lib/sports'
import type { Session } from '@/types'

type Sport = ReturnType<typeof getSport>

interface Props {
  session: Session
  sport: Sport
  isAdmin: boolean
  isTournament: boolean
}

export function SessionHeader({ session, sport, isAdmin, isTournament }: Props) {
  return (
    <header className="border-b px-4 py-3">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-1.5 min-w-0">
          <h1 className="font-bold text-base leading-tight truncate">{session.name}</h1>
          {!session.is_active && (
            <span className="shrink-0 text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full leading-none">Ended</span>
          )}
          {isAdmin && (
            <span className="shrink-0 text-[10px] font-semibold bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full leading-none">Host</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 leading-none">
          {sport.emoji} {sport.label} · <span className="text-foreground/75 font-medium">{session.match_type}</span> · {isTournament ? 'Tournament' : session.generation_mode === 'competitive' ? 'Competitive' : 'Fair rotation'}
        </p>
      </div>
    </header>
  )
}

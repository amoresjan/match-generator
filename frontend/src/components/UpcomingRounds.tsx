import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import { usePreviewRounds } from '@/hooks/useSession'
import type { Player, PreviewRound } from '@/lib/types'

interface Props {
  sessionId: string
  players: Player[]
  isAdmin: boolean
  roundCount: number
  sessionKey: string
}

function resolveName(id: string, players: Player[]) {
  return players.find((p) => p.id === id)?.name ?? '?'
}

function resolveTeam(ids: string[], players: Player[]) {
  return ids.map((id) => resolveName(id, players)).join(' & ')
}

function PreviewRoundRow({
  round, players, open, onOpenChange, animClass,
}: {
  round: PreviewRound
  players: Player[]
  open: boolean
  onOpenChange: (open: boolean) => void
  animClass?: string
}) {
  return (
    <div className={`rounded-lg border ${animClass ?? ''}`}>
      <button
        className="w-full flex items-center justify-between px-3 py-2.5 text-left"
        onClick={() => onOpenChange(!open)}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Round {round.round_number}</span>
        </div>
        {open
          ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
          : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
      </button>

      <div
        className="grid transition-all duration-300 ease-in-out"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div className="px-3 pb-3 space-y-2 border-t pt-2">
            {round.courts.map((court) => (
              <div key={court.court} className="rounded-md border bg-muted/30 p-2.5 text-sm">
                <p className="text-xs text-muted-foreground mb-1.5 font-medium">Court {court.court}</p>
                <div className="flex flex-col gap-1">
                  <span className="font-medium">{resolveTeam(court.team1, players)}</span>
                  <span className="text-xs text-muted-foreground">vs</span>
                  <span className="font-medium">{resolveTeam(court.team2, players)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

const EXIT_DURATION = 300  // matches animate-card-exit duration

export function UpcomingRounds({ sessionId, players, isAdmin, roundCount, sessionKey }: Props) {
  const preview = usePreviewRounds(sessionId)
  const [rounds, setRounds] = useState<PreviewRound[] | null>(null)
  const [openNum, setOpenNum] = useState<number | null>(null)
  const [exitingNum, setExitingNum] = useState<number | null>(null)
  const [enteringNum, setEnteringNum] = useState<number | null>(null)

  const mutateRef = useRef(preview.mutateAsync)
  mutateRef.current = preview.mutateAsync
  const mounted = useRef(false)

  function applyRounds(next: PreviewRound[]) {
    setRounds(next)
    if (next.length > 0) setOpenNum(next[0].round_number)
  }

  // Auto-generate on mount for admins
  useEffect(() => {
    if (!isAdmin) return
    mutateRef.current(5).then(applyRounds).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // When a new real round is committed: animate first card out, fetch, animate last card in
  useEffect(() => {
    if (!mounted.current) return
    if (rounds === null || rounds.length === 0) return

    const exiting = rounds[0].round_number
    setExitingNum(exiting)

    const t = setTimeout(() => {
      setExitingNum(null)
      mutateRef.current(5).then((next) => {
        applyRounds(next)
        if (next.length > 0) {
          const entering = next[next.length - 1].round_number
          setEnteringNum(entering)
          setTimeout(() => setEnteringNum(null), 400)
        }
      }).catch(() => {})
    }, EXIT_DURATION)

    return () => clearTimeout(t)
  }, [roundCount]) // eslint-disable-line react-hooks/exhaustive-deps

  // Silent regenerate for other session changes (player added/removed, duo, courts)
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return }
    if (rounds === null) return
    mutateRef.current(5).then(applyRounds).catch(() => {})
  }, [sessionKey]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!isAdmin && !rounds) return null

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground">Upcoming</h3>
        {preview.isPending && (
          <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}
      </div>

      {rounds && (
        <div className="space-y-2">
          {rounds.map((round) => (
            <PreviewRoundRow
              key={round.round_number}
              round={round}
              players={players}
              open={openNum === round.round_number}
              onOpenChange={(o) => setOpenNum(o ? round.round_number : null)}
              animClass={
                exitingNum === round.round_number
                  ? 'animate-card-exit pointer-events-none'
                  : enteringNum === round.round_number
                    ? 'animate-card-enter'
                    : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}

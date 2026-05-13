import { useEffect, useRef } from 'react'
import { Trophy } from 'lucide-react'
import { getRoundName } from '../utils'
import type { TournamentBracket as Bracket, TournamentMatchSlot, TournamentTeam } from '@/types'

const SLOT_H = 88
const BOX_H  = 60
const COL_W  = 152
const CONN_W = 36

function slotCenterY(pos: number, countInRound: number, totalHeight: number): number {
  return ((2 * pos + 1) * totalHeight) / (2 * countInRound)
}

interface ConnectorProps {
  leftSlots: TournamentMatchSlot[]
  rightSlots: TournamentMatchSlot[]
  totalHeight: number
}

function ConnectorLines({ leftSlots, rightSlots, totalHeight }: ConnectorProps) {
  const leftCount = leftSlots.length
  const MID = CONN_W / 2
  const paths: { key: string; d: string; done: boolean }[] = []

  for (const target of rightSlots) {
    if (!target.feeds || target.feeds.length < 2) continue
    const feedTop = leftSlots.find(s => s.id === target.feeds[0])
    const feedBot = leftSlots.find(s => s.id === target.feeds[1])
    if (!feedTop || !feedBot) continue

    const topY = slotCenterY(feedTop.position, leftCount, totalHeight)
    const botY = slotCenterY(feedBot.position, leftCount, totalHeight)
    const midY = (topY + botY) / 2
    const d = [
      `M 0 ${topY} H ${MID}`,
      `M 0 ${botY} H ${MID}`,
      `M ${MID} ${topY} V ${botY}`,
      `M ${MID} ${midY} H ${CONN_W}`,
    ].join(' ')

    const done = feedTop.status === 'done' && feedBot.status === 'done'
    paths.push({ key: target.id, d, done })
  }

  return (
    <svg
      width={CONN_W}
      height={totalHeight}
      aria-hidden="true"
      className="shrink-0 overflow-visible self-start"
      style={{ marginTop: 28 }}
    >
      {paths.map(({ key, d, done }) => (
        <path key={key} d={d} fill="none"
          stroke={done ? 'hsl(var(--primary) / 0.35)' : 'hsl(var(--border))'}
          strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
        />
      ))}
    </svg>
  )
}

interface MatchBoxTeamRowProps {
  team: TournamentTeam | null
  isWinner: boolean
  isBye: boolean
  isDone: boolean
  isPending: boolean
}

function MatchBoxTeamRow({ team, isWinner, isBye, isDone, isPending }: MatchBoxTeamRowProps) {
  if (isBye) return (
    <div className="px-2 py-1.5 text-[11px] text-muted-foreground/40 italic leading-tight">Bye</div>
  )
  return (
    <div className={`px-2 py-1.5 text-[11px] font-medium truncate leading-tight ${
      isWinner  ? 'text-primary font-semibold' :
      isDone    ? 'text-muted-foreground/50 line-through' :
      isPending ? 'text-muted-foreground/40' : ''
    }`}>
      {team?.name ?? <span className="text-muted-foreground/30 italic">TBD</span>}
    </div>
  )
}

interface MatchBoxProps {
  slot: TournamentMatchSlot
  topTeam: TournamentTeam | null
  bottomTeam: TournamentTeam | null
  isActive: boolean
  isChampion?: boolean
}

function MatchBox({ slot, topTeam, bottomTeam, isActive, isChampion }: MatchBoxProps) {
  const isDone    = slot.status === 'done'
  const isPending = slot.status === 'pending'
  const isTopWin  = isDone && slot.winner_id === slot.top_team_id
  const isTopBye  = slot.is_bye && !slot.top_team_id
  const isBotBye  = slot.is_bye && !slot.bottom_team_id

  return (
    <div
      className={[
        'rounded-lg border overflow-hidden bg-background w-full transition-all',
        isChampion ? 'border-yellow-300 animate-gold-glow' :
        isActive   ? 'border-primary ring-2 ring-primary/20 shadow-sm' :
        isDone     ? 'border-border/40 opacity-70' :
        isPending  ? 'border-dashed border-border/30' : 'border-border',
      ].join(' ')}
      style={{ height: BOX_H }}
    >
      <MatchBoxTeamRow team={topTeam}    isWinner={isTopWin}           isBye={isTopBye} isDone={isDone} isPending={isPending} />
      <div className="border-t border-dashed border-border/40 mx-2" />
      <MatchBoxTeamRow team={bottomTeam} isWinner={!isTopWin && isDone} isBye={isBotBye} isDone={isDone} isPending={isPending} />
    </div>
  )
}

interface Props {
  bracket: Bracket
}

export function TournamentBracket({ bracket }: Props) {
  const { match_slots, teams, bracket_size, num_rounds, champion_team_id } = bracket

  const activeIds: Set<string> = new Set(
    bracket.active_match_ids?.length
      ? bracket.active_match_ids
      : bracket.current_match_id
      ? [bracket.current_match_id]
      : []
  )

  const teamsById    = Object.fromEntries(teams.map(t => [t.id, t]))
  const champion     = champion_team_id ? teamsById[champion_team_id] : null
  const totalH       = bracket_size * SLOT_H
  const activeRound  = match_slots.find(s => activeIds.has(s.id))?.round ?? null
  const scrollRef    = useRef<HTMLDivElement>(null)
  const didAutoScroll = useRef(false)

  useEffect(() => {
    if (didAutoScroll.current || !scrollRef.current || activeRound === null) return
    didAutoScroll.current = true
    const el = scrollRef.current
    const colCenter = 16 + (activeRound - 1) * (COL_W + CONN_W) + COL_W / 2
    el.scrollLeft = colCenter - el.clientWidth / 2
  }, [activeRound])

  const rounds = Array.from({ length: num_rounds }, (_, i) =>
    match_slots.filter(s => s.round === i + 1).sort((a, b) => a.position - b.position)
  )

  return (
    <div className="space-y-4">
      {champion && (
        <div className="rounded-xl border-2 border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 px-4 py-3.5 flex items-center gap-3 animate-gold-glow">
          <Trophy className="h-5 w-5 text-yellow-500 shrink-0" />
          <div>
            <p className="text-[10px] font-semibold text-yellow-600 dark:text-yellow-400 uppercase tracking-widest">Champion</p>
            <p className="font-bold text-sm truncate">{champion.name}</p>
          </div>
        </div>
      )}

      {!champion && activeRound !== null && num_rounds > 1 && (
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-foreground shrink-0">
            {getRoundName(activeRound, num_rounds)}
          </span>
          <div className="flex items-center gap-1 flex-1">
            {Array.from({ length: num_rounds }, (_, i) => {
              const r = i + 1
              return (
                <div
                  key={i}
                  className={[
                    'h-1.5 rounded-full transition-all duration-300',
                    r < activeRound   ? 'flex-1 bg-primary/35' :
                    r === activeRound ? 'flex-[2] bg-primary'  :
                    'flex-1 bg-border/60',
                  ].join(' ')}
                />
              )
            })}
          </div>
          <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
            {activeRound}/{num_rounds}
          </span>
        </div>
      )}

      <div ref={scrollRef} className="overflow-x-auto -mx-4 px-4 pb-2">
        <div className="flex items-start min-w-max">
          {rounds.map((roundSlots, roundIdx) => {
            const countInRound = roundSlots.length
            const roundNum = roundIdx + 1
            return (
              <div key={roundNum} className="flex items-start">
                <div className="flex flex-col" style={{ width: COL_W }}>
                  <p className="text-[10px] font-medium text-muted-foreground text-center mb-2 uppercase tracking-wide">
                    {getRoundName(roundNum, num_rounds)}
                  </p>
                  <div className="relative" style={{ height: totalH }}>
                    {roundSlots.map(slot => {
                      const centerY    = slotCenterY(slot.position, countInRound, totalH)
                      const topY       = centerY - BOX_H / 2
                      const isActive   = activeIds.has(slot.id)
                      const isChampion = !!champion && slot.round === num_rounds && slot.status === 'done'
                      return (
                        <div key={slot.id} className="absolute w-full" style={{ top: topY }}>
                          <MatchBox
                            slot={slot}
                            topTeam={slot.top_team_id ? teamsById[slot.top_team_id] : null}
                            bottomTeam={slot.bottom_team_id ? teamsById[slot.bottom_team_id] : null}
                            isActive={isActive}
                            isChampion={isChampion}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>

                {roundIdx < rounds.length - 1 && (
                  <ConnectorLines
                    leftSlots={roundSlots}
                    rightSlots={rounds[roundIdx + 1]}
                    totalHeight={totalH}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

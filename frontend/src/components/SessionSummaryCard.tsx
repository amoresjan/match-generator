import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Player, Round } from '@/lib/types'

interface PlayerStat {
  player: Player
  played: number
  wins: number
  losses: number
}

function computeStats(players: Player[], rounds: Round[]): PlayerStat[] {
  const stats = new Map<string, PlayerStat>(
    players.map((p) => [p.id, { player: p, played: 0, wins: 0, losses: 0 }])
  )
  for (const round of rounds) {
    for (const match of round.matches) {
      if (match.winner === null) continue
      const winnerIds = match.winner === 'team1' ? match.team1_players : match.team2_players
      const loserIds = match.winner === 'team1' ? match.team2_players : match.team1_players
      for (const id of winnerIds) {
        const s = stats.get(id)
        if (s) { s.played++; s.wins++ }
      }
      for (const id of loserIds) {
        const s = stats.get(id)
        if (s) { s.played++; s.losses++ }
      }
    }
  }
  return [...stats.values()]
    .filter((s) => s.played > 0)
    .sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins
      const aRate = a.played ? a.wins / a.played : 0
      const bRate = b.played ? b.wins / b.played : 0
      return bRate - aRate
    })
}

interface SummaryCardProps {
  sessionName: string
  players: Player[]
  rounds: Round[]
}

const MEDALS = ['🥇', '🥈', '🥉']
const RANK_COLORS: Record<number, { name: string; wins: string; border: string }> = {
  0: { name: '#fbbf24', wins: '#f59e0b', border: 'rgba(251,191,36,0.3)' },
  1: { name: '#cbd5e1', wins: '#94a3b8', border: 'rgba(203,213,225,0.2)' },
  2: { name: '#d97706', wins: '#b45309', border: 'rgba(217,119,6,0.25)' },
}

// All values are ×3 of the 360×640 design to hit 1080×1920 (IG story resolution)
function SummaryCardContent({ sessionName, players, rounds }: SummaryCardProps) {
  const stats = computeStats(players, rounds)
  const totalRounds = rounds.length
  const totalMatches = rounds.reduce((n, r) => n + r.matches.filter((m) => m.winner !== null).length, 0)

  const top3 = stats.slice(0, 3)
  const podiumOrder = [
    top3[1] ? { stat: top3[1], rank: 1 } : null,
    top3[0] ? { stat: top3[0], rank: 0 } : null,
    top3[2] ? { stat: top3[2], rank: 2 } : null,
  ].filter(Boolean) as { stat: PlayerStat; rank: number }[]

  const listStats = stats.slice(3, 10)

  return (
    <div style={{
      width: '1080px',
      height: '1920px',
      position: 'relative',
      color: '#f8fafc',
      fontFamily: '-apple-system, BlinkMacSystemFont, Arial, sans-serif',
      boxSizing: 'border-box',
    }}>
      {/* Background + glow — own overflow context so it never clips content */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(170deg, #0f172a 0%, #1e293b 60%, #0f172a 100%)',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: '-240px', right: '-240px',
          width: '720px', height: '720px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(249,115,22,0.15) 0%, transparent 65%)',
        }} />
      </div>

      {/* Content */}
      <div style={{ position: 'relative', padding: '84px 72px 72px' }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: '66px' }}>
          <div style={{ lineHeight: '48px', marginBottom: '24px' }}>
            <span style={{ fontSize: '39px', fontWeight: 800, color: '#f97316' }}>🔥 Rally</span>
            <span style={{ fontSize: '36px', color: '#475569', marginLeft: '24px' }}>by @amoresjan</span>
          </div>
          <div style={{ fontSize: '72px', fontWeight: 800, color: '#f8fafc', lineHeight: '84px', marginBottom: '12px' }}>
            {sessionName}
          </div>
          <div style={{ fontSize: '36px', color: '#64748b', lineHeight: '54px' }}>
            {totalRounds} round{totalRounds !== 1 ? 's' : ''} · {totalMatches} match{totalMatches !== 1 ? 'es' : ''}
          </div>
        </div>

        {/* ── Podium ── */}
        {podiumOrder.length > 0 && (
          <div style={{ marginBottom: '60px' }}>
            <div style={{ fontSize: '30px', fontWeight: 700, color: '#475569', lineHeight: '42px', marginBottom: '36px' }}>
              TOP PLAYERS
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: '30px' }}>
              {podiumOrder.map(({ stat, rank }) => {
                const colors = RANK_COLORS[rank]
                const isFirst = rank === 0
                return (
                  <div key={stat.player.id} style={{
                    width: isFirst ? '336px' : '294px',
                    flexShrink: 0,
                    textAlign: 'center',
                    background: 'rgba(255,255,255,0.05)',
                    border: `3px solid ${colors.border}`,
                    borderRadius: '36px',
                    padding: isFirst ? '42px 24px 36px' : '33px 24px 30px',
                    boxSizing: 'border-box',
                  }}>
                    <div style={{ fontSize: isFirst ? '72px' : '60px', lineHeight: '1', marginBottom: '24px' }}>
                      {MEDALS[rank]}
                    </div>
                    <div style={{
                      fontSize: isFirst ? '39px' : '36px',
                      fontWeight: 700,
                      color: colors.name,
                      lineHeight: '48px',
                      marginBottom: '18px',
                      wordBreak: 'break-word',
                    }}>
                      {stat.player.name.length > 12 ? stat.player.name.slice(0, 11) + '…' : stat.player.name}
                    </div>
                    <div style={{
                      fontSize: isFirst ? '78px' : '66px',
                      fontWeight: 900,
                      color: colors.wins,
                      lineHeight: '1',
                    }}>
                      {stat.wins}<span style={{ fontSize: isFirst ? '42px' : '36px' }}>W</span>
                    </div>
                    <div style={{ fontSize: '30px', color: '#64748b', lineHeight: '42px', marginTop: '12px' }}>
                      {stat.losses}L · {stat.played}GP
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Positions 4–10 ── */}
        {listStats.length > 0 && (
          <div style={{
            background: 'rgba(255,255,255,0.03)',
            border: '3px solid rgba(255,255,255,0.07)',
            borderRadius: '30px',
            overflow: 'hidden',
          }}>
            {listStats.map((s, i) => (
              <div key={s.player.id} style={{
                padding: '24px 42px',
                borderBottom: i < listStats.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                lineHeight: '60px',
              }}>
                <span style={{ fontSize: '33px', color: '#475569', fontWeight: 600, display: 'inline-block', width: '66px' }}>
                  {i + 4}
                </span>
                <span style={{ fontSize: '39px', fontWeight: 600, color: '#cbd5e1' }}>
                  {s.player.name}
                </span>
                <span style={{ fontSize: '39px', fontWeight: 700, color: '#4ade80', float: 'right', marginLeft: '24px' }}>
                  {s.wins}W
                </span>
                <span style={{ fontSize: '36px', color: '#475569', float: 'right' }}>
                  {s.losses}L
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function SessionSummaryCard({ sessionName, players, rounds }: SummaryCardProps) {
  const [exporting, setExporting] = useState(false)

  async function handleDownload() {
    setExporting(true)
    try {
      const html2canvas = (await import('html2canvas')).default

      const wrapper = document.createElement('div')
      wrapper.style.cssText = 'position:fixed;top:0;left:0;z-index:-9999;pointer-events:none;'
      document.body.appendChild(wrapper)

      const root = createRoot(wrapper)
      root.render(
        <div style={{ display: 'inline-block' }}>
          <SummaryCardContent sessionName={sessionName} players={players} rounds={rounds} />
        </div>
      )

      await new Promise((r) => setTimeout(r, 150))

      const cardEl = wrapper.firstElementChild as HTMLElement
      const canvas = await html2canvas(cardEl, {
        scale: 1,
        useCORS: true,
        backgroundColor: '#0f172a',
        logging: false,
        width: 1080,
        height: 1920,
      })

      const url = canvas.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = url
      a.download = `${sessionName.replace(/\s+/g, '-').toLowerCase()}-summary.png`
      a.click()

      root.unmount()
      document.body.removeChild(wrapper)
    } catch (err) {
      console.error('Export failed', err)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="rounded-lg border border-dashed p-3 flex items-center justify-between gap-3">
      <p className="text-xs text-muted-foreground">
        📸 Want to share this on your IG story?
      </p>
      <Button size="sm" variant="outline" onClick={handleDownload} disabled={exporting} className="shrink-0">
        <Download className="h-3.5 w-3.5 mr-1.5" />
        {exporting ? 'Saving…' : 'Save image'}
      </Button>
    </div>
  )
}

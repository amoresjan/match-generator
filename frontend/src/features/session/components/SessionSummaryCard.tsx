import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/lib/toast'
import { computeStats } from '@/lib/utils'
import type { PlayerStat } from '@/lib/utils'
import type { Player, Round } from '@/types'

interface SummaryCardProps {
  sessionName: string
  players: Player[]
  rounds: Round[]
  sportType?: string
  generationMode?: string
  sessionMode?: string
  matchType?: string
}

type SportPalette = { primary: string; vivid: string; tint: string; glow: string }

const SPORT_PALETTE: Record<string, SportPalette> = {
  pickleball: { primary: '#16a34a', vivid: '#22c55e', tint: 'rgba(22,163,74,0.13)',   glow: 'rgba(22,163,74,0.18)' },
  tennis:     { primary: '#8fb30e', vivid: '#b0d620', tint: 'rgba(143,179,14,0.13)',  glow: 'rgba(143,179,14,0.18)' },
  badminton:  { primary: '#1a65e0', vivid: '#4a88f5', tint: 'rgba(26,101,224,0.14)',  glow: 'rgba(26,101,224,0.2)' },
  ping_pong:  { primary: '#ce2316', vivid: '#f04234', tint: 'rgba(206,35,22,0.13)',   glow: 'rgba(206,35,22,0.18)' },
  padel:      { primary: '#1c867c', vivid: '#20a89c', tint: 'rgba(28,134,124,0.13)',  glow: 'rgba(28,134,124,0.18)' },
  others:     { primary: '#6839c5', vivid: '#9b6dea', tint: 'rgba(104,57,197,0.13)', glow: 'rgba(104,57,197,0.18)' },
}

const SPORT_LABELS: Record<string, string> = {
  pickleball: 'Pickleball', tennis: 'Tennis', badminton: 'Badminton',
  ping_pong: 'Ping Pong', padel: 'Padel', others: 'Others',
}

const BG       = '#060d1a'
const SURFACE  = 'rgba(255,255,255,0.04)'
const BORDER   = 'rgba(255,255,255,0.07)'
const MUTED    = '#364560'
const DIM      = '#8899bb'
const WHITE    = '#eef3ff'

function clip(name: string, max: number) {
  return name.length > max ? name.slice(0, max - 1) + '…' : name
}

function Badge({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <div style={{
      display: 'inline-block',
      background: bg,
      color,
      fontSize: '22px',
      fontWeight: 700,
      letterSpacing: '2.5px',
      padding: '10px 26px',
      borderRadius: '100px',
    }}>
      {label}
    </div>
  )
}

// 1080×1920 — Instagram Story
// Safe zone: 120px top, 120px bottom (plus absolute-positioned footer)
function SummaryCardContent({
  sessionName, players, rounds,
  sportType = 'pickleball',
  generationMode = 'fair',
  sessionMode = 'rotation',
  matchType = '2v2',
}: SummaryCardProps) {
  const stats    = computeStats(players, rounds)
  const totalRounds  = rounds.length
  const totalMatches = rounds.reduce((n, r) => n + r.matches.filter((m) => m.winner !== null).length, 0)

  const palette    = SPORT_PALETTE[sportType] ?? SPORT_PALETTE.pickleball
  const sportLabel = SPORT_LABELS[sportType] ?? 'Sport'
  const modeLabel  = sessionMode === 'tournament' ? 'Tournament'
    : generationMode === 'competitive' ? 'Competitive'
    : 'Fair Rotation'

  const winner    = stats[0] ?? null
  const second    = stats[1] ?? null
  const third     = stats[2] ?? null
  const listStats = stats.slice(3, 8)  // positions 4–8

  return (
    <div style={{
      width: '1080px', height: '1920px', position: 'relative',
      fontFamily: 'system-ui, -apple-system, Arial, Helvetica, sans-serif',
      background: BG, color: WHITE, boxSizing: 'border-box', overflow: 'hidden',
    }}>

      {/* ── Corner glow ── */}
      <div style={{
        position: 'absolute', top: '-200px', right: '-200px',
        width: '700px', height: '700px', borderRadius: '50%',
        background: `radial-gradient(circle, ${palette.glow} 0%, transparent 65%)`,
        pointerEvents: 'none',
      }} />

      {/* ── Content ── */}
      <div style={{ padding: '120px 72px 0', position: 'relative' }}>

        {/* Top label row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '44px', flexWrap: 'wrap' }}>
          <Badge label="RALLY" color="#ffffff" bg={palette.primary} />
          <Badge label={sportLabel.toUpperCase()} color={DIM} bg={SURFACE} />
          <Badge label={matchType} color={DIM} bg={SURFACE} />
          <Badge label={modeLabel.toUpperCase()} color={DIM} bg={SURFACE} />
        </div>

        {/* Session name */}
        <div style={{
          fontSize: '64px', fontWeight: 800, color: WHITE,
          lineHeight: '72px', letterSpacing: '-1.5px', marginBottom: '14px',
        }}>
          {clip(sessionName, 28)}
        </div>

        {/* Session meta */}
        <div style={{ fontSize: '28px', color: MUTED, fontWeight: 500, marginBottom: '52px' }}>
          {`${totalRounds} round${totalRounds !== 1 ? 's' : ''} · ${totalMatches} match${totalMatches !== 1 ? 'es' : ''} played`}
        </div>

        {/* ── Winner block ── */}
        {winner && (
          <div style={{
            background: palette.tint,
            borderRadius: '36px',
            borderTop: `5px solid ${palette.primary}`,
            padding: '40px 56px 44px',
            marginBottom: '20px',
            position: 'relative',
            overflow: 'hidden',
            boxSizing: 'border-box',
          }}>
            {/* Inner bottom glow */}
            <div style={{
              position: 'absolute', bottom: '-80px', left: '-80px',
              width: '400px', height: '400px', borderRadius: '50%',
              background: `radial-gradient(circle, ${palette.glow} 0%, transparent 65%)`,
              pointerEvents: 'none',
            }} />

            <div style={{
              fontSize: '20px', fontWeight: 700,
              color: palette.vivid, letterSpacing: '5px', marginBottom: '14px',
            }}>
              CHAMPION
            </div>

            <div style={{
              fontSize: '92px', fontWeight: 800, color: WHITE,
              lineHeight: '100px', letterSpacing: '-2px', marginBottom: '22px',
              wordBreak: 'break-word',
            }}>
              {clip(winner.player.name, 13)}
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: '20px' }}>
              <span style={{
                fontSize: '144px', fontWeight: 900,
                color: palette.vivid, lineHeight: '1', letterSpacing: '-4px',
              }}>
                {winner.wins}
              </span>
              <div>
                <div style={{
                  fontSize: '34px', fontWeight: 700,
                  color: palette.primary, letterSpacing: '3px',
                }}>
                  WINS
                </div>
                <div style={{ fontSize: '27px', color: MUTED, marginTop: '10px' }}>
                  {`${winner.losses}L · ${winner.played} games`}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── 2nd + 3rd ── */}
        {(second || third) && (
          <div style={{ display: 'flex', gap: '20px', marginBottom: '36px' }}>
            {([second, third] as (PlayerStat | null)[]).map((stat, idx) => {
              if (!stat) return <div key={idx} style={{ flex: 1 }} />
              const rank = idx + 2
              const rankLabel  = rank === 2 ? '2ND' : '3RD'
              const rankColor  = rank === 2 ? '#b8c8e0' : '#9a7848'
              return (
                <div key={stat.player.id} style={{
                  flex: 1,
                  background: SURFACE,
                  border: `1px solid ${BORDER}`,
                  borderRadius: '28px',
                  padding: '30px 36px 34px',
                  boxSizing: 'border-box',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    fontSize: '18px', fontWeight: 700,
                    color: rankColor, letterSpacing: '4px', marginBottom: '12px',
                  }}>
                    {rankLabel}
                  </div>
                  <div style={{
                    fontSize: '48px', fontWeight: 800, color: WHITE,
                    lineHeight: '54px', letterSpacing: '-1px', marginBottom: '16px',
                    wordBreak: 'break-word',
                  }}>
                    {clip(stat.player.name, 11)}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
                    <span style={{
                      fontSize: '76px', fontWeight: 900,
                      color: rankColor, lineHeight: '1', letterSpacing: '-2px',
                    }}>
                      {stat.wins}
                    </span>
                    <div>
                      <div style={{ fontSize: '22px', fontWeight: 700, color: MUTED, letterSpacing: '2px' }}>WINS</div>
                      <div style={{ fontSize: '22px', color: MUTED, marginTop: '4px' }}>{stat.losses}L</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Standings list ── */}
        {listStats.length > 0 && (
          <>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '24px',
            }}>
              <div style={{ flex: 1, height: '1px', background: BORDER }} />
              <div style={{ fontSize: '18px', fontWeight: 700, color: MUTED, letterSpacing: '4px' }}>
                STANDINGS
              </div>
              <div style={{ flex: 1, height: '1px', background: BORDER }} />
            </div>

            {listStats.map((s, i) => (
              <div key={s.player.id} style={{
                display: 'flex', alignItems: 'center',
                padding: '16px 0',
                borderBottom: i < listStats.length - 1 ? `1px solid ${BORDER}` : 'none',
              }}>
                <span style={{
                  width: '68px', fontSize: '26px', fontWeight: 700,
                  color: MUTED, flexShrink: 0, letterSpacing: '1px',
                }}>
                  {i + 4}
                </span>
                <span style={{ flex: 1, fontSize: '37px', fontWeight: 600, color: '#c0cee6' }}>
                  {clip(s.player.name, 18)}
                </span>
                <span style={{ fontSize: '37px', fontWeight: 700, color: palette.primary, marginLeft: '14px' }}>
                  {s.wins}W
                </span>
                <span style={{ fontSize: '32px', fontWeight: 500, color: MUTED, marginLeft: '14px', width: '64px', textAlign: 'right' }}>
                  {s.losses}L
                </span>
              </div>
            ))}
          </>
        )}
      </div>

      {/* ── Footer ── */}
      <div style={{
        position: 'absolute', bottom: '120px', left: '72px', right: '72px',
        borderTop: `1px solid ${BORDER}`,
        paddingTop: '36px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ fontSize: '27px', color: MUTED }}>
          match.amoresjan.dev
        </div>
        <div style={{
          fontSize: '27px', fontWeight: 800,
          color: palette.primary, letterSpacing: '3px',
        }}>
          RALLY
        </div>
      </div>
    </div>
  )
}

export function SessionSummaryCard({ sessionName, players, rounds, sportType, generationMode, sessionMode, matchType }: SummaryCardProps) {
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
          <SummaryCardContent
            sessionName={sessionName}
            players={players}
            rounds={rounds}
            sportType={sportType}
            generationMode={generationMode}
            sessionMode={sessionMode}
            matchType={matchType}
          />
        </div>
      )

      await new Promise((r) => setTimeout(r, 150))

      const cardEl = wrapper.firstElementChild as HTMLElement
      const canvas = await html2canvas(cardEl, {
        scale: 1,
        useCORS: true,
        backgroundColor: BG,
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
      toast.success('Image saved!')
    } catch (err) {
      console.error('Export failed', err)
      toast.error('Export failed — please try again')
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

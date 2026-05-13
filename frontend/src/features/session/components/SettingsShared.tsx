import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { toast } from '@/lib/toast'
import type { Session } from '@/types'

export function ShareField({ session }: { session: Session }) {
  const [copied, setCopied] = useState(false)
  const link = `${window.location.origin}/session/${session.id}`

  const isTournamentMode = session.session_mode === 'tournament'
  const modeEmoji = isTournamentMode ? '🎖️' : session.generation_mode === 'competitive' ? '🏆' : '🔄'
  const modeLabel = isTournamentMode ? 'Tournament' : session.generation_mode === 'competitive' ? 'Competitive' : 'Fair Rotation'
  const typeEmoji = session.match_type === '2v2' ? '👥' : '👤'

  const message = `${session.name}\n${modeEmoji} ${modeLabel}\n${typeEmoji} ${session.match_type}\n\nSee live matches: ${link}`

  function copy() {
    navigator.clipboard.writeText(message)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('Copied to clipboard')
  }

  return (
    <div className="rounded-xl border bg-background overflow-hidden">
      <div className="px-4 py-4 space-y-1">
        <p className="font-bold text-sm leading-snug break-words">{session.name}</p>
        <p className="text-sm">{modeEmoji} {modeLabel}</p>
        <p className="text-sm">{typeEmoji} {session.match_type}</p>
        <p className="text-sm pt-2 text-muted-foreground break-all">See live matches: {link}</p>
      </div>
      <div className="border-t" />
      <button
        onClick={copy}
        className="w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold text-primary hover:bg-muted/50 active:bg-muted transition-colors"
      >
        {copied
          ? <><Check className="h-4 w-4" /> Copied!</>
          : <><Copy className="h-4 w-4" /> Copy Message</>
        }
      </button>
    </div>
  )
}

export function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)

  function copy() {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('Copied to clipboard')
  }

  return (
    <div className="rounded-xl border bg-background overflow-hidden">
      <div className="px-4 py-4">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <p className="text-sm font-mono break-all">{value}</p>
      </div>
      <div className="border-t" />
      <button
        onClick={copy}
        className="w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold text-primary hover:bg-muted/50 active:bg-muted transition-colors"
      >
        {copied
          ? <><Check className="h-4 w-4" /> Copied!</>
          : <><Copy className="h-4 w-4" /> Copy Code</>
        }
      </button>
    </div>
  )
}

export function SettingsGroup({ title, children, primary }: { title: string; children: React.ReactNode; primary?: boolean }) {
  return (
    <div className="space-y-2">
      <p className={`uppercase tracking-wide px-0.5 ${
        primary
          ? 'text-sm font-semibold text-foreground'
          : 'text-xs font-medium text-muted-foreground'
      }`}>
        {title}
      </p>
      {children}
    </div>
  )
}

export function SettingsRows({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border overflow-hidden divide-y divide-border bg-background">
      {children}
    </div>
  )
}

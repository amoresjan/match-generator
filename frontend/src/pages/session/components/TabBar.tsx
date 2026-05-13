import { RefreshCw, Settings, Users, Clock, Trophy, Swords } from 'lucide-react'
import type { Session } from '@/types'

export type Tab = 'round' | 'players' | 'history' | 'leaderboard' | 'settings' | 'bracket' | 'courts'

interface TabDef {
  key: Tab
  label: string
  icon: React.ReactNode
}

export const ROTATION_TABS: TabDef[] = [
  { key: 'round',       label: 'Round',    icon: <RefreshCw className="h-4 w-4" /> },
  { key: 'players',     label: 'Players',  icon: <Users className="h-4 w-4" /> },
  { key: 'history',     label: 'History',  icon: <Clock className="h-4 w-4" /> },
  { key: 'leaderboard', label: 'Ranks',    icon: <Trophy className="h-4 w-4" /> },
  { key: 'settings',    label: 'Settings', icon: <Settings className="h-4 w-4" /> },
]

export const TOURNAMENT_TABS: TabDef[] = [
  { key: 'courts',   label: 'Courts',   icon: <Swords className="h-4 w-4" /> },
  { key: 'bracket',  label: 'Bracket',  icon: <Trophy className="h-4 w-4" /> },
  { key: 'players',  label: 'Players',  icon: <Users className="h-4 w-4" /> },
  { key: 'settings', label: 'Settings', icon: <Settings className="h-4 w-4" /> },
]

interface Props {
  tabs: TabDef[]
  activeTab: Tab
  onTabChange: (tab: Tab) => void
  session: Session
}

export function TabBar({ tabs, activeTab, onTabChange, session }: Props) {
  const tabOrder = tabs.map((t) => t.key)

  return (
    <nav className="bg-background">
      <div role="tablist" className="relative flex max-w-2xl mx-auto border-b">
        {tabs.map((t) => (
          <button
            key={t.key}
            id={`tab-${t.key}`}
            role="tab"
            aria-selected={activeTab === t.key}
            aria-controls="tab-panel"
            onClick={() => onTabChange(t.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
              activeTab === t.key
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
        <div
          aria-hidden="true"
          className="tab-indicator pointer-events-none absolute bottom-0 left-0 h-0.5 bg-primary"
          style={{
            width: `${100 / tabs.length}%`,
            transform: `translateX(${tabOrder.indexOf(activeTab) * 100}%)`,
          }}
        />
      </div>
      {!session.is_active && (
        <div className="border-b bg-muted px-4 py-2.5 text-center text-sm text-muted-foreground">
          {session.auto_deactivated
            ? 'Session ended. History and past rounds are still viewable.'
            : 'Closed by the host. History and past rounds are still viewable.'}
        </div>
      )}
    </nav>
  )
}

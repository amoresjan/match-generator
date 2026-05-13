import { useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/hooks/useTheme'
import { PushNotificationSettings } from '@/features/notifications/components/PushNotificationSettings'
import { AdminCodeEntry } from './AdminCodeEntry'
import { ShareField, SettingsGroup, SettingsRows } from './SettingsShared'
import type { Session } from '@/types'

interface Props {
  sessionId: string
  session: Session
  onUnlocked: () => void
  claimedPlayerId: string | null
}

export function GuestSettings({ sessionId, session, onUnlocked, claimedPlayerId }: Props) {
  const { theme, toggle: toggleTheme } = useTheme()
  const navigate = useNavigate()

  return (
    <div className="space-y-8">
      <SettingsGroup title="Preferences">
        <SettingsRows>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm">Dark mode</span>
            <Switch checked={theme === 'dark'} onCheckedChange={toggleTheme} />
          </div>
          <PushNotificationSettings sessionId={sessionId} claimedPlayerId={claimedPlayerId} />
        </SettingsRows>
      </SettingsGroup>

      <div className="space-y-4">
        <SettingsGroup title="Share">
          <ShareField session={session} />
        </SettingsGroup>

        <SettingsGroup title="Host Access">
          <div className="space-y-1.5">
            <div className="rounded-xl border px-4 py-3">
              <AdminCodeEntry sessionId={sessionId} onUnlocked={onUnlocked} />
            </div>
            <p className="text-xs text-muted-foreground px-0.5">The host can share an admin code to let you manage the session.</p>
          </div>
        </SettingsGroup>
      </div>

      <Button className="w-full" variant="outline" onClick={() => navigate('/')}>
        <LogOut className="h-4 w-4 mr-2" />
        Leave Session
      </Button>
      <p className="text-center text-xs text-muted-foreground/60 pt-2">
        by <a href="https://amoresjan.dev" target="_blank" rel="noreferrer" className="underline underline-offset-2">@amoresjan</a> · <a href="https://forms.gle/bFa9PwrG3DweFfnZ9" target="_blank" rel="noreferrer" className="underline underline-offset-2">Give feedback</a>
      </p>
    </div>
  )
}

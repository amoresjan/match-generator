import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useTheme } from '@/hooks/useTheme'
import { SPORTS, type SportType } from '@/lib/sports'
import { getAdminToken } from '@/lib/api'
import { PushNotificationSettings } from '@/features/notifications/components/PushNotificationSettings'
import { ShareField, CopyField, SettingsGroup, SettingsRows } from './SettingsShared'
import type { Session } from '@/types'

interface Props {
  sessionId: string
  session: Session
  onSave: (data: Partial<{ name: string; match_type: '1v1' | '2v2'; num_courts: number; generation_mode: 'fair' | 'competitive'; sport_type: string }>) => void
  saving: boolean
  onSetActive: (isActive: boolean) => void
  settingActive: boolean
  claimedPlayerId: string | null
}

export function SessionSettings({ sessionId, session, onSave, saving, onSetActive, settingActive, claimedPlayerId }: Props) {
  const [name, setName] = useState(session.name)
  const [sport, setSport] = useState<SportType>(session.sport_type)
  const [matchType, setMatchType] = useState<'1v1' | '2v2'>(session.match_type)
  const [numCourts, setNumCourts] = useState(String(session.num_courts))
  const [mode, setMode] = useState<'fair' | 'competitive'>(session.generation_mode)
  const [confirmClose, setConfirmClose] = useState(false)
  const { theme, toggle: toggleTheme } = useTheme()
  const navigate = useNavigate()

  const isTournament = session.session_mode === 'tournament'
  const bracketLocked = isTournament && !!session.tournament_data

  useEffect(() => {
    setName(session.name)
    setSport(session.sport_type)
    setMatchType(session.match_type)
    setNumCourts(String(session.num_courts))
    setMode(session.generation_mode)
  }, [session.name, session.sport_type, session.match_type, session.num_courts, session.generation_mode])

  const adminToken = getAdminToken(sessionId) ?? ''
  const fieldDisabled = !session.is_active || bracketLocked

  const parsedCourts = Math.max(1, Math.min(8, parseInt(numCourts) || 1))
  const hasChanges = session.is_active && !bracketLocked && (
    name !== session.name ||
    sport !== session.sport_type ||
    matchType !== session.match_type ||
    parsedCourts !== session.num_courts ||
    mode !== session.generation_mode
  )

  function handleSave() {
    onSave({ name, sport_type: sport, match_type: matchType, num_courts: parsedCourts, generation_mode: mode })
  }

  return (
    <div className="space-y-8">

      <SettingsGroup title="Game" primary>
        {bracketLocked && (
          <div className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
            Settings are locked while a tournament bracket is active.
          </div>
        )}
        {!bracketLocked && !session.is_active && (
          <div className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
            Reopen the session to edit settings.
          </div>
        )}
        <SettingsRows>
          <div className="px-4 py-3">
            <p className="text-xs text-muted-foreground mb-2">Sport</p>
            <div className="grid grid-cols-3 gap-1.5">
              {SPORTS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => !fieldDisabled && setSport(s.value)}
                  disabled={fieldDisabled}
                  className={`flex flex-col items-center gap-0.5 rounded-lg border p-2 text-xs transition-colors disabled:opacity-50 ${
                    sport === s.value
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'border-border hover:border-muted-foreground/40'
                  }`}
                >
                  <span className="text-base leading-none">{s.emoji}</span>
                  <span>{s.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="px-4 py-3">
            <label className="text-xs text-muted-foreground mb-1 block">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={fieldDisabled}
              maxLength={50}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {name.length}/50 characters
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 px-4 py-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Match Type</label>
              <Select value={matchType} onValueChange={(v) => setMatchType(v as '1v1' | '2v2')} disabled={fieldDisabled}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="2v2">2v2</SelectItem>
                  <SelectItem value="1v1">1v1</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Courts</label>
              <Input
                type="text"
                inputMode="numeric"
                value={numCourts}
                onChange={(e) => setNumCourts(e.target.value.replace(/\D/g, ''))}
                disabled={fieldDisabled}
              />
              {numCourts && (parsedCourts < 1 || parsedCourts > 8 || parsedCourts !== parseInt(numCourts)) ? (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  Will be saved as {parsedCourts} (1–8 courts allowed)
                </p>
              ) : (
                <p className="text-xs text-muted-foreground mt-1">1–8 courts</p>
              )}
            </div>
          </div>
          {!isTournament && (
            <div className="px-4 py-3">
              <label className="text-xs text-muted-foreground mb-1 block">Mode</label>
              <Select value={mode} onValueChange={(v) => setMode(v as 'fair' | 'competitive')} disabled={fieldDisabled}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fair">Fair Rotation</SelectItem>
                  <SelectItem value="competitive">Competitive</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1.5">
                {mode === 'competitive'
                  ? 'Players are matched by win count — top players face each other, bottom players face each other.'
                  : 'Everyone gets equal court time and varied opponents. Best for casual play.'}
              </p>
            </div>
          )}
        </SettingsRows>
        {session.is_active && !bracketLocked && (
          <div className="space-y-1.5">
            <p className={`text-xs text-amber-600 dark:text-amber-400 transition-opacity ${hasChanges ? 'opacity-100' : 'opacity-0'}`}>
              ● Unsaved changes
            </p>
            <Button className="w-full" onClick={handleSave} disabled={saving || !hasChanges}>
              {saving ? 'Saving…' : 'Save Settings'}
            </Button>
          </div>
        )}
      </SettingsGroup>

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
          <CopyField label="Admin Code" value={adminToken} />
          <p className="text-xs text-muted-foreground px-0.5">Share with co-hosts to give them admin access.</p>
        </SettingsGroup>
      </div>

      {session.is_active && (
        <SettingsGroup title="Session" primary>
          <Button
            className="w-full"
            variant="destructive"
            onClick={() => setConfirmClose(true)}
            disabled={settingActive}
          >
            Close Session
          </Button>
          <p className="text-xs text-muted-foreground">
            Players will no longer be able to generate new rounds. You can reopen it afterwards.
          </p>
        </SettingsGroup>
      )}

      {!session.is_active && (
        <SettingsGroup title="Session" primary>
          <div className="rounded-xl border px-4 py-3 text-sm text-muted-foreground">
            {session.auto_deactivated
              ? 'This session was closed automatically and cannot be reopened.'
              : 'This session is closed.'}
          </div>
          {!session.auto_deactivated && (
            <Button
              className="w-full"
              variant="outline"
              onClick={() => onSetActive(true)}
              disabled={settingActive}
            >
              {settingActive ? 'Reopening…' : 'Reopen Session'}
            </Button>
          )}
        </SettingsGroup>
      )}

      <div className="pt-2">
        <Button className="w-full" variant="outline" onClick={() => navigate('/')}>
          <LogOut className="h-4 w-4 mr-2" />
          Leave Session
        </Button>
      </div>

      <Dialog open={confirmClose} onOpenChange={setConfirmClose}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Close this session?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            No new rounds can be generated once closed. You can reopen it from Settings.
          </p>
          <div className="flex gap-2 justify-end mt-2">
            <Button variant="outline" onClick={() => setConfirmClose(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={settingActive}
              onClick={() => {
                setConfirmClose(false)
                onSetActive(false)
              }}
            >
              Close Session
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <p className="text-center text-xs text-muted-foreground/60 pt-2">
        by <a href="https://amoresjan.dev" target="_blank" rel="noreferrer" className="underline underline-offset-2">@amoresjan</a> · <a href="https://forms.gle/bFa9PwrG3DweFfnZ9" target="_blank" rel="noreferrer" className="underline underline-offset-2">Give feedback</a>
      </p>
    </div>
  )
}

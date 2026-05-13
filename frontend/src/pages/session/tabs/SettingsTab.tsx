import { SessionSettings } from '@/features/session/components/SessionSettings'
import { GuestSettings } from '@/features/session/components/GuestSettings'
import type { Session } from '@/types'

interface Props {
  sessionId: string
  session: Session
  isAdmin: boolean
  claimedPlayerId: string | null
  onSave: (data: Partial<{ name: string; match_type: '1v1' | '2v2'; num_courts: number; generation_mode: 'fair' | 'competitive'; sport_type: string }>) => void
  saving: boolean
  onSetActive: (isActive: boolean) => void
  settingActive: boolean
  onAdminUnlocked: () => void
}

export function SettingsTab({ sessionId, session, isAdmin, claimedPlayerId, onSave, saving, onSetActive, settingActive, onAdminUnlocked }: Props) {
  if (isAdmin) {
    return (
      <SessionSettings
        sessionId={sessionId}
        session={session}
        onSave={onSave}
        saving={saving}
        onSetActive={onSetActive}
        settingActive={settingActive}
        claimedPlayerId={claimedPlayerId}
      />
    )
  }

  return (
    <GuestSettings
      sessionId={sessionId}
      session={session}
      onUnlocked={onAdminUnlocked}
      claimedPlayerId={claimedPlayerId}
    />
  )
}

import { useEffect } from 'react'
import { getPushSupport, getExistingSubscription, resubscribeToSession } from '@/lib/push'

// Silently registers the browser's existing push subscription for the current
// session whenever the session changes. Runs at the session page level so it
// fires on navigation, not just when the Settings tab is opened.
export function useSessionPushSync(sessionId: string, playerId?: string | null) {
  useEffect(() => {
    if (getPushSupport() !== 'supported') return
    if (Notification.permission !== 'granted') return

    getExistingSubscription().then(sub => {
      if (!sub) return
      resubscribeToSession(sessionId, playerId ?? undefined).catch(() => {
        // Best-effort — if this fails the user can re-enable from Settings.
      })
    })
  }, [sessionId, playerId])
}

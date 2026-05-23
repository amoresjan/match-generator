import { useCallback, useEffect, useState } from 'react'
import {
  detectDevice,
  getExistingSubscription,
  getPushSupport,
  subscribeToPush,
  unsubscribeFromPush,
} from '@/lib/push'

export type PushStatus =
  | 'checking'
  | 'unsupported'
  | 'ios-needs-pwa'
  | 'permission-denied'
  | 'subscribed'
  | 'unsubscribed'

// Settings-tab hook — reads browser state only, never makes API calls on mount.
// Session-level syncing is handled separately by useSessionPushSync.
export function usePushNotifications(sessionId: string, claimedPlayerId?: string | null) {
  const [status, setStatus] = useState<PushStatus>('checking')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    async function check() {
      const support = getPushSupport()
      if (support === 'unsupported') { setStatus('unsupported'); return }
      if (support === 'ios-needs-pwa') { setStatus('ios-needs-pwa'); return }
      if (Notification.permission === 'denied') { setStatus('permission-denied'); return }
      const sub = await getExistingSubscription()
      setStatus(sub ? 'subscribed' : 'unsubscribed')
    }
    check()
  }, [sessionId])

  const subscribe = useCallback(async () => {
    setLoading(true)
    try {
      const ok = await subscribeToPush(sessionId, claimedPlayerId ?? undefined)
      setStatus(ok ? 'subscribed' : 'unsubscribed')
    } catch {
      // Re-check actual browser state (permission may have been denied).
      const support = getPushSupport()
      if (support !== 'supported') setStatus('unsupported')
      else if (Notification.permission === 'denied') setStatus('permission-denied')
      else setStatus('unsubscribed')
    } finally {
      setLoading(false)
    }
  }, [sessionId, claimedPlayerId])

  const unsubscribe = useCallback(async () => {
    setLoading(true)
    try {
      await unsubscribeFromPush(sessionId)
      setStatus('unsubscribed')
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  return { status, loading, subscribe, unsubscribe, device: detectDevice() }
}
